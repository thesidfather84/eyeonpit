/**
 * A PURE, side-effect-free classifier that answers one question for a
 * single candidate transcript: "if this were the only thing the operator
 * said, what would VoiceControl do with it?" It never touches live
 * investigation state (no active target, no seat occupancy, no round) —
 * exactly like parseNarration.ts's own architecture note explains, the
 * safety property here ("does this transcript unambiguously describe a
 * command?") must not depend on what happens to be true in the app right
 * now. This is what makes it safe to run once per ASR alternative, in
 * nBestResolver.ts, before any of them are committed to anything.
 *
 * Mirrors (deliberately, not by re-implementing the logic) the SAME
 * ordered checks VoiceControl.handleFinalResult itself runs, MINUS the two
 * stateful branches that depend on conversation history rather than the
 * transcript text alone: note-mode free dictation (every word is data, not
 * a command, while active) and a pending New-Shoe/End-Investigation
 * confirmation (only meaningful in the context of an immediately preceding
 * question). Both are excluded from N-best resolution on purpose — see
 * nBestResolver.ts's own doc comment — so VoiceControl keeps using
 * alternatives[0] verbatim for those two modes, entirely unchanged.
 *
 * Order (identical to VoiceControl, and to speech -> normalize -> ... ->
 * reject in parseReadOnlyQuery.ts's own doc comment):
 *   note-start phrase -> lifecycle phrase -> table-change -> read-only
 *   query -> set-active-target intent -> narration -> legacy single-command
 *   -> UNKNOWN_COMMAND (or, only when explicitly enabled by the caller, the
 *   dealer-confusion recovery grammar below).
 *
 * CANONICALIZATION (voice reliability spec §1 — the V-000006/V-000018
 * resolver bug): narration and the legacy single-command parser can each
 * independently describe the EXACT SAME resulting action in different
 * shapes — narration's own ops list always carries a leading `selectTarget`
 * op for an explicit target, where the legacy `card` command folds the
 * target directly into one atomic command. Comparing those two
 * representations as raw strings (as this module used to) made "seat one
 * has a five" (deferred by narration to legacy, actionKey "C:SEAT1:5") and
 * "the player in seat one has a five" (kept by narration as its own ops,
 * old actionKey "narration:T:SEAT1|C:SEAT1:5" — narration cannot defer this
 * one to legacy at all, since legacy has no connector-phrase grammar) look
 * like two DIFFERENT actions to the N-best resolver, even though committing
 * either produces the identical net effect: one card, rank 5, on seat 1.
 * `canonicalizeNarrationOps` below fixes this at the source: a
 * `selectTarget` op immediately followed by a `card` op for that SAME
 * target is collapsed into one canonical card step (the card step already
 * carries that target explicitly, so the standalone select is redundant) —
 * for EVERY narration result, not just the ones narration itself would
 * have called "trivial". Legacy commands are run through the identical
 * canonical-step formatter, so two representations of the same action
 * always produce byte-identical `actionKey`/`summary` regardless of which
 * parser produced them.
 */
import { normalizeTranscript } from "./normalizeTranscript";
import {
  parseVoiceCommand,
  normalizeAsrSeatArtifacts,
  containsUncertaintyLanguage,
  FACE_CARD_DISPLAY,
  RANK_WORDS,
  SEAT_PREFIX_WORDS,
  type VoiceTarget,
  type VoiceRank,
  type VoiceCommandKind,
  type AppliedNormalizationRule,
} from "./parseVoiceCommand";
import { parseNarration, type NarrationOp } from "./parseNarration";
import { parseTableChangeCommand } from "./parseTableChangeCommand";
import { parseReadOnlyQuery } from "./parseReadOnlyQuery";
import { parseSetActiveTargetIntent } from "./parseSetActiveTargetIntent";
import {
  NOTE_START_PHRASES,
  NOTE_START_WITH_CONTENT_RE,
  PAUSE_PHRASE,
  RESUME_PHRASE,
  START_COUNT_PHRASE,
  END_COUNT_PHRASE,
  NEW_SHOE_PHRASE,
  CONFIRM_NEW_SHOE_PHRASE,
  END_INVESTIGATION_PHRASE,
  CONFIRM_END_INVESTIGATION_PHRASE,
  FULL_STATUS_PHRASE,
} from "./lifecyclePhrases";
import type { RejectionCode } from "./voiceDiagnosticsTypes";

export type ClassificationSource =
  | "note-start"
  | "lifecycle"
  | "table-change"
  | "read-only-query"
  | "set-active-target"
  | "narration"
  | "legacy"
  | "dealer-confusion-recovery";

export type TranscriptClassification =
  | {
      valid: true;
      source: ClassificationSource;
      /** Canonical key for detecting agreement/conflict between alternatives — see nBestResolver.ts. Two classifications with the same actionKey are considered "the same resulting action" regardless of which source/representation produced them (see this module's own doc comment on canonicalization). */
      actionKey: string;
      /** Short human-readable description for diagnostics ("DEALER: K", "NEXT", "Seat 3 occupied"). */
      summary: string;
      /** True when a dealer/seat target was explicitly named in THIS transcript (vs. a bare card that would resolve against whatever live active target happens to be) — used as a resolver scoring bonus, since an explicit target is strictly less ambiguous. Non-target commands (workflow/query/lifecycle/table-change/note-start) are also `true` here: there is no target-guessing risk for them at all, so they should never be penalized relative to an explicit-target card command. */
      hasExplicitTarget: boolean;
      /** Present only for source "narration" — carries the actual ops so the resolver's winner can be committed via the existing commitNarration path without re-parsing. */
      narrationOps?: NarrationOp[];
      /** Present only for source "dealer-confusion-recovery" — see tryDealerConfusionRecovery's own doc comment. Diagnostic-only: identifies exactly which confusion token was rescued (e.g. "DEALER_ASR_TAYLOR"), so the log always shows when EyeOnPit rescued a misheard "dealer" rather than silently treating it as an ordinary match. */
      recoveryRuleId?: string;
      /** Present only for source "dealer-confusion-recovery" — the actual command to dispatch, exactly like `narrationOps` above. Required because the recovered ACTION has no faithful re-parseable text form: the winning transcript still literally says "Taylor"/"Spotify", which the ordinary parsers (correctly) don't understand — VoiceControl must dispatch this directly rather than re-parsing winningTranscript. */
      recoveredCommand?: VoiceCommandKind;
      /** Every ASR-artifact substitution normalizeAsrSeatArtifacts applied while classifying THIS transcript (voice reliability spec §5) — e.g. "set"->"seat", "start"->"spot". Always present (possibly empty); diagnostic-only, never consulted by any parsing/dispatch decision. See diagnoseNormalization below. */
      appliedRules: AppliedNormalizationRule[];
    }
  | { valid: false; code: RejectionCode; reason: string; appliedRules: AppliedNormalizationRule[] };

/**
 * The same shape as TranscriptClassification, minus `appliedRules` — used
 * internally by classifyCore/recoverDealerConfusionCore below, which have
 * no need to compute it themselves (it's derived once, from the ORIGINAL
 * raw transcript, by the two public wrappers — classifyVoiceTranscript and
 * tryDealerConfusionRecovery — via diagnoseNormalization). Kept as an
 * explicit separate type rather than `Omit<TranscriptClassification, ...>`:
 * `keyof` a union only sees keys common to every member, which would
 * collapse this to almost nothing.
 */
type CoreClassification =
  | {
      valid: true;
      source: ClassificationSource;
      actionKey: string;
      summary: string;
      hasExplicitTarget: boolean;
      narrationOps?: NarrationOp[];
      recoveryRuleId?: string;
      recoveredCommand?: VoiceCommandKind;
    }
  | { valid: false; code: RejectionCode; reason: string };

/** Re-derives which ASR-artifact substitutions normalizeAsrSeatArtifacts would apply to `rawTranscript` — a second, diagnostic-only call (see normalizeAsrSeatArtifacts's own doc comment on `onRuleApplied`), never the one whose output is actually parsed. Cheap and side-effect-free; safe to call as often as needed. */
export function diagnoseNormalization(rawTranscript: string): AppliedNormalizationRule[] {
  const rules: AppliedNormalizationRule[] = [];
  normalizeAsrSeatArtifacts(normalizeTranscript(rawTranscript), (rule) => rules.push(rule));
  return rules;
}

function targetSummary(target: VoiceTarget): string {
  return target.kind === "dealer" ? "DEALER" : `SEAT${target.seat}`;
}

/** A parser-agnostic description of one resulting effect — see this module's own doc comment on canonicalization. `target` is always a resolved label ("DEALER"/"SEAT3") or the literal string "active" for a card with no target in this transcript (resolved against whatever's live-active at commit time). */
type CanonicalStep =
  | { kind: "select"; target: string }
  | { kind: "card"; target: string; rank: VoiceRank; displayRank?: string }
  | { kind: "workflow"; action: string };

/**
 * Collapses a narration op list into canonical steps: a `selectTarget` op
 * immediately followed by a `card` op for that SAME target is dropped (the
 * card step's own `target` field already carries it) — this is what makes
 * "the player in seat one has a five" canonicalize identically to "seat one
 * has a five", even though only the latter is trivial enough for narration
 * itself to defer to legacy. A `selectTarget` NOT immediately followed by
 * its own matching card (a bare target, or one followed by a workflow word,
 * or by a DIFFERENT target) is a real, distinct effect and stays its own
 * step.
 */
function canonicalizeNarrationOps(ops: NarrationOp[]): CanonicalStep[] {
  const steps: CanonicalStep[] = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op.kind === "selectTarget") {
      const targetLabel = targetSummary(op.target);
      const next = ops[i + 1];
      if (next && next.kind === "card" && next.target && targetSummary(next.target) === targetLabel) {
        continue; // redundant — the very next step already encodes this exact target
      }
      steps.push({ kind: "select", target: targetLabel });
      continue;
    }
    if (op.kind === "card") {
      steps.push({ kind: "card", target: op.target ? targetSummary(op.target) : "active", rank: op.rank, displayRank: op.displayRank });
      continue;
    }
    steps.push({ kind: "workflow", action: op.action });
  }
  return steps;
}

function canonicalActionKey(steps: CanonicalStep[]): string {
  return steps
    .map((s) => (s.kind === "select" ? `T:${s.target}` : s.kind === "card" ? `C:${s.target}:${s.rank}` : `W:${s.action}`))
    .join("|");
}

function canonicalSummary(steps: CanonicalStep[]): string {
  return steps
    .map((s) =>
      s.kind === "select" ? s.target : s.kind === "card" ? `${s.target === "active" ? "ACTIVE" : s.target}:${s.displayRank ?? s.rank}` : s.action.toUpperCase()
    )
    .join(" ");
}

function canonicalHasExplicitTarget(steps: CanonicalStep[]): boolean {
  return steps.every((s) => s.kind !== "card" || s.target !== "active");
}

function fromSteps(
  source: ClassificationSource,
  steps: CanonicalStep[],
  extra?: { narrationOps?: NarrationOp[]; recoveryRuleId?: string; recoveredCommand?: VoiceCommandKind }
): CoreClassification {
  return {
    valid: true,
    source,
    actionKey: canonicalActionKey(steps),
    summary: canonicalSummary(steps),
    hasExplicitTarget: canonicalHasExplicitTarget(steps),
    ...(extra?.narrationOps ? { narrationOps: extra.narrationOps } : {}),
    ...(extra?.recoveryRuleId ? { recoveryRuleId: extra.recoveryRuleId } : {}),
    ...(extra?.recoveredCommand ? { recoveredCommand: extra.recoveredCommand } : {}),
  };
}

/**
 * CONTEXTUAL DEALER-CONFUSION RECOVERY — voice reliability spec §4 and the
 * follow-up PC headset finding. Real captured field transcripts show Chrome
 * repeatedly mishearing "dealer" as specific OTHER words ("Taylor",
 * "Spotify") with NO alternative containing the literal word "dealer" at
 * all — in that situation the ordinary classification above (and even the
 * ordinary N-best resolver, when a genuine "dealer" alternative exists
 * alongside the misheard one — see the field cases this module's canonical
 * "dealer" branch already resolves) has nothing to fall back to, and the
 * whole utterance is correctly, safely, but unhelpfully rejected.
 *
 * This is intentionally a NAMED, CLOSED list of specific confusion tokens
 * (`DEALER_CONFUSION_TOKENS`) — never a general fuzzy/phonetic matcher, and
 * never invoked as part of ordinary classification (see nBestResolver.ts:
 * only tried when EVERY alternative has already failed ordinary
 * classification). A candidate token is rescued to DEALER only when ALL of
 * the following hold on the SAME transcript, checked in order:
 *
 *   1. The confusion token is the very FIRST word — the target position of
 *      an utterance shaped like ordinary dealer-card narration, not merely
 *      present somewhere in a longer sentence ("deactivate Spotify" fails
 *      here: Spotify isn't first).
 *   2. It's immediately followed by a recognized connector word
 *      ("has"/"is"/"got"/"shows"/"as" — the exact same "as" ASR artifact
 *      for "has" already recognized elsewhere, see HAND_CONNECTOR_WORDS in
 *      parseNarration.ts). No connector at all ("Spotify five") never
 *      qualifies — that shape is too unconstrained to safely guess at, per
 *      explicit product direction.
 *   3. Every remaining token is either ordinary filler ("a"/"an"/"the") or
 *      a card-rank word, with EXACTLY ONE distinct rank present. Any other
 *      token — including a seat-prefix word or a second, different rank —
 *      aborts the recovery entirely rather than guessing which one was
 *      meant ("Taylor called me" fails at the connector check already;
 *      "Taylor seat three has a king" would fail here, correctly refusing
 *      to guess between two explicit, conflicting targets).
 *   4. No uncertainty language anywhere in the transcript — same
 *      unconditional hard rule as everywhere else in this app (see
 *      containsUncertaintyLanguage's own doc comment).
 *
 * Every successful recovery carries a specific `recoveryRuleId`
 * (`DEALER_ASR_TAYLOR`, `DEALER_ASR_SPOTIFY`, ...) rather than a generic
 * "recovered" flag — see TranscriptClassification.recoveryRuleId — so the
 * diagnostics log always makes it obvious EyeOnPit rescued a specific,
 * known Chrome misreading rather than silently treating it as an ordinary
 * match. This function itself makes no policy decision about WHEN it's
 * safe to invoke this — that's entirely nBestResolver.ts's call.
 */
const DEALER_CONFUSION_TOKENS: Record<string, string> = {
  taylor: "DEALER_ASR_TAYLOR",
  spotify: "DEALER_ASR_SPOTIFY",
};

const DEALER_RECOVERY_CONNECTORS = new Set(["has", "is", "got", "shows", "as"]);
// "and" joins a SECOND (or third) card onto the same recovered dealer hand
// ("Spotify has a five and a king") — kept in the same filler set as
// "a"/"an"/"the" rather than DEALER_RECOVERY_CONNECTORS, since it never
// starts the recovery (only the connector immediately after the confusion
// token does that), it only ever continues one already in progress. "in"
// (Chrome Patch round real-mic finding — "Taylor has a king IN a five")
// is the exact same ASR mishearing of "and" already recognized for
// ordinary narration's own HAND_CONNECTOR_WORDS, extended here to this
// separate recovery grammar, which keeps its own filler list.
const DEALER_RECOVERY_FILLERS = new Set(["a", "an", "the", "and", "in"]);

/**
 * PC Field Test #2 — extends the single-card recovery below (unchanged in
 * spirit) to a whole ORDERED SEQUENCE of ranks, so "Spotify has a five and
 * a king" recovers to DEALER 5, K — two cards, in the order spoken — not
 * just the first. Every safety condition from the single-card version
 * still applies unconditionally to the WHOLE transcript: the confusion
 * token must still be the first word, immediately followed by a
 * recognized connector, no uncertainty language anywhere, and every
 * remaining token must be exactly a filler word or a card-rank word — a
 * seat-prefix word, "dealer", or any other unrecognized token still aborts
 * the ENTIRE recovery (never a partial one), exactly as before. The only
 * change is that 2+ ranks are now a valid, unambiguous result (an ordered
 * hand) instead of an automatic abort — there is no ambiguity in "five
 * then king," only in which single one was meant, which no longer applies
 * once every rank is kept, in order.
 */
function recoverDealerConfusionCore(rawTranscript: string): CoreClassification | null {
  const normalized = normalizeTranscript(rawTranscript);
  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length < 3) return null; // need at least <token> <connector> <rank>

  const [first, second, ...rest] = tokens;
  const ruleId = DEALER_CONFUSION_TOKENS[first];
  if (!ruleId) return null;
  if (!DEALER_RECOVERY_CONNECTORS.has(second)) return null;
  if (containsUncertaintyLanguage(tokens)) return null;

  const rankWords: string[] = [];
  for (const token of rest) {
    if (DEALER_RECOVERY_FILLERS.has(token)) continue;
    if (SEAT_PREFIX_WORDS.includes(token) || token === "dealer") return null; // an explicit OTHER target present — never guess between two targets
    if (token in RANK_WORDS) {
      rankWords.push(token);
      continue;
    }
    return null; // any other unrecognized token breaks the narrow required shape
  }
  if (rankWords.length === 0) return null; // zero ranks — nothing to recover

  const steps: CanonicalStep[] = rankWords.map((word) => ({
    kind: "card" as const,
    target: "DEALER",
    rank: RANK_WORDS[word],
    displayRank: FACE_CARD_DISPLAY[word],
  }));
  const narrationOps: NarrationOp[] = [
    { kind: "selectTarget", target: { kind: "dealer" } },
    ...rankWords.map((word) => ({
      kind: "card" as const,
      target: { kind: "dealer" as const },
      rank: RANK_WORDS[word],
      ...(FACE_CARD_DISPLAY[word] ? { displayRank: FACE_CARD_DISPLAY[word] as "J" | "Q" | "K" } : {}),
    })),
  ];
  const [firstWord] = rankWords;
  const recoveredCommand: VoiceCommandKind = {
    kind: "card",
    rank: RANK_WORDS[firstWord],
    target: { kind: "dealer" },
    ...(FACE_CARD_DISPLAY[firstWord] ? { displayRank: FACE_CARD_DISPLAY[firstWord] as "J" | "Q" | "K" } : {}),
  };
  return fromSteps("dealer-confusion-recovery", steps, { recoveryRuleId: ruleId, recoveredCommand, narrationOps });
}

/** Public wrapper around recoverDealerConfusionCore — attaches `appliedRules` exactly like classifyVoiceTranscript does, so a caller using this directly (nBestResolver.ts's last-resort fallback pass) still gets full diagnostics on the recovered result. */
export function tryDealerConfusionRecovery(rawTranscript: string): TranscriptClassification | null {
  const core = recoverDealerConfusionCore(rawTranscript);
  if (!core) return null;
  return { ...core, appliedRules: diagnoseNormalization(rawTranscript) };
}

/**
 * Classifies a single candidate transcript in complete isolation. Never
 * throws; every input either yields a `valid: true` action description or a
 * `valid: false` rejection code + human reason — there is no third outcome.
 *
 * `allowDealerConfusionRecovery` defaults to false — see
 * tryDealerConfusionRecovery's own doc comment: this is a fallback the
 * caller (nBestResolver.ts) opts into explicitly, only once ordinary
 * classification has already failed for every alternative in a result: it
 * is never part of this function's ordinary, default classification path.
 */
function classifyCore(
  rawTranscript: string,
  allowDealerConfusionRecovery: boolean,
  allowUnscopedContinuation: boolean
): CoreClassification {
  const normalized = normalizeTranscript(rawTranscript);

  if (!normalized) {
    return { valid: false, code: "EMPTY_TRANSCRIPT", reason: "Blank transcript." };
  }

  if (NOTE_START_PHRASES.has(normalized) || NOTE_START_WITH_CONTENT_RE.test(rawTranscript)) {
    return { valid: true, source: "note-start", actionKey: "note-start", summary: "Start note", hasExplicitTarget: true };
  }

  const LIFECYCLE_PHRASES: Record<string, string> = {
    [PAUSE_PHRASE]: "Pause investigation",
    [END_COUNT_PHRASE]: "Pause investigation",
    [RESUME_PHRASE]: "Resume investigation",
    [START_COUNT_PHRASE]: "Resume investigation",
    [NEW_SHOE_PHRASE]: "New shoe",
    [CONFIRM_NEW_SHOE_PHRASE]: "Confirm new shoe",
    [END_INVESTIGATION_PHRASE]: "End investigation",
    [CONFIRM_END_INVESTIGATION_PHRASE]: "Confirm end investigation",
    [FULL_STATUS_PHRASE]: "Full status",
  };
  if (normalized in LIFECYCLE_PHRASES) {
    return {
      valid: true,
      source: "lifecycle",
      actionKey: `lifecycle:${normalized}`,
      summary: LIFECYCLE_PHRASES[normalized],
      hasExplicitTarget: true,
    };
  }

  const tableChange = parseTableChangeCommand(rawTranscript);
  if (tableChange) {
    return {
      valid: true,
      source: "table-change",
      actionKey: `table:${tableChange.kind}:${tableChange.seat}`,
      summary: `Seat ${tableChange.seat} ${tableChange.kind === "seat-joins" ? "sat down" : "left"}`,
      hasExplicitTarget: true,
    };
  }

  const readOnlyQuery = parseReadOnlyQuery(normalized);
  if (readOnlyQuery) {
    const key =
      readOnlyQuery.kind === "system" ? `query:system:${readOnlyQuery.system}` : `query:${readOnlyQuery.kind}`;
    return { valid: true, source: "read-only-query", actionKey: key, summary: `Query: ${readOnlyQuery.kind}`, hasExplicitTarget: true };
  }

  // PC Field Test #2 — "current player is spot one" / "watching spot one" /
  // "I'm on spot one": sets the active target, creates NO CardEvent. Same
  // bounded-grammar, exact-shape discipline as table-change/read-only-query
  // above — see parseSetActiveTargetIntent.ts's own doc comment.
  const setActiveTargetIntent = parseSetActiveTargetIntent(rawTranscript);
  if (setActiveTargetIntent) {
    return fromSteps("set-active-target", [{ kind: "select", target: targetSummary(setActiveTargetIntent.target) }], {
      narrationOps: [{ kind: "selectTarget", target: setActiveTargetIntent.target }],
    });
  }

  const narration = parseNarration(rawTranscript, { allowUnscopedContinuation });
  if (narration.kind === "reject") {
    const tokens = normalized.split(" ").filter(Boolean);
    if (containsUncertaintyLanguage(tokens)) {
      return { valid: false, code: "UNCERTAIN_LANGUAGE", reason: "Contains uncertainty language (maybe/probably/I think)." };
    }
    if (allowDealerConfusionRecovery) {
      const recovered = recoverDealerConfusionCore(rawTranscript);
      if (recovered) return recovered;
    }
    return { valid: false, code: "INCOMPLETE_NARRATION", reason: "Narration vocabulary recognized, but the phrase is ambiguous or unsafe." };
  }
  if (narration.kind === "ops") {
    const steps = canonicalizeNarrationOps(narration.ops);
    return fromSteps("narration", steps, { narrationOps: narration.ops });
  }

  // narration.kind === "no-opinion" — defer to the legacy single-command parser.
  const parsed = parseVoiceCommand(rawTranscript);
  if (!parsed.command) {
    if (allowDealerConfusionRecovery) {
      const recovered = recoverDealerConfusionCore(rawTranscript);
      if (recovered) return recovered;
    }
    return { valid: false, code: "UNKNOWN_COMMAND", reason: "Matched no known command vocabulary." };
  }

  const command = parsed.command;
  switch (command.kind) {
    case "select-seat":
      return fromSteps("legacy", [{ kind: "select", target: `SEAT${command.seat}` }]);
    case "select-dealer":
      return fromSteps("legacy", [{ kind: "select", target: "DEALER" }]);
    case "card": {
      const target = command.target ? targetSummary(command.target) : "active";
      return fromSteps("legacy", [{ kind: "card", target, rank: command.rank, displayRank: command.displayRank }]);
    }
    default:
      return fromSteps("legacy", [{ kind: "workflow", action: command.kind }]);
  }
}

/**
 * Public entry point — classifyCore's result plus `appliedRules` (voice
 * reliability spec §5), derived once via diagnoseNormalization from the
 * SAME raw transcript. Kept as a thin wrapper (rather than computing
 * appliedRules inline at every classifyCore return point) so every one of
 * classifyCore's ~10 return statements didn't need touching to add this —
 * see CoreClassification's own doc comment.
 */
export function classifyVoiceTranscript(
  rawTranscript: string,
  allowDealerConfusionRecovery = false,
  allowUnscopedContinuation = false
): TranscriptClassification {
  const core = classifyCore(rawTranscript, allowDealerConfusionRecovery, allowUnscopedContinuation);
  return { ...core, appliedRules: diagnoseNormalization(rawTranscript) };
}

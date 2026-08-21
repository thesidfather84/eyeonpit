/**
 * UNIVERSAL COMMAND — the language-independent semantic command schema
 * from docs/EYEONPIT_NATIVE_VOICE_SPEC.md §3. Every existing English
 * command intent (see classifyVoiceTranscript.ts's own `ClassificationSource`
 * union) maps onto this 1:1 — this module describes what already exists, it
 * does not invent new functionality or change any existing dispatch
 * behavior. `mapClassificationToUniversalCommand` is a PURE function: given
 * a `TranscriptClassification` (already produced by the real, unmodified
 * classifier), it returns the semantic command(s) that classification
 * represents, plus the ACCEPT/REPEAT/REJECT verdict from spec §6's safety
 * model. Nothing here writes a CardEvent, touches investigation state, or
 * changes what VoiceControl.tsx/parseNarration.ts/parseVoiceCommand.ts
 * actually dispatch — this is purely a second, additive representation of
 * the SAME classification result, built for the Native Voice Prototype
 * (see nativeVoicePrototype.ts) and any future acoustic model's Constrained
 * Decoder stage to emit directly into.
 *
 * WHY actionKey, NOT a new parse: `TranscriptClassification.actionKey` is
 * already the ONE representation classifyVoiceTranscript.ts guarantees
 * uniform across every parser source (narration, legacy, dealer-confusion-
 * recovery, split-hand-card, set-active-target) — see that module's own
 * canonicalization doc comment. voiceBenchmarkCorpus.ts's own
 * `extractActual` already parses this same string for the identical reason
 * (scoring, not dispatch) — this module reuses that same real, tested
 * contract rather than inventing a second way to read classification
 * results.
 */
import type { TranscriptClassification } from "./classifyVoiceTranscript";
import type { RejectionCode } from "./voiceDiagnosticsTypes";

export type UniversalTarget = { kind: "dealer" } | { kind: "seat"; seat: number; hand?: 1 | 2 };

export type CanonicalRank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10";

export type CanonicalCountSystem = "HI_LO" | "KO" | "ZEN" | "OMEGA_II" | (string & {});

export type UniversalCommand =
  | { op: "DEAL_CARD"; target: UniversalTarget; rank: CanonicalRank }
  | { op: "SELECT_TARGET"; target: UniversalTarget }
  /**
   * HIT/STAND are deliberately NOT action values here — see spec §1.2/§3:
   * "There is no discrete hit/stand mutation by design... another card
   * entered is an implicit hit, ending entry is an implicit stand." A bare
   * "player three hits" narration is real, existing production behavior
   * that only selects the target (`SELECT_TARGET`) — "hits" itself is
   * consumed as an inert word, exactly as it is today. See this module's
   * own KNOWN DEVIATION note below for where this diverges from the
   * milestone brief's own illustrative example.
   */
  | { op: "PLAYER_ACTION"; target: UniversalTarget; action: "SPLIT" | "DOUBLE" | "SURRENDER" | "INSURANCE" }
  | { op: "PLAYER_ENTER"; seat: number }
  | { op: "PLAYER_LEAVE"; seat: number }
  | { op: "HAND_DONE" }
  | { op: "HAND_NEXT" }
  | { op: "HAND_UNDO" }
  | { op: "COUNT_QUERY"; kind: "COUNT" | "STATUS" | "RC" | "TC" | "ACES" | "DECKS" | "SYSTEM" | "REPEAT"; system?: CanonicalCountSystem }
  | { op: "COUNT_CONTROL"; action: "START" | "PAUSE" | "RESUME" | "NEW_SHOE" | "END_INVESTIGATION" }
  | { op: "NOTE"; action: "START" | "END" | "CANCEL"; text?: string };

/**
 * Three outcomes only — spec §6, restating this app's ALREADY-established
 * real behavior (classifyVoiceTranscript/nBestResolver), not a new policy.
 * NO EVENT > WRONG EVENT: `commands` is present ONLY on ACCEPT.
 */
export type UniversalCommandVerdict =
  | { verdict: "ACCEPT"; commands: UniversalCommand[] }
  | { verdict: "REPEAT"; code: RejectionCode; reason: string }
  | { verdict: "REJECT"; code: RejectionCode; reason: string };

/**
 * Spec §6's own examples: REPEAT = "recognized as an attempted command but
 * rejected as ambiguous/unsafe" (operator should try again); REJECT = "not
 * recognized as a command at all" (silently ignored). Every RejectionCode
 * this app can actually produce is bucketed below by that same distinction
 * — ambiguity/disabled-control/uncertainty codes are REPEAT (something WAS
 * attempted), unknown-vocabulary/empty-transcript/session-lifecycle codes
 * are REJECT (nothing usable was ever heard). A code landing in neither Set
 * defaults to REPEAT (the more conservative of the two — asks the operator
 * to try again rather than silently dropping an utterance that at least
 * matched a code we didn't anticipate here), never silently miscategorized.
 */
const REJECT_CODES: ReadonlySet<RejectionCode> = new Set<RejectionCode>([
  "UNKNOWN_COMMAND",
  "EMPTY_TRANSCRIPT",
  "ASR_NO_FINAL",
  "ASR_ERROR",
  "RECOGNITION_ENDED_UNEXPECTEDLY",
  "RESTART_FAILED",
  "DUPLICATE_EVENT",
]);

function verdictForRejection(code: RejectionCode, reason: string): UniversalCommandVerdict {
  return REJECT_CODES.has(code) ? { verdict: "REJECT", code, reason } : { verdict: "REPEAT", code, reason };
}

const LIFECYCLE_TO_COUNT_CONTROL: Record<string, UniversalCommand> = {
  "pause investigation": { op: "COUNT_CONTROL", action: "PAUSE" },
  "end count": { op: "COUNT_CONTROL", action: "PAUSE" },
  "resume investigation": { op: "COUNT_CONTROL", action: "RESUME" },
  "start count": { op: "COUNT_CONTROL", action: "START" },
  "new shoe": { op: "COUNT_CONTROL", action: "NEW_SHOE" },
  "confirm new shoe": { op: "COUNT_CONTROL", action: "NEW_SHOE" },
  "end investigation": { op: "COUNT_CONTROL", action: "END_INVESTIGATION" },
  "confirm end investigation": { op: "COUNT_CONTROL", action: "END_INVESTIGATION" },
  "full status": { op: "COUNT_QUERY", kind: "STATUS" },
};

const WORKFLOW_ACTION_TO_COMMAND: Record<string, UniversalCommand> = {
  done: { op: "HAND_DONE" },
  next: { op: "HAND_NEXT" },
  undo: { op: "HAND_UNDO" },
  count: { op: "COUNT_QUERY", kind: "COUNT" },
  status: { op: "COUNT_QUERY", kind: "STATUS" },
};

const READ_ONLY_QUERY_KIND_TO_COUNT_QUERY: Record<string, "COUNT" | "STATUS" | "RC" | "TC" | "ACES" | "DECKS" | "SYSTEM" | "REPEAT"> = {
  status: "STATUS",
  system: "SYSTEM",
  rc: "RC",
  tc: "TC",
  aces: "ACES",
  decks: "DECKS",
  repeat: "REPEAT",
};

/** Parses a canonical target label ("DEALER" / "SEAT3" / "SEAT3H1" — see classifyVoiceTranscript.ts's `targetSummary`/split-hand-card actionKey shapes) into a `UniversalTarget`. Returns null for the special "active" sentinel (a bare card with no explicit target in this utterance) — see this module's own doc comment on why that case can never safely become a UniversalCommand on its own. */
function parseTargetLabel(label: string): UniversalTarget | null {
  if (label === "DEALER") return { kind: "dealer" };
  if (label === "active") return null;
  const handMatch = /^SEAT(\d+)H([12])$/.exec(label);
  if (handMatch) return { kind: "seat", seat: Number(handMatch[1]), hand: Number(handMatch[2]) as 1 | 2 };
  const seatMatch = /^SEAT(\d+)$/.exec(label);
  if (seatMatch) return { kind: "seat", seat: Number(seatMatch[1]) };
  return null;
}

const RANK_DISPLAY_TO_CANONICAL: Record<string, CanonicalRank> = {
  A: "A",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  "10": "10",
};

/**
 * Maps the canonical `T:<target>` / `C:<target>:<rank>` / `W:<action>`
 * step-joined `actionKey` (classifyVoiceTranscript.ts's `canonicalActionKey`
 * — shared by narration, legacy, dealer-confusion-recovery, split-hand-card,
 * and set-active-target sources) into `UniversalCommand[]`. A step this
 * function cannot map safely (an unresolved "active" target on a `C:` step)
 * degrades the WHOLE utterance to REPEAT rather than silently dropping just
 * that one card — never guesses which target a bare card meant.
 */
function mapCanonicalSteps(actionKey: string): UniversalCommand[] | null {
  const steps = actionKey.split("|").filter(Boolean);
  const commands: UniversalCommand[] = [];
  for (const step of steps) {
    if (step.startsWith("T:")) {
      const target = parseTargetLabel(step.slice(2));
      if (!target) return null;
      commands.push({ op: "SELECT_TARGET", target });
      continue;
    }
    if (step.startsWith("C:")) {
      const [, targetLabel, rank] = step.split(":");
      const target = parseTargetLabel(targetLabel);
      if (!target) return null; // bare card, no explicit target this utterance — never guess
      const canonicalRank = RANK_DISPLAY_TO_CANONICAL[rank];
      if (!canonicalRank) return null;
      commands.push({ op: "DEAL_CARD", target, rank: canonicalRank });
      continue;
    }
    if (step.startsWith("W:")) {
      const action = step.slice(2);
      const mapped = WORKFLOW_ACTION_TO_COMMAND[action];
      if (!mapped) return null;
      commands.push(mapped);
      continue;
    }
    return null;
  }
  return commands;
}

/**
 * Public entry point. Pure — given a `TranscriptClassification` (from the
 * REAL, unmodified `classifyVoiceTranscript`), returns the ACCEPT/REPEAT/
 * REJECT verdict plus, on ACCEPT, the `UniversalCommand[]` it represents.
 *
 * KNOWN DEVIATION FROM THE MILESTONE BRIEF'S OWN ILLUSTRATIVE EXAMPLE
 * (disclosed, not silent): the brief's own worked example shows
 * `"Player three hits" -> PLAYER_ACTION(target=PLAYER, position=3,
 * action=HIT)`. The locked spec (§1.2, §3) this same brief points to
 * explicitly and deliberately excludes HIT/STAND from `UniversalCommand`
 * ("HIT/STAND stay implicit... There is no discrete hit/stand mutation by
 * design") because that already matches this app's real, shipped
 * production behavior — a bare "player three hits" only ever selects the
 * target today; "hits" itself is consumed as inert filler
 * (INERT_ACTION_WORDS in parseNarration.ts), never a distinct mutation.
 * Inventing a new HIT action value to match the brief's illustrative
 * example would mean emitting a UniversalCommand this app cannot actually
 * act on — a worse, less honest outcome than following the spec's own
 * explicit, already-decided design. "Player three hits" therefore maps to
 * `[{ op: "SELECT_TARGET", target: { kind: "seat", seat: 3 } }]`, ACCEPT,
 * with `wouldProduceCardEvent: false` — never a fabricated HIT op.
 *
 * Similarly, "Start count"/"End count" map to `COUNT_CONTROL` actions
 * `"START"`/`"PAUSE"` (not the brief's own literal `"END"`, which isn't in
 * the locked §3 action union) — chosen because that's what these two
 * phrases ALREADY do in production (`lifecyclePhrases.ts`: `START_COUNT_PHRASE`
 * aliases identically to `RESUME_PHRASE`'s "Resume investigation" summary,
 * `END_COUNT_PHRASE` aliases identically to `PAUSE_PHRASE`'s "Pause
 * investigation" summary) — see `LIFECYCLE_TO_COUNT_CONTROL` above, which
 * distinguishes the two "start" phrasings via the enum's own `"START"`
 * value (a UniversalCommand-layer-only semantic label; production dispatch,
 * untouched by this file, still treats both as the same investigation-level
 * resume) while reusing `"PAUSE"` rather than inventing a same-meaning
 * `"END"` duplicate.
 */
export function mapClassificationToUniversalCommand(classification: TranscriptClassification): UniversalCommandVerdict {
  if (!classification.valid) {
    return verdictForRejection(classification.code, classification.reason);
  }

  const { source, actionKey } = classification;

  if (source === "lifecycle") {
    const phrase = actionKey.startsWith("lifecycle:") ? actionKey.slice("lifecycle:".length) : "";
    const mapped = LIFECYCLE_TO_COUNT_CONTROL[phrase];
    if (mapped) return { verdict: "ACCEPT", commands: [mapped] };
    return { verdict: "REPEAT", code: "UNKNOWN_COMMAND", reason: `Unmapped lifecycle phrase: ${phrase}` };
  }

  if (source === "read-only-query") {
    // actionKey is "query:<kind>" or "query:system:<system>" — see classifyVoiceTranscript.ts.
    const rest = actionKey.startsWith("query:") ? actionKey.slice("query:".length) : "";
    if (rest.startsWith("system:")) {
      return { verdict: "ACCEPT", commands: [{ op: "COUNT_QUERY", kind: "SYSTEM", system: rest.slice("system:".length) }] };
    }
    const kind = READ_ONLY_QUERY_KIND_TO_COUNT_QUERY[rest];
    if (kind) return { verdict: "ACCEPT", commands: [{ op: "COUNT_QUERY", kind }] };
    return { verdict: "REPEAT", code: "UNKNOWN_COMMAND", reason: `Unmapped read-only query: ${rest}` };
  }

  if (source === "table-change") {
    // actionKey is "table:<seat-joins|seat-leaves>:<seat>" — see classifyVoiceTranscript.ts.
    const parts = actionKey.split(":");
    const kind = parts[1];
    const seat = Number(parts[2]);
    if (!Number.isFinite(seat)) return { verdict: "REPEAT", code: "INVALID_SEAT", reason: "Unresolvable seat number." };
    return { verdict: "ACCEPT", commands: [kind === "seat-joins" ? { op: "PLAYER_ENTER", seat } : { op: "PLAYER_LEAVE", seat }] };
  }

  if (source === "split-double") {
    // actionKey is "splitdouble:split:<seat>" or "splitdouble:double:<seat>:<hand|bare>".
    const parts = actionKey.split(":");
    const seat = Number(parts[2]);
    if (!Number.isFinite(seat)) return { verdict: "REPEAT", code: "INVALID_SEAT", reason: "Unresolvable seat number." };
    const target: UniversalTarget =
      parts[1] === "double" && parts[3] && parts[3] !== "bare" ? { kind: "seat", seat, hand: Number(parts[3]) as 1 | 2 } : { kind: "seat", seat };
    return { verdict: "ACCEPT", commands: [{ op: "PLAYER_ACTION", target, action: parts[1] === "split" ? "SPLIT" : "DOUBLE" }] };
  }

  if (source === "note-start") {
    return { verdict: "ACCEPT", commands: [{ op: "NOTE", action: "START" }] };
  }

  // narration / legacy / dealer-confusion-recovery / split-hand-card /
  // set-active-target all share the canonical T:/C:/W: actionKey shape —
  // see classifyVoiceTranscript.ts's own canonicalization doc comment.
  const commands = mapCanonicalSteps(actionKey);
  if (!commands) {
    return { verdict: "REPEAT", code: "NO_TARGET", reason: "Command referenced the currently active target, which the Native Voice Prototype has no live state for — never guessed." };
  }
  return { verdict: "ACCEPT", commands };
}

/** True when ANY command in an ACCEPT verdict would actually write ledger data (DEAL_CARD) — the single most important field per spec §11's "false CardEvent rate" gate. SELECT_TARGET, queries, and workflow/lifecycle commands never write a CardEvent, matching real production behavior exactly (the counting engine only ever mutates on an explicit card entry). */
export function verdictWouldProduceCardEvent(verdict: UniversalCommandVerdict): boolean {
  return verdict.verdict === "ACCEPT" && verdict.commands.some((c) => c.op === "DEAL_CARD");
}

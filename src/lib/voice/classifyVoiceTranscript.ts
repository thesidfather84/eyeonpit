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
 *   query -> narration -> legacy single-command -> UNKNOWN_COMMAND.
 */
import { normalizeTranscript } from "./normalizeTranscript";
import { parseVoiceCommand, containsUncertaintyLanguage, type VoiceTarget } from "./parseVoiceCommand";
import { parseNarration, type NarrationOp } from "./parseNarration";
import { parseTableChangeCommand } from "./parseTableChangeCommand";
import { parseReadOnlyQuery } from "./parseReadOnlyQuery";
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
  | "narration"
  | "legacy";

export type TranscriptClassification =
  | {
      valid: true;
      source: ClassificationSource;
      /** Canonical key for detecting agreement/conflict between alternatives — see nBestResolver.ts. Two classifications with the same actionKey are considered "the same resulting action" regardless of which source produced them. */
      actionKey: string;
      /** Short human-readable description for diagnostics ("DEALER: K", "NEXT", "Seat 3 occupied"). */
      summary: string;
      /** True when a dealer/seat target was explicitly named in THIS transcript (vs. a bare card that would resolve against whatever live active target happens to be) — used as a resolver scoring bonus, since an explicit target is strictly less ambiguous. Non-target commands (workflow/query/lifecycle/table-change/note-start) are also `true` here: there is no target-guessing risk for them at all, so they should never be penalized relative to an explicit-target card command. */
      hasExplicitTarget: boolean;
      /** Present only for source "narration" — carries the actual ops so the resolver's winner can be committed via the existing commitNarration path without re-parsing. */
      narrationOps?: NarrationOp[];
    }
  | { valid: false; code: RejectionCode; reason: string };

function targetSummary(target: VoiceTarget): string {
  return target.kind === "dealer" ? "DEALER" : `SEAT${target.seat}`;
}

function narrationActionKey(ops: NarrationOp[]): string {
  return ops
    .map((op) => {
      if (op.kind === "selectTarget") return `T:${targetSummary(op.target)}`;
      if (op.kind === "card") return `C:${op.target ? targetSummary(op.target) : "active"}:${op.rank}`;
      return `W:${op.action}`;
    })
    .join("|");
}

function narrationSummary(ops: NarrationOp[]): string {
  return ops
    .map((op) => {
      if (op.kind === "selectTarget") return targetSummary(op.target);
      if (op.kind === "card") return `${op.target ? targetSummary(op.target) : "ACTIVE"}:${op.displayRank ?? op.rank}`;
      return op.action.toUpperCase();
    })
    .join(" ");
}

function narrationHasExplicitTarget(ops: NarrationOp[]): boolean {
  return ops.every((op) => op.kind !== "card" || op.target != null);
}

/**
 * Classifies a single candidate transcript in complete isolation. Never
 * throws; every input either yields a `valid: true` action description or a
 * `valid: false` rejection code + human reason — there is no third outcome.
 */
export function classifyVoiceTranscript(rawTranscript: string): TranscriptClassification {
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

  const narration = parseNarration(rawTranscript);
  if (narration.kind === "reject") {
    const tokens = normalized.split(" ").filter(Boolean);
    if (containsUncertaintyLanguage(tokens)) {
      return { valid: false, code: "UNCERTAIN_LANGUAGE", reason: "Contains uncertainty language (maybe/probably/I think)." };
    }
    return { valid: false, code: "INCOMPLETE_NARRATION", reason: "Narration vocabulary recognized, but the phrase is ambiguous or unsafe." };
  }
  if (narration.kind === "ops") {
    return {
      valid: true,
      source: "narration",
      actionKey: `narration:${narrationActionKey(narration.ops)}`,
      summary: narrationSummary(narration.ops),
      hasExplicitTarget: narrationHasExplicitTarget(narration.ops),
      narrationOps: narration.ops,
    };
  }

  // narration.kind === "no-opinion" — defer to the legacy single-command parser.
  const parsed = parseVoiceCommand(rawTranscript);
  if (!parsed.command) {
    return { valid: false, code: "UNKNOWN_COMMAND", reason: "Matched no known command vocabulary." };
  }

  const command = parsed.command;
  switch (command.kind) {
    case "select-seat":
      return { valid: true, source: "legacy", actionKey: `T:SEAT${command.seat}`, summary: `SEAT${command.seat}`, hasExplicitTarget: true };
    case "select-dealer":
      return { valid: true, source: "legacy", actionKey: "T:DEALER", summary: "DEALER", hasExplicitTarget: true };
    case "card": {
      const target = command.target ? targetSummary(command.target) : "active";
      return {
        valid: true,
        source: "legacy",
        actionKey: `C:${target}:${command.rank}`,
        summary: `${target}:${command.displayRank ?? command.rank}`,
        hasExplicitTarget: command.target != null,
      };
    }
    default:
      return { valid: true, source: "legacy", actionKey: `W:${command.kind}`, summary: command.kind.toUpperCase(), hasExplicitTarget: true };
  }
}

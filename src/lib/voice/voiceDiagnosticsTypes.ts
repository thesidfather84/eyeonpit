/**
 * Shared vocabulary for the advanced voice diagnostic system — see
 * nBestResolver.ts (produces these), VoiceControl.tsx (logs/displays them),
 * and VoiceDiagnosticsPanel.tsx (renders the latest-utterance summary and
 * drives session export). Kept in its own file, with zero dependencies on
 * React or live investigation state, so it can be imported by the pure
 * classifier/resolver modules without pulling in component code.
 */

/**
 * The eight stages every voice event log line is explicitly tagged with —
 * makes it immediately obvious at a glance whether a given diagnostic line
 * is describing what the browser heard, what normalization did to it, which
 * intent/grammar recognized it, how alternatives were resolved, what got
 * written to the investigation, or what got spoken back.
 */
export type PipelineStage = "ASR" | "NORMALIZE" | "INTENT" | "PARSE" | "RESOLVE" | "COMMIT" | "TTS" | "LIFECYCLE";

/**
 * Structured reason codes, replacing free-text-only "ambiguous or unsafe"
 * diagnostics. Every code here corresponds to a real, distinct failure mode
 * this app's voice pipeline can hit — see nBestResolver.ts and
 * VoiceControl.tsx for where each is actually assigned. Human-readable text
 * always accompanies the code (never code-only); this is an additional,
 * greppable classification, not a replacement for the existing prose.
 */
export type RejectionCode =
  /** No target (dealer/seat) could be determined and none was already active in a way the safety rules allow using. */
  | "NO_TARGET"
  /** A target was found but no recognizable card rank was. */
  | "NO_CARD"
  /** A spoken seat number fell outside the valid 1-7 range. */
  | "INVALID_SEAT"
  /** Transcript matched no vocabulary in any parser (narration, legacy, table-change, read-only query, lifecycle). */
  | "UNKNOWN_COMMAND"
  /** Narration recognized some structured vocabulary but the utterance is an incomplete fragment (e.g. a trailing seat-prefix word with nothing after it). */
  | "INCOMPLETE_NARRATION"
  /** Two or more ASR alternatives independently produced different, mutually exclusive valid actions, with no decisive confidence/structure gap to prefer one. */
  | "CONFLICTING_ALTERNATIVES"
  /** Every alternative was tried and none produced a valid, actionable classification. */
  | "NO_VALID_ALTERNATIVE"
  /** Same underlying situation as CONFLICTING_ALTERNATIVES, surfaced when 3+ alternatives each proposed a distinct valid action. */
  | "MULTIPLE_VALID_CONFLICTS"
  /** A final result was identical to the immediately preceding one within the duplicate-suppression window — see VoiceControl's DUPLICATE_WINDOW_MS. */
  | "DUPLICATE_EVENT"
  /** Reserved for a future cross-session staleness check; not currently assignable — no code path keeps a session alive long enough to go stale within a single utterance's lifecycle. */
  | "STALE_SESSION"
  /** The active target implied by this utterance's own narration conflicts with the live active target and the safety rule requires an explicit target rather than guessing (see parseNarration's "never guess where the earlier card landed" rule). */
  | "ACTIVE_TARGET_CONFLICT"
  /** A native recognition session ended without ever producing a final result (see useVoiceRecognition's onend/consumedRef). */
  | "ASR_NO_FINAL"
  /** The browser's SpeechRecognition raised a SpeechRecognitionErrorEvent — the verbatim error code is logged alongside this. */
  | "ASR_ERROR"
  /** A native session's onend fired without a prior deliberate stop() or a suppressForSpeech() call — logged for visibility, not necessarily a problem (an ordinary end-of-utterance is expected and looks identical at this layer; see useVoiceRecognition's own doc comment on why the restart/stop decision lives exclusively in onend). */
  | "RECOGNITION_ENDED_UNEXPECTEDLY"
  /** A scheduled restart's recognition.start() threw synchronously. */
  | "RESTART_FAILED"
  /** The parser matched a real command but the control it targets is currently disabled (round completed, paused, seat not occupied, etc). */
  | "CONTROL_DISABLED"
  /** The utterance contained explicit uncertainty language ("maybe", "probably", "I think", ...) — hard-rejected regardless of any card word present. */
  | "UNCERTAIN_LANGUAGE"
  /** Speech was heard but produced only silence/whitespace once normalized. */
  | "EMPTY_TRANSCRIPT";

/**
 * One structured record per utterance that reached N-best resolution in
 * VoiceControl.handleFinalResult — the machine-readable counterpart to the
 * flat, human-scannable diagnostics log (VoiceDiagnosticEntry in
 * VoiceDiagnosticsPanel.tsx). Drives the "latest utterance" detail view and
 * the JSON/TXT session export (see section 13/15 of the voice reliability
 * spec). Deliberately excludes note-mode dictation chunks and
 * pendingConfirmation phrase checks — see nBestResolver.ts's own doc
 * comment for why those two stateful modes are out of N-best scope
 * entirely; this trace type only ever describes the ordinary
 * command-dispatch path.
 */
export interface VoiceUtteranceSummary {
  voiceEventId: string;
  time: string;
  alternatives: { index: number; transcript: string; confidence: number | null }[];
  winnerIndex: number | null;
  winningTranscript: string | null;
  normalized: string | null;
  outcome: "ACCEPTED" | "REJECTED" | "BLOCKED";
  code?: RejectionCode;
  resolveReason: string;
  actionSummary: string;
  activeTargetBefore: string;
  activeTargetAfter?: string;
  finalToCommitMs?: number;
  /** performance.now() delta from the native session's own "speech-start" lifecycle event to this utterance's final result — see VoiceControl's own TIMING log line. Undefined when speech-start never fired this session (e.g. some engines don't). */
  speechStartToFinalMs?: number;
  /** True when the accepted winner was NOT the recognizer's own top-ranked alternative — i.e. N-best resolution actually rescued a lower-ranked reading. Undefined for a rejected utterance (there is no winner to have been rescued). */
  nBestRescue?: boolean;
  /** IDs of every ASR-artifact normalization rule (normalizeAsrSeatArtifacts) that fired on the winning alternative — see AppliedNormalizationRule. Empty array when the winner needed no normalization; undefined for a rejected utterance. */
  normalizationRuleIds?: string[];
  /** The specific dealer/player-confusion recovery rule that fired, when the winner was rescued via classifyVoiceTranscript.ts's contextual recovery grammar — e.g. "DEALER_ASR_TAYLOR". Undefined otherwise. */
  recoveryRuleId?: string;
  /** Number of ordered operations the winning classification carried (narrationOps.length) — present for narration, dealer-confusion-recovery, and set-active-target sources; a value greater than 1 identifies a genuinely compound/multi-op utterance (see PRIORITY 5/12). Undefined for a single-command (legacy) or query/lifecycle outcome, which have no op list at all. */
  narrationOpsCount?: number;
  /** Mirrors TranscriptClassification.hasExplicitTarget for the winning alternative — false identifies a target-omitted continuation utterance (PRIORITY 3) resolved entirely against the live active target. Undefined for a rejected utterance. */
  hasExplicitTarget?: boolean;
  /** PC Field Test #2, PRIORITY 4 — true when this was a bare, unscoped single-card accept arriving within a few seconds of a REJECTED/BLOCKED utterance, a pattern consistent with Chrome's own ASR segmentation splitting one longer intended utterance into a stray fragment plus a separate (often also-rejected) remainder. Diagnostic-only: never changes what committed. Undefined (not false) when the condition doesn't apply, so a raw JSON export stays uncluttered. */
  possibleFragment?: boolean;
}

/** Human-readable text for every code — always shown alongside the code, never in place of it. */
export const REJECTION_CODE_TEXT: Record<RejectionCode, string> = {
  NO_TARGET: "No dealer/seat target could be determined.",
  NO_CARD: "A target was heard, but no recognizable card rank.",
  INVALID_SEAT: "The spoken seat number is out of the valid 1-7 range.",
  UNKNOWN_COMMAND: "Transcript matched no known command vocabulary.",
  INCOMPLETE_NARRATION: "Narration vocabulary was recognized, but the phrase is incomplete.",
  CONFLICTING_ALTERNATIVES: "Two or more alternatives produced different valid actions with no clear winner.",
  NO_VALID_ALTERNATIVE: "None of the recognized alternatives produced a valid, actionable command.",
  MULTIPLE_VALID_CONFLICTS: "Three or more alternatives each proposed a different valid action.",
  DUPLICATE_EVENT: "Identical to the immediately preceding result — ignored.",
  STALE_SESSION: "Event belongs to a stale/superseded recognition session.",
  ACTIVE_TARGET_CONFLICT: "This utterance's own target conflicts with the live active target — refusing to guess.",
  ASR_NO_FINAL: "Recognition session ended without ever producing a final result.",
  ASR_ERROR: "The browser's speech recognition engine reported an error.",
  RECOGNITION_ENDED_UNEXPECTEDLY: "Recognition session ended.",
  RESTART_FAILED: "Restarting the recognition session failed.",
  CONTROL_DISABLED: "Recognized correctly, but that control is currently disabled.",
  UNCERTAIN_LANGUAGE: "Utterance contained uncertainty language (maybe/probably/I think) — never committed.",
  EMPTY_TRANSCRIPT: "Blank transcript — common recognizer noise, not an operator mistake.",
};

/**
 * NATIVE VOICE PROTOTYPE 0.1 — the 7-phrase English-only prototype corpus
 * (EYEONPIT NEXT BUILD's own exact list) plus the single pure function that
 * turns a raw transcript into a full ACCEPT/REPEAT/REJECT verdict: real,
 * unmodified `classifyVoiceTranscript` -> real, unmodified
 * `mapClassificationToUniversalCommand`. Shared by the Lab page
 * (src/app/lab/(protected)/native-voice-test/page.tsx), the corpus module
 * (nativeVoiceCorpus.ts), and the automated safety tests — one function, so
 * the UI can never drift from what the tests actually verify.
 *
 * Deliberately NOT tied to any one acoustic model/provider — see
 * voskProvider.ts's own doc comment for the FIRST candidate this is
 * exercised against, and speechProvider.ts for the seam that makes swapping
 * it later a zero-change operation for this file.
 */
import { classifyVoiceTranscript } from "./classifyVoiceTranscript";
import { mapClassificationToUniversalCommand, verdictWouldProduceCardEvent, type UniversalCommand, type UniversalCommandVerdict } from "./universalCommand";
import type { RejectionCode } from "./voiceDiagnosticsTypes";

/** EYEONPIT NEXT BUILD's own exact 7 phrases — do not expand beyond this list for Prototype 0.1 (see the milestone brief's own explicit boundary). */
export const NATIVE_VOICE_PROTOTYPE_PHRASES: readonly string[] = [
  "Dealer has a five.",
  "Dealer has a king.",
  "Player one has a five.",
  "Player three has a king.",
  "Player three hits.",
  "Start count.",
  "End count.",
] as const;

/**
 * Existing, already-proven unrelated/noise phrases — reused verbatim from
 * `voiceBenchmarkCorpus.ts`/the Sherpa Lab's own `NOISE_PHRASES` rather than
 * inventing a new list, per the milestone brief's own "Also run the
 * existing unrelated/noise rejection phrases" instruction.
 */
export const NATIVE_VOICE_NOISE_PHRASES: readonly string[] = [
  "Spotify is dead.",
  "Play Drake music.",
  "It's 3:55.",
  "What time does the buffet close.",
  "Can you send security to table twelve.",
] as const;

export interface NativeVoiceResult {
  transcript: string;
  verdict: UniversalCommandVerdict["verdict"];
  code: RejectionCode | null;
  reason: string | null;
  commands: UniversalCommand[];
  wouldProduceCardEvent: boolean;
  /** Every ASR-artifact normalization rule applied while classifying — see classifyVoiceTranscript.ts's own `appliedRules`. Diagnostic-only, shown in the Lab UI's raw-tokens display. */
  appliedRuleIds: string[];
}

/**
 * THE core prototype pipeline: raw transcript -> real classifier -> real
 * UniversalCommand mapping -> a single flat result the Lab UI/tests can
 * read directly. Pure — no CardEvent, no investigation state, no I/O.
 * `allowDealerConfusionRecovery`/`allowUnscopedContinuation` default to
 * `true`/`true`, matching the same defaults `voiceBenchmarkCorpus.ts`'s own
 * `evaluateCorpusItem` already uses for text-only scoring — this prototype
 * is deliberately evaluated against the SAME safety pipeline real
 * production narration uses, not a weakened subset.
 */
export function evaluateNativeVoiceTranscript(rawTranscript: string): NativeVoiceResult {
  const classification = classifyVoiceTranscript(rawTranscript, true, true);
  const verdict = mapClassificationToUniversalCommand(classification);
  return {
    transcript: rawTranscript,
    verdict: verdict.verdict,
    code: verdict.verdict === "ACCEPT" ? null : verdict.code,
    reason: verdict.verdict === "ACCEPT" ? null : verdict.reason,
    commands: verdict.verdict === "ACCEPT" ? verdict.commands : [],
    wouldProduceCardEvent: verdictWouldProduceCardEvent(verdict),
    appliedRuleIds: classification.appliedRules.map((r) => r.id),
  };
}

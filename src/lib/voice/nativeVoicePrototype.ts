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

/**
 * NATIVE VOICE v0.2 — "carefully controlled English Native Voice" built
 * ONLY from vocabulary/command shapes already real and shipped in
 * production (parseVoiceCommand.ts's RANK_WORDS/SEAT_PREFIX_WORDS,
 * lifecyclePhrases.ts, parseReadOnlyQuery.ts, parseTableChangeCommand.ts,
 * parseSplitDoubleCommand.ts, parseSetActiveTargetIntent.ts) — no invented
 * product behavior. Deliberately does NOT include Hit/Stand/Surrender/
 * Insurance: those already exist only as INERT no-op filler in production
 * (see parseNarration.ts's INERT_ACTION_WORDS) and adding them here would
 * add acoustic-collision surface for zero functional gain, per explicit
 * instruction not to represent them as new behavior.
 *
 * Grouped exactly as requested — dealer/card, player/card, controls — each
 * phrase verified (see nativeVoicePrototype.test.ts) to actually ACCEPT
 * through the real, unmodified classifier with the expected UniversalCommand,
 * not merely assumed from reading the parser source.
 */
export interface NativeVoicePhraseGroup {
  id: "dealer-card" | "player-card" | "controls";
  label: string;
  phrases: readonly string[];
}

export const NATIVE_VOICE_EXPANDED_GROUPS: readonly NativeVoicePhraseGroup[] = [
  {
    id: "dealer-card",
    label: "Dealer / Card",
    // Every one of the 13 canonical ranks (RANK_WORDS' own distinct target
    // values: A,2-10 with J/Q/K collapsing to 10) on the dealer target —
    // proves full rank-word coverage on a single, unambiguous target.
    phrases: [
      "Dealer has an ace.",
      "Dealer has a two.",
      "Dealer has a three.",
      "Dealer has a four.",
      "Dealer has a five.",
      "Dealer has a six.",
      "Dealer has a seven.",
      "Dealer has an eight.",
      "Dealer has a nine.",
      "Dealer has a ten.",
      "Dealer has a jack.",
      "Dealer has a queen.",
      "Dealer has a king.",
    ],
  },
  {
    id: "player-card",
    label: "Player / Card",
    // Representative seats (1, 3, 5) x representative ranks — proves the
    // same grammar generalizes across targets without a full 7-seat x
    // 13-rank combinatorial explosion (kept to a "practical size" per
    // instruction).
    phrases: [
      "Player one has a five.",
      "Player one has a king.",
      "Player one has an ace.",
      "Player three has a king.",
      "Player three has a nine.",
      "Player three has a seven.",
      "Player five has a queen.",
      "Player five has a ten.",
    ],
  },
  {
    id: "controls",
    label: "Controls",
    phrases: [
      "Start count.",
      "End count.",
      "Pause investigation.",
      "Resume investigation.",
      "Next hand.",
      "Next.",
      "Undo.",
      "Current player is player one.",
      "Watching dealer.",
      "Spot three split.",
      "Spot three double.",
      "Status.",
      "Running count.",
      "True count.",
      "Aces.",
      "Decks remaining.",
      "Player sat down at spot one.",
      "Seat two left the table.",
      "Player three hits.",
    ],
  },
] as const;

/** Flattened, in group order — the full v0.2 phrase catalog. */
export const NATIVE_VOICE_EXPANDED_PHRASES: readonly string[] = NATIVE_VOICE_EXPANDED_GROUPS.flatMap((g) => g.phrases);

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

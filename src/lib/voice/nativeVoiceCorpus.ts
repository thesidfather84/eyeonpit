/**
 * NATIVE VOICE CORPUS — the `VoiceCorpusEntry` format from
 * docs/EYEONPIT_NATIVE_VOICE_SPEC.md §7, extending (not replacing)
 * `voiceBenchmarkCorpus.ts`'s existing shape and the Sherpa Lab's own
 * `UtteranceRecord`. Two things live here:
 *
 *   1. `VoiceCorpusEntry`/`buildNativeVoiceCorpusEntry` — the REAL format a
 *      genuine Start Phrase -> Speak -> End Phrase session in the Native
 *      Voice Prototype Lab page produces. Every field is populated from an
 *      ACTUAL session; nothing here is fabricated device/browser/session
 *      metadata for a capture that never happened.
 *   2. `NATIVE_VOICE_REFERENCE_CASES` — real, already-on-record confusion
 *      cases imported from `voiceBenchmarkCorpus.ts`'s own
 *      `VOICE_BENCHMARK_CORPUS` (Dealer/Taylor, "and"->"in" fusion, a
 *      dangling-connector safety case) so this prototype's own safety tests
 *      can exercise them without asking Sidney to re-speak anything already
 *      captured — per the milestone brief's own "Do not require Sidney to
 *      repeat large tests" instruction. These are TEXT-only references
 *      (the same real captured alternatives arrays already on record
 *      elsewhere), never claimed as a fresh real-mic capture against Vosk —
 *      see each entry's own `capturedFrom`.
 *
 * DEVIATION FROM SPEC §7, DISCLOSED: `device`/`browserPlatform` are
 * OPTIONAL here, not required as spec's own interface literally shows.
 * Reason: the real historical captures referenced in
 * `NATIVE_VOICE_REFERENCE_CASES` (from PC field-test sessions run before
 * this corpus format existed) never recorded that metadata, and inventing
 * a plausible-sounding device string for them would be exactly the kind of
 * fabricated validation this codebase's own established discipline
 * (voiceBenchmarkCorpus.ts's own doc comment; every Whisper/Sherpa round's
 * "never fabricate validation" rule) forbids. A genuine NEW session built
 * via `buildNativeVoiceCorpusEntry` always populates both fields for real,
 * from `navigator.userAgent` — see that function's own doc comment.
 */
import { evaluateNativeVoiceTranscript, NATIVE_VOICE_NOISE_PHRASES, NATIVE_VOICE_PROTOTYPE_PHRASES } from "./nativeVoicePrototype";
import type { UniversalCommand } from "./universalCommand";
import { VOICE_BENCHMARK_CORPUS } from "./voiceBenchmarkCorpus";

export interface VoiceCorpusProviderResult {
  providerId: string;
  transcript: string | null;
  confidence: number | null;
  timingMs: { firstInterim: number | null; final: number | null };
  parserOutcome: "ACCEPT" | "REPEAT" | "REJECT";
  cardEventOutcome: "would-write" | "no-event";
  correctness: "correct" | "incorrect" | "unmarked";
  rejectionReason: string | null;
  knownConfusionTags: string[];
}

export interface VoiceCorpusEntry {
  id: string;
  expectedPhrase: string;
  expectedUniversalCommand: UniversalCommand[] | { rejects: true; reason: string };

  spokenLanguage: string;
  localeAccent?: string;
  speakerAnonymousId: string;

  /** DISCLOSED DEVIATION from spec §7 — see this module's own top-of-file doc comment: optional here, always populated for a real new session. */
  device?: string;
  browserPlatform?: string;
  microphoneType?: string;
  environmentNoiseCategory?: "quiet" | "casino-floor" | "office" | "outdoor" | (string & {});

  providerResults: VoiceCorpusProviderResult[];

  capturedFrom: "real-mic-contributor-lab" | "real-mic-owner-session" | "documented-grammar";
  recordedAt: string;
  consentRecordId?: string;
}

/**
 * Builds ONE real `VoiceCorpusEntry` from an actual Start Phrase -> Speak ->
 * End Phrase cycle in the Native Voice Prototype Lab page. Pure given its
 * inputs — the Lab page supplies the real transcript/timing/provider id it
 * just observed; this function only shapes it, it never invents any part
 * of it. `device`/`browserPlatform` come from the caller's own
 * `navigator.userAgent` read (browser-only, so left as plain string
 * parameters here rather than read inside this module, keeping this
 * function usable from Node-side tests with no `navigator` global).
 */
export function buildNativeVoiceCorpusEntry(input: {
  expectedPhrase: string;
  transcript: string;
  providerId: string;
  confidence: number | null;
  firstInterimMs: number | null;
  finalMs: number | null;
  device: string;
  browserPlatform: string;
  environmentNoiseCategory?: VoiceCorpusEntry["environmentNoiseCategory"];
  speakerAnonymousId: string;
  recordedAt: string;
}): VoiceCorpusEntry {
  const result = evaluateNativeVoiceTranscript(input.transcript);
  return {
    id: `native-voice:${input.recordedAt}:${input.providerId}`,
    expectedPhrase: input.expectedPhrase,
    expectedUniversalCommand: NATIVE_VOICE_PROTOTYPE_PHRASES.includes(input.expectedPhrase)
      ? EXPECTED_COMMANDS_BY_PHRASE[input.expectedPhrase]
      : { rejects: true, reason: "Not one of the 7 prototype phrases." },
    spokenLanguage: "en-US",
    speakerAnonymousId: input.speakerAnonymousId,
    device: input.device,
    browserPlatform: input.browserPlatform,
    environmentNoiseCategory: input.environmentNoiseCategory,
    providerResults: [
      {
        providerId: input.providerId,
        transcript: input.transcript,
        confidence: input.confidence,
        timingMs: { firstInterim: input.firstInterimMs, final: input.finalMs },
        parserOutcome: result.verdict,
        cardEventOutcome: result.wouldProduceCardEvent ? "would-write" : "no-event",
        correctness: "unmarked",
        rejectionReason: result.reason,
        knownConfusionTags: result.appliedRuleIds,
      },
    ],
    capturedFrom: "real-mic-owner-session",
    recordedAt: input.recordedAt,
  };
}

/** Expected UniversalCommand per prototype phrase — see universalCommand.ts's own KNOWN DEVIATION doc comment for phrases 5/7. */
const EXPECTED_COMMANDS_BY_PHRASE: Record<string, UniversalCommand[]> = {
  "Dealer has a five.": [{ op: "DEAL_CARD", target: { kind: "dealer" }, rank: "5" }],
  "Dealer has a king.": [{ op: "DEAL_CARD", target: { kind: "dealer" }, rank: "10" }],
  "Player one has a five.": [{ op: "DEAL_CARD", target: { kind: "seat", seat: 1 }, rank: "5" }],
  "Player three has a king.": [{ op: "DEAL_CARD", target: { kind: "seat", seat: 3 }, rank: "10" }],
  "Player three hits.": [{ op: "SELECT_TARGET", target: { kind: "seat", seat: 3 } }],
  "Start count.": [{ op: "COUNT_CONTROL", action: "START" }],
  "End count.": [{ op: "COUNT_CONTROL", action: "PAUSE" }],
};

/**
 * Real confusion cases already on record in `voiceBenchmarkCorpus.ts`,
 * reshaped as `VoiceCorpusEntry`s so the Native Voice Prototype's own
 * safety tests can exercise them (Dealer/Taylor recovery, "and"/"in"
 * connector fusion, the false-SEAT5:3-shaped dangling-connector rejection)
 * without a new real-mic capture. `capturedFrom` is preserved honestly from
 * the source item ("real-mic" there -> "real-mic-owner-session" here, since
 * that's literally what those PC field-test captures were;
 * "documented-grammar" stays "documented-grammar").
 */
export const NATIVE_VOICE_REFERENCE_CASES: VoiceCorpusEntry[] = VOICE_BENCHMARK_CORPUS.filter((item) =>
  ["taylor-king-and-five", "taylor-king-in-five", "spotify-five", "player-five-has-a-incomplete", "spotify-is-dead"].includes(item.id)
).map((item) => {
  const result = evaluateNativeVoiceTranscript(item.transcript);
  return {
    id: `reference:${item.id}`,
    expectedPhrase: item.transcript,
    expectedUniversalCommand: item.expected.accepted ? result.commands : { rejects: true, reason: item.note },
    spokenLanguage: "en-US",
    speakerAnonymousId: "reference-corpus",
    providerResults: [
      {
        providerId: "browser-web-speech",
        transcript: item.transcript,
        confidence: null,
        timingMs: { firstInterim: null, final: null },
        parserOutcome: result.verdict,
        cardEventOutcome: result.wouldProduceCardEvent ? "would-write" : "no-event",
        correctness: "unmarked",
        rejectionReason: result.reason,
        knownConfusionTags: result.appliedRuleIds,
      },
    ],
    capturedFrom: item.capturedFrom === "real-mic" ? "real-mic-owner-session" : "documented-grammar",
    recordedAt: "2026-08-20",
  };
});

/** All 7 prototype phrases + the existing noise set, as bare corpus-shaped entries for the Lab page's Quick Smoke Test — text-only expectations, no provider results yet (populated live by the Lab page as each phrase is actually spoken). */
export const NATIVE_VOICE_SMOKE_TEST_PHRASES: readonly string[] = [...NATIVE_VOICE_PROTOTYPE_PHRASES];
export const NATIVE_VOICE_SMOKE_TEST_NOISE_PHRASES: readonly string[] = [...NATIVE_VOICE_NOISE_PHRASES];

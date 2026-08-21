# EyeOnPit Native Voice Architecture & International Voice Lab — Design Spec

**Status: DESIGN / RESEARCH ONLY. Zero production code changed by this
document.** Confirmed: no file under `src/` was modified to produce this
spec. Chrome/Web Speech, Sherpa-ONNX, and Whisper.cpp remain exactly what
they already were — a shipped production provider (Browser Web Speech) and
two research/reference providers (Sherpa, Whisper) behind the `/lab`
passcode gate — and are frozen at their current state for this milestone.
No further deep modification to any of the three is in scope here.

This document supersedes nothing already true: `docs/EYEONPIT_VOICE_ARCHITECTURE.md`
(the `SpeechProvider` abstraction, as built), `docs/EYEONPIT_1_9_VOICE_INDEPENDENCE.md`
(benchmark methodology, Firefox gap), and `docs/EYEONPIT_1_8_GLOBAL_ARCHITECTURE.md`
§6 (the original `VoiceLanguagePack` sketch) all remain current and are
extended, not replaced, below.

---

## 1. Current voice-system inventory (as of this audit)

Full detail lives in the files cited; this section is the load-bearing
summary a schema/architecture decision can be made from.

### 1.1 The pipeline today

```
MIC
 │
SpeechProvider  [ BrowserWebSpeechProvider (PRODUCTION) |
                  SherpaOnnxProvider (Lab, EXPERIMENTAL) |
                  WhisperCppProvider (Lab, EXPERIMENTAL) ]
 │  (raw transcript + n-best alternatives + isFinal — nothing else)
CasinoVoiceContext        (hotword/vocabulary bias — inert today)
 │
EyeOnPit Transcript Resolver
 (normalizeTranscript.ts, nBestResolver.ts, classifyVoiceTranscript.ts)
 │
EyeOnPit Narration Parser
 (parseNarration.ts, parseVoiceCommand.ts, parseTableChangeCommand.ts,
  parseReadOnlyQuery.ts, parseSetActiveTargetIntent.ts,
  parseSplitDoubleCommand.ts, parseSplitHandCardCommand.ts,
  lifecyclePhrases.ts)
 │
EyeOnPit Safety Gate (never-guess-on-ambiguity, enforced inside parsers)
 │
CardEvent Ledger → Count Engine
```

`SpeechProvider`'s contract (`src/lib/voice/speechProvider.ts`) is already
exactly the seam a Phase 4 acoustic-model interface needs to sit behind —
this is real, tested, shipped code, not aspirational:

```ts
export interface SpeechProviderResult {
  transcript: string; confidence: number | null; isFinal: boolean;
  alternatives: SpeechProviderAlternative[];
}
export interface SpeechProvider {
  readonly providerId: string; readonly supported: boolean;
  start(): void; stop(): void;
  suppressForSpeech(): void; resumeAfterSpeech(): void;
}
```

### 1.2 Every command intent the parser recognizes today

| Intent | Representation |
|---|---|
| Select seat / dealer as target | `select-seat` / `select-dealer` |
| Enter a card (rank, optional target) | `card` |
| Finish hand / advance / undo | `done` / `next` / `undo` |
| Read-only: count / status | `count` / `status` |
| Multi-op hand narration | `NarrationOp[]` (`selectTarget`/`card`/`workflow`) |
| Seat occupied / vacated | `seat-joins` / `seat-leaves` |
| Split a spot | `split` |
| Double a spot (bare or hand-qualified) | `double` |
| Card into a specific split hand | `card` + `hand: 1\|2` |
| Set active target (no CardEvent) | intent-prefix match, no mutation |
| Read-only query (status/system/rc/tc/aces/decks/repeat) | `ReadOnlyQuery` union |
| Lifecycle (pause/resume/new shoe/end investigation/full status) | exact-phrase constants |
| Note dictation start/end/cancel | phrase set + regex |
| Inert action words (hit/stand/split/double/surrender/insurance as bare narration) | consumed, **no op** — "another card entered is an implicit hit, ending entry is an implicit stand" |

There is **no** discrete hit/stand mutation by design. Player-decision
actions beyond the explicit split/double grammar (surrender, insurance,
wager mutation) are `PLANNED`/`FUTURE` per `docs/EYEONPIT_PRODUCT_SPEC.md`
§5's status matrix — not a gap this milestone needs to close, but the
schema in §2 below must not foreclose them.

### 1.3 The scale of English-specific ASR-confusion handling

This is the single most important audit finding for Phase 3. English's
"grammar" is not really a grammar — it is a **large, empirically-discovered
table of one recognizer's own mishearings**, e.g. (exact, from source):

- `SEAT_PREFIX_ASR_VARIANTS = new Set(["set","seet","ceit","see","cheap"])`
- `"seat one"` → `"C1"`/`"S1"`/`"T5"` (`SEAT_LETTER_TOKEN_RE = /^[cst]([0-9]+)$/`)
- `"player"` → `"play your"`/`"play are"`/`"play Air"`/`"play everyone"`, `"play R2"` for "player two", `"play sat"` for "player sat [down]"
- `"dealer"` → `"Taylor"`/`"Spotify"` (Chrome path, recovered as a
  last-resort classifier rule) vs. `"KILLER"`/`"TILLER"` (Sherpa path, a
  **different** confusion pair on a **different** engine — confirmed NOT
  recoverable by the Chrome-tuned recovery rule)
- `"and"` → `"in"` ("has a 10 in a 3")
- `"eight"` → `"eighth"` (kept); `"eight"` → `"ate"` (deliberately excluded — collision risk)
- `"start"` → `"spot"` only when immediately followed by a seat number
- `"sat"` → `"that"` ("players that down at spot three")

Every one of these was discovered through real field testing on ONE
recognizer (Chrome's Web Speech backend) and, separately, ONE more on
Sherpa's zipformer model — they do not transfer to a different acoustic
model, and they emphatically do not transfer to a different **language**.
This is the concrete evidence behind Phase 3's design principle: a
language pack is not a translation table, it is a from-scratch,
field-tested ASR-confusion corpus per (language × acoustic model) pair.

### 1.4 Providers, real measured findings

| Provider | Engine | Deployment | Status |
|---|---|---|---|
| `BrowserWebSpeechProvider` | Browser-native (`SpeechRecognition`) | Same-origin, in-page | **PRODUCTION** (not yet wired to `VoiceControl.tsx` even in provider-wrapper form — see §6 of `EYEONPIT_VOICE_ARCHITECTURE.md`) |
| `SherpaOnnxProvider` | sherpa-onnx v1.13.6, `streaming-zipformer-en-2023-06-21` (Apache-2.0, ~20M params) | In-process WASM, ~205MB assets on Vercel Blob | Lab/EXPERIMENTAL — real audio verified word-for-word exact on 2 LibriSpeech clips, but real-mic field session found genuine truncation/hypothesis-swap bugs (below) |
| `WhisperCppProvider` | whisper.cpp `command.wasm`, pinned `339f2b4e`, `ggml-tiny.en-q5_1` | **Isolated cross-origin iframe** (`whisper-static-lab.vercel.app`) + narrow postMessage protocol; in-process WASM confirmed broken under Next.js's own serving stack | Lab/EXPERIMENTAL — standalone real transcription proven; a same-day production bug (missing `force_finalize` binding, real short phrases silently returning "no speech detected") was found and fixed this same round on the isolated origin, independent of this design milestone |

Real, quantified confusion/failure data already on record (not
hypothetical):

- Sherpa, hotwords + wrong `modelingUnit`: `"Dealer has a five"` → **"Taylor"**;
  `"Dealer showing ten"` → **"Tillers... a tin"**. Root-caused to a BPE
  vocab trained uppercase-only being queried with lowercase hotword text —
  fixed as an opt-in config, accuracy improvement **not yet measured**.
- Sherpa, real-mic field session (Config C): expected `"Dealer has a
  king"` → final `"DEALER HAS"` (two words lost, a delivery race, fixed);
  expected `"Dealer has a king and a five"` → final `"DEALER HAS A KING
  IN"` (a divergent beam-search hypothesis swap, **not recoverable**,
  explicitly left as an open, disclosed gap).
- A real, production `parseNarration.ts` bug (not provider-specific):
  `"Has a five and a three"` (no seat named) → Sherpa misheard as "FIVE IN
  THE THREE" → a **false SEAT5:3 CardEvent**. Fixed 2026-08-20 by
  requiring the leading-seat-shorthand connector be exactly `"has"`. This
  is the single most important type of failure in the entire audit: a
  parser-level bug that let *any* provider silently corrupt the count.
- No iPhone/Safari device test exists anywhere in the docs or code —
  explicitly disclosed as untested, not merely unverified.
- Firefox has no native `SpeechRecognition` at all; the WASM path is
  architecturally the only route there and is itself untested on Firefox.

### 1.5 The Lab today

Flow: Select provider (+ A/B/C config for Sherpa) → Start Phrase → speak →
End Phrase → mark correct/incorrect → Next Phrase, against a fixed
29-phrase corpus (`DEALER_STRESS_PHRASES`/`PLAYER_PHRASES`/`NOISE_PHRASES`
in `page.tsx`). Never writes a CardEvent — `classifyVoiceTranscript` is
invoked read-only, purely for display. Export shape (`UtteranceRecord`,
already exists, already real):

```ts
interface UtteranceRecord {
  index: number; recordedAt: string; provider: ProviderChoice; abConfig: AbConfig | null;
  expectedPhrase: string | null; interims: InterimSnapshot[]; finalText: string | null;
  confidence: number | null; firstInterimMs: number | null; finalMs: number | null;
  error: string | null; skipped: boolean; classification: ClassificationSummary | null;
  correctness: "unmarked" | "correct" | "incorrect";
}
```

A separate, distinct corpus already exists purely to score the
**classifier** against known-difficult transcripts without live ASR:
`voiceBenchmarkCorpus.ts`'s `VOICE_BENCHMARK_CORPUS` (14 items, each
`capturedFrom: "real-mic" | "documented-grammar"`, `falseCardEvents`
tracked as the single most important field, currently `0` across the
whole corpus).

---

## 2. Lessons learned (the actual design inputs)

1. **English's own parser is not a language module — it's an ASR-confusion
   table for one specific engine plus a hand-written grammar.** Any
   schema that assumes "swap the vocabulary, keep the grammar" will
   misparse in most target languages (word order, connector words, and
   confusion patterns are not portable).
2. **Different acoustic models produce different confusions for the SAME
   language.** "Dealer" → "Taylor" (Chrome) and "Dealer" → "Tiller"
   (Sherpa) are two unrelated recovery rules. A language pack must be
   scoped to (language, acoustic-model-family), not language alone, or it
   must be provably normalized upstream of model-specific quirks — the
   corpus format in §6 records both so this can be measured, not assumed.
3. **The most dangerous failure class is a false CardEvent from an
   under-scoped grammar rule, not a raw ASR misrecognition.** The real
   SEAT5:3 incident happened in EyeOnPit's own parser, independent of
   which engine supplied the transcript. This is why the safety model
   (§5) makes REJECT the default outcome of disagreement, at every layer,
   language-independent.
4. **A provider that improves raw accuracy but increases false CardEvents
   is a regression**, already established policy
   (`EYEONPIT_1_9_VOICE_INDEPENDENCE.md` §6) — restated here because it
   applies identically to every future acoustic model and every future
   language pack, not just the two Lab providers it was written for.
5. **In-process WASM in this Next.js app is a real, load-bearing
   constraint**, not a one-off Whisper bug: pthread worker-pool bootstrap
   under Next.js's own serving stack is unreliable (root-caused, not
   guessed). Any future on-device acoustic model needs either a
   single-threaded build or the same isolated-origin-iframe pattern
   Whisper now uses — this is now a proven, reusable architecture
   primitive, not a Whisper-specific workaround.
6. **Small models lose non-English accuracy fast** (§9) — a model-size
   decision cannot be made per-architecture, it has to be made per target
   language, because the same small model can be fine for English and
   unusable for Cantonese.
7. **Never fabricate validation.** Every existing doc in this repo is
   explicit about what was and was not measured (real audio vs. text-only
   classifier scoring; "not yet measured" flagged inline rather than
   omitted). The corpus and contributor-Lab design below (§6, §7) exist
   specifically so a language pack can be honestly marked verified/
   unverified, never assumed.

---

## 3. The Universal EyeOnPit Command Schema

A language-independent semantic command, derived directly from §1.2 (not
invented functionality) — every existing intent maps onto this 1:1, with
room for the already-`PLANNED` player-action/wager intents to slot in
later without a schema break.

```ts
type UniversalTarget =
  | { kind: "dealer" }
  | { kind: "seat"; seat: number; hand?: 1 | 2 };   // hand: split-hand qualifier

type UniversalCommand =
  | { op: "DEAL_CARD"; target: UniversalTarget; rank: CanonicalRank }
  | { op: "SELECT_TARGET"; target: UniversalTarget }
  | { op: "PLAYER_ACTION"; target: UniversalTarget; action: "SPLIT" | "DOUBLE" | "SURRENDER" | "INSURANCE" } // HIT/STAND stay implicit — see §1.2
  | { op: "PLAYER_ENTER"; seat: number }
  | { op: "PLAYER_LEAVE"; seat: number }
  | { op: "HAND_DONE" }
  | { op: "HAND_NEXT" }
  | { op: "HAND_UNDO" }
  | { op: "COUNT_QUERY"; kind: "COUNT" | "STATUS" | "RC" | "TC" | "ACES" | "DECKS" | "SYSTEM" | "REPEAT"; system?: CanonicalCountSystem }
  | { op: "COUNT_CONTROL"; action: "START" | "PAUSE" | "RESUME" | "NEW_SHOE" | "END_INVESTIGATION" }
  | { op: "NOTE"; action: "START" | "END" | "CANCEL"; text?: string }
  | { op: "BET_CHANGE"; target: UniversalTarget; amount: number };  // PLANNED downstream (§14 of PRODUCT_SPEC) — schema-ready, not implemented

type CanonicalRank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10";
type CanonicalCountSystem = "HI_LO" | "KO" | "ZEN" | "OMEGA_II" | (string & {}); // open for custom methods, see countMethodRegistry.ts
```

**Design rules, all directly justified by §1/§2:**

- `CanonicalRank`/count values are always the mathematical value, in
  every language — a language pack never invents or translates a rank
  value, only the *words* that map onto one (§4).
- `UniversalCommand` is produced ONLY after §4's normalizer + §5's safety
  gate — the counting engine and CardEvent ledger consume
  `UniversalCommand` exclusively and are never language-aware, exactly as
  instructed. This is additive to, not a replacement for, the existing
  `VoiceCommandKind`/`NarrationOp`/canonical-`CanonicalStep` types in
  `parseVoiceCommand.ts`/`parseNarration.ts`/`classifyVoiceTranscript.ts`
  — those remain the real, working English implementation; a
  `UniversalCommand` is what a FUTURE constrained decoder (§4) emits
  directly, and what English's own parser could be refactored to also
  emit, once a second real language pack is actually being built (mirrors
  the explicit non-speculative-refactor rule already set in
  `EYEONPIT_1_8_GLOBAL_ARCHITECTURE.md` §6).
- No intent exists in this schema that isn't already real (§1.2) or
  already `PLANNED` with a designed dispatch path (`BET_CHANGE`, per
  `EYEONPIT_PRODUCT_SPEC.md` §14).

---

## 4. LanguagePack specification

```ts
interface LanguagePack {
  locale: string;              // BCP-47, e.g. "en-US", "es-MX", "yue-HK" (Cantonese)
  languageName: string;        // display name, in that language's own script
  version: string;             // semver — packs are versioned independently of app releases
  status: "VERIFIED" | "UNVERIFIED_MACHINE_DRAFT" | "PLANNED";

  vocabulary: {
    targetWords: Record<string, "dealer" | "seat" | "player" | "spot">; // word -> canonical role
    rankWords: Record<string, CanonicalRank>;
    numberWords: Record<string, number>;      // for seat numbers, hand numbers, bet amounts
    actionWords: Record<string, UniversalCommand["op"] | "INERT">; // INERT mirrors §1.2's hit/stand-are-implicit rule
    workflowWords: Record<string, "DONE" | "NEXT" | "UNDO" | "COUNT" | "STATUS">;
  };

  grammar: {
    targetPhrasePatterns: string[];   // e.g. English's "<prefix> <connector>? <prefix2>? <number>" family
    cardPhrasePatterns: string[];
    connectorWords: string[];         // language's own equivalent of "has"/"and"/"with"/"gets"/"shows"
    fillerWords: string[];            // language's own equivalent of "a"/"an"/"the"/"card"
  };

  asrConfusions: Array<{
    acousticModelFamily: string;      // e.g. "browser-web-speech-chrome", "whisper-tiny", "sherpa-zipformer"
    heard: string;                    // exact confused text
    expected: string;                 // what was actually said
    recoveryRule?: string;            // id of the recovery rule that handles it, if any
    sourceSession: string;            // field-test session id/date this was captured from — never invented
  }>;

  normalizationRules: string[];       // language-specific text normalization before matching (diacritics, tone-mark handling, etc.)

  verification: {
    verifiedBy: "native-speaker-field-test" | "machine-translation-unverified";
    fieldTestSessions: string[];      // corpus session ids (§6) — empty array is a valid, honest state
    knownGaps: string[];
  };
}
```

**English is the first reference pack**, built by describing (not yet
refactoring) the real, existing `parseVoiceCommand.ts`/`parseNarration.ts`
tables from §1.3 in this shape — refactoring English's own parser to
literally consume a `LanguagePack` object is deferred until a second real
pack is actually under construction, per the already-established
non-speculative-refactor rule.

**Every other language starts at `status: "PLANNED"`.** No pack in this
repo may claim `"VERIFIED"` without at least one real
`fieldTestSessions` entry from a native speaker. Machine-translated
vocabulary may exist as a `"UNVERIFIED_MACHINE_DRAFT"` starting point for
a contributor session (§7) to correct — it must never be presented as
validated, and no such pack exists in this repo today.

---

## 5. Acoustic model interface (Phase 4)

```
MICROPHONE
 → AUDIO FRONT END          (capture, resample to model's native rate, VAD/segmentation)
 → ACOUSTIC MODEL            (replaceable — see AcousticModelResult below)
 → EYEONPIT CONSTRAINED DECODER   (biases/restricts decoding toward the active LanguagePack's vocabulary)
 → LANGUAGE NORMALIZER       (LanguagePack.normalizationRules + asrConfusions)
 → UNIVERSAL COMMAND          (§3)
 → SAFETY VALIDATOR          (§5 below)
 → EXISTING PARSER / CardEvent SYSTEM (unchanged)
```

What an acoustic model must return — deliberately not Whisper- or
Sherpa-specific, and a strict superset of what `SpeechProviderResult`
already carries today (so today's providers already satisfy the minimum):

```ts
interface AcousticModelResult {
  tokens: string[];                          // required — minimum viable output
  tokenProbabilities?: number[];              // optional — enables confidence propagation (§5)
  phonemes?: string[];                        // optional — some engines (e.g. phoneme-level CTC) expose this; enables pronunciation-level LanguagePack matching instead of word-level only
  timing?: { startMs: number; endMs: number }[]; // optional — per-token, enables trailing-word-loss detection (the exact Sherpa bug in §1.4)
  confidence: number | null;                  // whole-utterance, may be derived from tokenProbabilities
  alternatives: { transcript: string; confidence: number | null }[]; // n-best, feeds nBestResolver.ts unchanged
  isFinal: boolean;
  supportsConstrainedDecoding: boolean;       // honest capability flag — see §5.2
}
```

**`supportsConstrainedDecoding`** is the one field with no precedent in
`SpeechProviderResult` today, and it is the reason Phase 6/9 research
below evaluates it explicitly per candidate model: a model whose decoder
accepts a grammar/vocabulary restriction (e.g. a CTC/transducer model with
accessible token probabilities, or a beam-search API that accepts a
biasing list — the same shape Sherpa's own real, shipped `hotwordsFile`
mechanism already proves is achievable) can have the Constrained Decoder
stage actually restrict output to the active LanguagePack's vocabulary,
which is a materially stronger safety property than post-hoc text
matching. A model that only exposes final text (`tokens` only, no
probabilities) still works — it just can't get this stronger guarantee,
and the Constrained Decoder stage degrades to exactly what
`classifyVoiceTranscript.ts` already does today.

---

## 6. Safety / confidence model

Three outcomes only, matching the ALREADY-established real behavior of
`classifyVoiceTranscript`/`nBestResolver` — this section formalizes
existing, working policy, it does not invent a new one:

- **ACCEPT** — a `UniversalCommand` is produced and handed to the parser/
  CardEvent system.
- **REPEAT** — recognized as an attempted command but rejected as
  ambiguous/unsafe (mirrors today's `RejectionCode` set —
  `INCOMPLETE_NARRATION`, `CONFLICTING_ALTERNATIVES`,
  `AMBIGUOUS_HAND_TARGET`, `UNCERTAIN_LANGUAGE`, etc.) — operator is asked
  to repeat, nothing is written.
- **REJECT** — not recognized as a command at all (`UNKNOWN_COMMAND`,
  `EMPTY_TRANSCRIPT`) — silently ignored, exactly like today's
  "Spotify is dead" class of test case.

**NO EVENT > WRONG EVENT**, stated as hard rules (not guidelines):

1. Target disagreement (which seat, or dealer-vs-seat) between N-best
   alternatives, or between the Constrained Decoder's top candidates, is
   always REPEAT — never resolved by picking the higher-probability one.
   This is the existing `nBestResolver.ts` rule (`CONFLICTING_ALTERNATIVES`),
   restated as language-independent.
2. Card-rank disagreement is always REPEAT, same rule, same reasoning:
   a wrong rank silently corrupts the count exactly like a wrong target.
3. `supportsConstrainedDecoding: false` does not lower the safety bar —
   it only means the Constrained Decoder stage does less work upstream;
   the same REPEAT/REJECT rules still apply to whatever text comes out.
4. Confidence propagation: `tokenProbabilities`, where available, flow
   into the SAME decisive-margin logic `nBestResolver.ts` already uses
   for n-best alternatives (a real margin threshold between the top two
   candidates, not a single-model confidence score in isolation — single-
   model confidence is a known-unreliable signal on its own, per the
   existing `confidence: number | null` field already being informational-
   only in `SpeechProviderResult` today).
5. A `LanguagePack` with `status: "UNVERIFIED_MACHINE_DRAFT"` must degrade
   the REPEAT/REJECT threshold to be MORE conservative, not equally
   permissive — an unverified vocabulary table is itself a source of
   ambiguity risk (mistranslated word colliding with a different
   canonical rank/target) until a real field session verifies it.

---

## 7. EyeOnPit Voice Corpus format (Phase 6)

Extends `voiceBenchmarkCorpus.ts`'s existing shape and the Lab's own
existing `UtteranceRecord` (§1.5) — not a parallel format:

```ts
interface VoiceCorpusEntry {
  id: string;
  expectedPhrase: string;
  expectedUniversalCommand: UniversalCommand | { rejects: true; reason: string };

  spokenLanguage: string;          // BCP-47 locale
  localeAccent?: string;           // free text, e.g. "Mexico City", "Cantonese-HK"
  speakerAnonymousId: string;      // opaque id — see §8, never a real name/identifier

  device: string;                  // "iPhone 15", "Pixel 8", "Windows PC", etc.
  browserPlatform: string;
  microphoneType?: string;         // "built-in", "headset", "AirPods", etc.
  environmentNoiseCategory?: "quiet" | "casino-floor" | "office" | "outdoor" | (string & {});

  providerResults: Array<{
    providerId: string;            // e.g. "whisper-cpp", "sherpa-onnx", "browser-web-speech", future acoustic models
    transcript: string | null;
    confidence: number | null;
    timingMs: { firstInterim: number | null; final: number | null };
    parserOutcome: "ACCEPT" | "REPEAT" | "REJECT";
    cardEventOutcome: "would-write" | "no-event";
    correctness: "correct" | "incorrect" | "unmarked";
    rejectionReason: string | null;
    knownConfusionTags: string[];  // e.g. ["dealer-taylor", "and-in-fusion"]
  }>;

  capturedFrom: "real-mic-contributor-lab" | "real-mic-owner-session" | "documented-grammar";
  recordedAt: string;              // ISO timestamp
  consentRecordId?: string;        // §8 — required when capturedFrom is contributor-lab
}
```

Directly reuses `falseCardEvents` as the single highest-priority
aggregate metric (already established policy, §2 point 4), computed the
same way `computeBenchmarkMetrics` already does today, now cross-tabulated
by `spokenLanguage` × `providerResults[].providerId`. No PII beyond an
opaque `speakerAnonymousId` — see §8.

---

## 8. International Contributor Voice Lab — design only, NOT launched

Workflow (matches the requested shape exactly):

```
Private invite (unique, single-use link — no public signup)
 → Contributor selects language/locale
 → Explicit consent screen (§8.1) — recording cannot start before this
 → Microphone check (visual level meter, no recording)
 → Displayed phrase (drawn from an ISOLATED phrase set — §8.2)
 → Start Recording → speak → End Recording
 → Playback/confirm (contributor can re-record before submitting)
 → Next phrase
 → Secure upload (see §8.3)
 → Anonymous speaker ID assigned (never tied to invite identity in the corpus itself)
 → Corpus ingestion → VoiceCorpusEntry (§7), capturedFrom: "real-mic-contributor-lab"
```

### 8.1 Consent & privacy

- Explicit, affirmative consent required before ANY recording — no
  implicit consent from merely opening the link.
- Consent text must state: what is recorded (audio only, of the displayed
  phrase, nothing else), how long it's retained, that it may be used to
  improve EyeOnPit's voice recognition, and that it can be deleted on
  request.
- **No hidden recording. No recording outside an active phrase capture
  window** — the mic must be demonstrably OFF between "End Recording" and
  the next "Start Recording", enforced the same way the existing
  providers already tear down `getUserMedia` streams on `stop()`
  (`browserWebSpeechProvider.ts`/`sherpaOnnxProvider.ts`/
  `whisperCppProvider.ts` all already do this correctly today — same
  pattern, new caller).
- Contributor data deletion: a `consentRecordId` (§7) is the only link
  between a contributor and their recordings; deleting that record and
  its associated audio/corpus entries must be a single, complete
  operation — designed here, not built.
- Recordings stored **separately** from operational EyeOnPit data — a
  distinct storage bucket/project, never in the same database as
  investigation/CardEvent data, mirroring the existing separation already
  established for Whisper's own isolated origin (`whisper-static-lab`)
  and Sherpa's own external asset host.

### 8.2 Isolation from proprietary logic

- The phrase set shown to a contributor is a **fixed, pre-approved list**
  (the English prototype's own phrase set, §10, translated/adapted per
  language pack under construction) — never the live counting engine,
  never live investigation data, never the owner's own `/lab` research
  tools.
- Contributor session has NO code path that can reach
  `src/lib/counting-engine/`, `src/lib/gold-standard/`, or any
  investigation/CardEvent API — architecturally a separate app surface,
  not a permission check on the existing one.

### 8.3 Practical requirements

- **Mobile-first**, iPhone/Android prioritized — the target contributor
  population is a native speaker recording from their own phone, not a
  researcher at a desk.
- Very simple instructions; native-language instructions per pack once
  that pack exists (a bootstrapping problem for the FIRST contributor of
  a brand-new language, acknowledged, not solved here).
- Rate limiting / invite controls (single-use links, expiry) and an audit
  trail (who was invited, when, consent timestamp, submission count) —
  standard controls, no new pattern needed beyond what
  `src/lib/auth/rateLimit.ts` (already used for the `/lab` and app
  passcode gates) already provides.
- Compensation tracking: designed as a field on the invite/consent
  record (amount owed, currency, status), no payment processing built —
  explicitly out of scope per instruction.

---

## 9. Offline requirement (Phase 8)

**Hard requirement, stated explicitly:** operational EyeOnPit voice
recognition must function with zero cloud ASR, zero internet dependency,
zero third-party API availability at the moment of use. This is a
**stronger** requirement than what `BrowserWebSpeechProvider` can
currently guarantee — Chrome's own `SpeechRecognition` backend is, for
most of its supported languages, itself a cloud call the browser vendor
controls invisibly (already flagged as a real, inherited constraint in
`EYEONPIT_1_9_VOICE_INDEPENDENCE.md` §5). Meeting the offline requirement
is therefore, on its own, sufficient justification for eventually moving
off Browser Web Speech as the ONLY production provider — independent of
any language-expansion motivation.

- Model assets MAY be downloaded once during installation/setup (matches
  how Sherpa/Whisper's own ~30–200MB asset bundles already work today) —
  this is a one-time provisioning step, not a per-use dependency.
- The Research/Contributor Lab (§8) MAY use the internet freely — it is
  never part of the operational path.
- `docs/EYEONPIT_PRODUCT_SPEC.md` §3 ("Voice may degrade when offline...
  but voice degrading must never disable or block the investigation")
  remains the correct fallback behavior for whatever gap exists before a
  fully offline-capable model is shipped — this requirement does not
  relax that existing rule, it tightens the target the whole voice stack
  is eventually held to.

---

## 10. Candidate acoustic-model research (Phase 9 — research only, nothing selected)

Real, current (August 2026) findings, not assumptions:

| Candidate | Size | Multilingual | Offline/on-device | Constrained decoding | License | Verdict |
|---|---|---|---|---|---|---|
| **Whisper (tiny/base/small)** | 39–244MB | ~99 languages, ONE model | Yes, proven — already EyeOnPit's own Lab provider | No native support; text-only output from `command.wasm`'s exported API today | MIT | Broad coverage, but tiny/small accuracy on non-English is weak — Cantonese small-model CER measured at ~39% (large-v3 ~10%, but large is not on-device-friable at this repo's scale). Already integrated, already has the isolated-iframe deployment pattern proven (§2 point 5) — the strongest "reuse what we already built" candidate for English and probably Spanish/French/German/Portuguese, weakest for Cantonese/Khmer without per-language fine-tuning. |
| **Moonshine (Useful Sensors)** | as small as 27MB | **Per-language models, not one multilingual model** — Arabic, Japanese, Korean, Mandarin, Spanish, Ukrainian, Vietnamese as of v2 (Feb 2026); notably **no French, Cantonese, Tagalog, Portuguese, German, or Khmer** yet | Yes, purpose-built for edge/resource-constrained hardware | Not established from current public docs | Open (per-model — verify per language before adoption) | Best-in-class size/latency where it covers a language EyeOnPit needs; real coverage gap for roughly half the target list today. Worth re-evaluating on a rolling basis as language coverage grows, not a first-prototype candidate given the gap. |
| **Vosk** | Small, per-language models, tens of MB | Broad language list via separate small models | Yes, explicitly designed for laptops/mobile/embedded | Grammar-restriction API exists (Vosk supports a JSON grammar list to constrain recognition) — closest match to the Constrained Decoder need in §5 | Apache-2.0 | The one candidate with an **existing, real, constrained-decoding API** rather than a hypothetical one — directly relevant to §5's `supportsConstrainedDecoding` design. Worth a real prototype comparison against Whisper before committing to either. |
| **sherpa-onnx (non-English models)** | Varies, zipformer family | Per-language / regional-bilingual models (e.g. Chinese+English bilingual exists — relevant for Mandarin, and Cantonese-adjacent research exists in the k2-fsa ecosystem) | Yes — already EyeOnPit's own Lab provider architecture | Real, shipped, already-used hotword-biasing mechanism (`hotwordsFile` + `modified_beam_search`) — the closest thing to constrained decoding EyeOnPit has already integrated and measured | Apache-2.0 | Already integrated; the hotword mechanism is the most concretely proven constrained-decoding precedent in this repo today, but real field testing (§1.4) also found unrecovered beam-search hypothesis-swap failures — a real, disclosed accuracy risk, not just an integration cost. |

**No commercial/cloud STT service was evaluated** — the offline
requirement (§9) rules them out for the operational path by definition;
they remain irrelevant to this milestone regardless of accuracy.

**Recommendation for further (not started) research, in priority order:**
1. Vosk, specifically for its real grammar-constrained decoding API — the
   single most direct match to §5's safety model.
2. Whisper tiny/base, for English and the Latin-script languages
   (Spanish, French, Portuguese, German) where its accuracy is already
   known-reasonable and EyeOnPit already has a proven deployment pattern.
3. A dedicated per-language investigation for Cantonese, Khmer, and
   Tagalog specifically — none of the three top candidates has strong,
   verified small-model coverage for all three today; this may require
   either a fine-tuned community Whisper variant (one was found to exist
   for Khmer on Hugging Face, unverified) or accepting a larger/slower
   model for those specific languages as a deliberate, disclosed
   trade-off rather than a uniform requirement across all twelve target
   languages.

Sources consulted (August 2026 web search, not training-data assumptions):
Moonshine v2 language coverage and size; Whisper Cantonese small-vs-large
CER figures; Vosk's stated offline/embedded design target; sherpa-onnx's
published pretrained-model catalog.

---

## 11. First prototype plan — English only

Matches the requested representative set exactly (already real phrases
from `page.tsx`'s own corpus where they overlap):

```
Dealer has a five.
Dealer has a king.
Player one has a five.
Player three has a king.
Player three hits.
Start count.
End count.
```

Plus the existing `NOISE_PHRASES` set (already built, already proven
useful) to verify rejection of unrelated speech continues to hold under
whatever new acoustic model is prototyped.

**Measurable gates** (extends, does not replace, the existing benchmark
methodology in `EYEONPIT_1_9_VOICE_INDEPENDENCE.md` §6):

| Metric | Gate |
|---|---|
| False CardEvent rate | **Highest priority — must be 0 on this phrase set before any further expansion**, matching existing policy that a false CardEvent is worse than any number of rejections |
| Command accuracy | Full command (target + rank + action all correct) |
| Target accuracy | Correct dealer/seat resolved, scored independently of rank |
| Card accuracy | Correct rank resolved, scored independently of target |
| Rejection rate | Valid commands incorrectly rejected — costs operator time, never corrupts data, tracked separately from false CardEvents per existing asymmetric-severity policy |
| Latency | Utterance-end to final `UniversalCommand`, same measurement point `SpeechProviderResult.isFinal` already uses |
| Memory | Peak JS heap during a session (same `performance.memory` instrumentation the Lab already uses) |
| Offline behavior | Full session completed with network disabled — a new gate, not currently measured by any existing harness |

This prototype does **not** get built as part of this milestone — this
section is the acceptance criteria for whenever it is.

---

## 12. International expansion plan (sequencing, not scope-creep)

1. English prototype (§11) reaches its gates.
2. **One** additional language is chosen for the first real
   `LanguagePack` — recommend Spanish, for two concrete reasons: (a) it
   is the language most likely to have an accessible native-speaker
   contributor pool for §8's Lab to actually validate against soon, and
   (b) Whisper/Vosk both have mature, well-measured Spanish support,
   reducing acoustic-model risk while the LanguagePack/Contributor-Lab
   machinery itself is being proven for the first time.
3. Only once TWO real language packs exist (English + one more) is
   English's own parser actually refactored to consume the
   `LanguagePack` interface generically — per the explicit
   non-speculative-refactor rule already established for this exact
   situation in `EYEONPIT_1_8_GLOBAL_ARCHITECTURE.md` §6.
4. Remaining languages (French, Mandarin, Cantonese, Korean, Japanese,
   Vietnamese, Filipino/Tagalog, Portuguese, German, Khmer) proceed one
   at a time, each requiring its own real contributor session before
   `status` can move past `"UNVERIFIED_MACHINE_DRAFT"` — no batch
   rollout, no machine-translation shortcut, matching explicit
   instruction.
5. Per `EYEONPIT_1_8_GLOBAL_ARCHITECTURE.md` §3.1's already-decided
   ordering, voice localization happens LAST relative to other i18n
   surfaces (Floor Mode labels, `/lab` UI, Reporting, docs) — this spec
   does not change that sequencing, it only designs what "voice
   localization" will actually consist of when its turn comes.

---

## 13. What to build first — clear recommendation

1. Nothing acoustic-model-related yet. First: formalize `UniversalCommand`
   (§3) as real TypeScript types in `src/lib/voice/`, alongside (not
   replacing) the existing `VoiceCommandKind`/`NarrationOp` types, with a
   pure mapping function from the existing canonical `CanonicalStep`
   shape (`classifyVoiceTranscript.ts`) to `UniversalCommand` — zero
   behavior change, fully covered by existing tests, but gives every
   future language pack and every future acoustic model a real target
   type to emit into.
2. Then: a small Vosk-vs-Whisper prototype comparison, English only,
   against the §11 phrase set, specifically to get a REAL measurement of
   `supportsConstrainedDecoding` in practice (Vosk's real grammar API vs.
   Whisper's text-only output) before the Constrained Decoder stage (§5)
   is designed in more detail than this document already has.
3. Then, and only after both of the above: the first real `LanguagePack`
   entry (English, describing what already exists) as data, not code
   changes to the parser.

## 14. What NOT to build yet

- No rewrite of `parseVoiceCommand.ts`/`parseNarration.ts`/
  `classifyVoiceTranscript.ts` — they remain the real, working, tested
  English implementation until a second real language pack exists.
- No new ASR provider (Vosk or otherwise) wired into the Lab or
  production — research/prototype only, per explicit instruction.
- No contributor portal, no invite system, no upload pipeline — §8 is a
  design, not a build.
- No machine-translated language packs presented as validated — every
  non-English pack stays `"PLANNED"` or, at most,
  `"UNVERIFIED_MACHINE_DRAFT"`, until a real contributor session exists.
- No changes to the counting engine, CardEvent ledger, or any existing
  provider's actual recognition behavior.
- No payments/compensation system — tracking fields only, designed not built.

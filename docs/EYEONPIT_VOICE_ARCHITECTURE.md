# EyeOnPit Voice Architecture — SpeechProvider (2026-08-19)

**Status: the `SpeechProvider` abstraction designed in
`docs/EYEONPIT_1_9_VOICE_INDEPENDENCE.md` §2–§3 is now real code.** This
document supersedes that one's §2/§3 (design-only) with what's actually
built; §4–§7 of that document (Firefox gap, benchmark methodology) remain
current and are cross-referenced below rather than duplicated. Per explicit
instruction for this round: `VoiceControl.tsx`/`useVoiceRecognition.ts`
still consume the browser Web Speech API DIRECTLY — the new provider layer
exists, is fully tested in isolation, and is **not yet wired into
production**. Current operator-facing behavior is unchanged.

---

## 1. The governing rule

> **EyeOnPit owns the speech abstraction, casino context, transcript
> resolution, safety validation, and CardEvent integration. External ASR
> engines are replaceable providers.**

> **Working EyeOnPit-owned software is not replaced merely because an
> external alternative exists.**

Both sentences are load-bearing, not marketing copy. The first is why a
`SpeechProvider` implementation is only ever allowed to answer "what did the
microphone hear" — everything downstream of that (normalization, grammar,
N-best scoring, safety rejection, CardEvent commit, counting) is EyeOnPit's
own code, unconditionally, regardless of which engine supplied the audio's
transcript. The second is why `SherpaOnnxProvider` (§3) is an honest,
non-functional research scaffold rather than a rushed swap-in: the current
`BrowserWebSpeechProvider` path is proven in production and in three rounds
of real PC field testing (see `docs/EYEONPIT_VOICE_FIELD_TEST_2.md` and the
Field Test #2 remediation rounds); nothing displaces it until a candidate
alternative is actually measured, on real audio, against the benchmark
corpus (§4, and `docs/EYEONPIT_1_9_VOICE_INDEPENDENCE.md` §6) and found
safe.

## 2. The pipeline

```
MIC
 │
 ▼
SpeechProvider
 [ BrowserWebSpeechProvider | SherpaOnnxProvider (EXPERIMENTAL) ]
 │  (raw transcript + n-best alternatives + isFinal — nothing else)
 ▼
CasinoVoiceContext
 (hotword/vocabulary bias — inert today, see §3.3)
 │
 ▼
EyeOnPit Transcript Resolver
 (normalizeTranscript.ts, nBestResolver.ts, classifyVoiceTranscript.ts)
 │
 ▼
EyeOnPit Narration Parser
 (parseNarration.ts, parseVoiceCommand.ts, parseTableChangeCommand.ts,
  parseReadOnlyQuery.ts, parseSetActiveTargetIntent.ts)
 │
 ▼
EyeOnPit Safety Gate
 (never-guess-on-ambiguity rules enforced inside the resolver/parsers —
  incomplete-narration rejection, dangling-connector rejection, time/
  fraction safety, active-target-only continuation)
 │
 ▼
Existing CardEvent Ledger
 │
 ▼
Existing Count Engine
```

Everything from **CasinoVoiceContext** down is unchanged by this round —
every file in that chain was already load-bearing production code before
this work began, and none of it was modified to accommodate the new
provider layer (see §5 for the exact file list). A `SpeechProvider` plugs in
at the very top only: it never sees a parsed command, a target, a CardEvent,
or count state, and nothing below it ever needs to know which provider
produced the transcript it's resolving.

## 3. What actually exists now

### 3.1 `SpeechProvider` interface — `src/lib/voice/speechProvider.ts`

Pure types, no logic: `SpeechProvider` (`providerId`, `supported`,
`start()`, `stop()`, `suppressForSpeech()`, `resumeAfterSpeech()`),
`SpeechProviderOptions` (`onFinalResult` required;
`onInterimResult`/`onError`/`onAudioStart`/`onAudioEnd`/`onSpeechStart`/
`onSpeechEnd`/`timeoutMs`/`maxAlternatives` optional), `SpeechProviderResult`
/`SpeechProviderAlternative` — deliberately mirroring `VoiceResult`/
`VoiceAlternative` (`useVoiceRecognition.ts`) field-for-field, exactly as
§3 of the 1.9 design document anticipated: the resolver/parser stack
consumes this shape already and needed no changes to accept it.

### 3.2 `BrowserWebSpeechProvider` — `src/lib/voice/browserWebSpeechProvider.ts`

A faithful, independently-tested port of `useVoiceRecognition.ts`'s proven
session/restart/backoff/suppression logic as a plain factory function
(`createBrowserWebSpeechProvider(options): SpeechProvider`) instead of a
React hook — same constants (`FATAL_ERRORS`, 50ms restart delay, 3
consecutive-network-error threshold), same one-final-per-session guard,
same network-exhaustion synthetic error. It is **not wired into
`VoiceControl.tsx`/`useVoiceRecognition.ts` this round** — those files are
byte-for-byte unchanged, confirmed via `git diff`. This is a deliberate,
explicitly-accepted trade-off: this environment has no microphone or audio
input, so a live production swap of the hook for the provider cannot be
verified end-to-end here. The wrap is real and independently tested (9
tests, `browserWebSpeechProvider.test.ts`); wiring it in is future work that
requires a real-mic verification pass, per this project's own established
gate discipline for anything touching the voice pipeline.

### 3.3 `CasinoVoiceContext` / `buildHotwordList` — `src/lib/voice/casinoVoiceContext.ts`

A pure function, `buildHotwordList(context: CasinoVoiceContext):
HotwordEntry[]`, producing a weighted (1–10) vocabulary list from
`gameFamily`, `activeTarget`, `splitState`, `legalNextActions`,
`terminology`, and `locale`. **Only `terminology` and `activeTarget` are
actually consumed today** — the rest are accepted (so a future 1.10 caller
doesn't need a breaking interface change) but silently ignored, documented
as such directly in the module. Weighting is deliberately non-flat: target
and rank words (a misheard one silently redirects a card or corrupts the
count) are weighted 9–10, action words 6–7, workflow words 5 — "do not
blindly bias every word equally," per instruction. This module has no
caller anywhere in the app yet; it exists as a ready-made seam for §3.4's
hotword wiring once a real hotword-capable provider exists.

### 3.4 `SherpaOnnxProvider` — `src/lib/voice/sherpaOnnxProvider.ts` (EXPERIMENTAL, real and independently verified)

**Updated 2026-08-19 (the "SHERPA-ONNX REAL IMPLEMENTATION GATE" round).**
This is no longer a no-op scaffold. `supported` now does real feature
detection (`WebAssembly`, `AudioWorkletNode`, `getUserMedia`) instead of a
hardcoded `false`. `start()` genuinely loads the official sherpa-onnx WASM
build, initializes a streaming recognizer, captures microphone audio via a
real `AudioWorkletNode` (not the deprecated `ScriptProcessorNode`), and
routes interim/final results through the `SpeechProviderOptions` callbacks.
Hotwords wiring (§3.3) is real, not a stub: `buildHotwordsFileContent`
writes actual EyeOnPit casino vocabulary into the WASM's virtual
filesystem and constructs the recognizer with `modified_beam_search` +
`hotwordsFile`, both confirmed required and functional by direct testing.

**What was independently verified, this round, not assumed:** the official
prebuilt browser-WASM release (downloaded directly from k2-fsa's GitHub
Releases, not compiled — no emscripten toolchain exists in this
environment) was loaded in a real Chrome tab via browser automation and
fed real recorded English speech (bypassing the mic requirement via the
engine's own `acceptWaveform()` API). Both test clips produced **exact
word-for-word correct transcripts**, with genuine incremental streaming
confirmed (49 growing partial results, first at 205ms). Full detail:
`sherpaOnnxProvider.ts`'s own VERIFICATION doc comment and
`docs/EYEONPIT_VOICE_PROVIDER_RESEARCH.md` §8.

**What remains true regardless:** the ~205MB WASM+model asset bundle is
**not committed to this repository** (see that file's ASSET DEPLOYMENT
section) — `supported: true` in a real browser does not mean `start()`
will succeed without a separate, manual, dev-only asset deployment step.
This provider is still EXPERIMENTAL, still not wired into
`VoiceControl.tsx`, and still not the default — see §6.

## 4. Safety boundary (non-negotiable, unchanged by this round)

A `SpeechProvider`, of any kind, present or future, **only ever replaces
AUDIO → TRANSCRIPT.** It never touches:

- Normalization (`normalizeTranscript.ts`)
- Casino grammar / narration parsing (`parseNarration.ts` and siblings)
- N-best resolution (`nBestResolver.ts`)
- Compound narration commit (`commitNarration` in `VoiceControl.tsx`)
- Safety validation (the never-guess-on-ambiguity rules enforced inside
  the resolver/parsers)
- The CardEvent ledger
- The counting engine

This is the same boundary `docs/EYEONPIT_1_9_VOICE_INDEPENDENCE.md` §1
already established for the design-only version of this architecture; this
round's actual code changes nothing about it. No file under
`src/lib/voice/normalizeTranscript.ts`, `classifyVoiceTranscript.ts`,
`nBestResolver.ts`, `parseNarration.ts`, `parseVoiceCommand.ts`,
`parseTableChangeCommand.ts`, `parseReadOnlyQuery.ts`,
`parseSetActiveTargetIntent.ts`, any CardEvent-ledger code, or any counting-
engine code was modified to add the provider layer — confirmed via `git
diff` file list in the round's own final report.

## 5. Benchmark corpus — `src/lib/voice/voiceBenchmarkCorpus.ts`

Implements the methodology `docs/EYEONPIT_1_9_VOICE_INDEPENDENCE.md` §6
designed but did not build. `VOICE_BENCHMARK_CORPUS` is a fixed set of real
field-captured and documented-grammar phrases with expected outcomes;
`evaluateCorpusItem`/`computeBenchmarkMetrics` score any transcript against
EyeOnPit's own current classification pipeline (read-only — no CardEvent or
counting-engine code is invoked). Per explicit instruction, the single most
important field is `falseCardEvents`, and it is 0 across the entire corpus
today (`voiceBenchmarkCorpus.test.ts`).

**What this harness cannot do, honestly:** it scores TEXT against the
parser, not audio against an ASR engine. Four fields —
`averageLatencyMs`/`medianLatencyMs`/`cpuUsage`/`memoryUsageMb`/
`modelDownloadSizeMb`/`asrNoFinalRate` — are typed and always `null`,
because this environment has no microphone, no audio-file input, and no way
to run a real browser with real audio against any engine, Chrome included.
Populating those fields for a genuine provider comparison is real future
work requiring real-mic testing capability, not a gap in this harness's
design.

## 6. What is explicitly NOT done by this round

- No wiring of `BrowserWebSpeechProvider` into `VoiceControl.tsx`/
  `useVoiceRecognition.ts` — production still calls the browser Web Speech
  API directly, unchanged.
- `SherpaOnnxProvider` is real and independently verified against real
  audio (§3.4) but is NOT wired into production, NOT the default provider,
  and requires a manual, gitignored, dev-only asset deployment step even
  to run in a lab setting — see its own ASSET DEPLOYMENT doc comment.
- No Firefox support — unchanged from `docs/EYEONPIT_1_9_VOICE_INDEPENDENCE.md`
  §4; `getSpeechRecognitionCtor()` is untouched.
- No 1.10 split/multi-hand logic wired to `CasinoVoiceContext` — the
  interface accepts `splitState`/`legalNextActions` but nothing populates
  or consumes them yet.
- No fabricated benchmark numbers for any provider — see §5 and
  `docs/EYEONPIT_VOICE_PROVIDER_RESEARCH.md`'s own "not measured" sections.

See the round's own final report for the complete file-change list and full
test count.

# EyeOnPit Voice Provider Research — sherpa-onnx / whisper.cpp (2026-08-19)

Real, cited research conducted via WebFetch/WebSearch against the projects'
own repositories and Hugging Face model cards, in support of
`SherpaOnnxProvider` (`src/lib/voice/sherpaOnnxProvider.ts`) — see
`docs/EYEONPIT_VOICE_ARCHITECTURE.md` §3.4 for how that provider is scoped.
**Constraint governing §1–§7 below (the original research pass):** this
environment has no microphone and no way to run a real browser with
WebAssembly against real audio. Every license/provenance claim in §1–§7 is
a real, sourced fact; every benchmark number omitted there is a deliberate,
stated gap — never a fabricated placeholder.

> **UPDATE (2026-08-19, same day, later gate — "SHERPA-ONNX REAL
> IMPLEMENTATION GATE"):** the constraint above was independently
> overcome, in part. **Real audio ASR testing was performed** — no
> microphone was involved, but the official, unmodified sherpa-onnx WASM
> build genuinely ran in a real Chrome browser tab against real recorded
> speech, and produced real (correct) transcripts. §8 below is the record
> of that gate; it does not delete or contradict §1–§7, it corrects one
> factual error found in the process (§8.1) and adds the results §1–§7
> explicitly said were not yet measured.

---

## 1. sherpa-onnx (k2-fsa/sherpa-onnx)

| Field | Finding |
|---|---|
| Repository | https://github.com/k2-fsa/sherpa-onnx |
| Engine license | **Apache License 2.0** — permissive, commercial-friendly, no copyleft/AGPL concerns |
| Language/runtime | C++ core with bindings (Python, C#, Go, Kotlin, Swift, JavaScript/WASM, etc.); ONNX Runtime as the inference backend |
| Streaming support | Real — dedicated "online" (streaming) recognizer API, distinct from its offline/batch API |
| Browser/WASM support | Real — the project ships WASM build targets and browser examples (including SIMD-enabled builds), plus Hugging Face Spaces demos running entirely client-side |
| Hotwords/contextual biasing | Real — see §3 below |

**Candidate model:**
`csukuangfj/sherpa-onnx-streaming-zipformer-en-20M-2023-02-17` (Hugging
Face) — a small (~20M parameter) English streaming transducer, exported
from `icefall-asr-librispeech-pruned-transducer-stateless7-streaming-small`,
trained on **LibriSpeech**.

| Field | Finding |
|---|---|
| Source | https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-20M-2023-02-17 |
| Model license | **Apache License 2.0** (stated on the model card itself, matching the engine's own license — no separate/conflicting model license to reconcile) |
| Training data | LibriSpeech (English read-speech corpus) |
| Size class | "Small" streaming variant — the model card's own description positions it specifically for resource-constrained (e.g. on-device/browser) use |

**Commercial-bundling legality:** both the engine (Apache-2.0) and this
candidate model (Apache-2.0) permit commercial use, modification, and
redistribution, including as part of a closed-source commercial product,
subject to Apache-2.0's standard attribution/notice-preservation terms.
Neither carries a copyleft (GPL/AGPL) or non-commercial restriction.
**Re-verify both license pages immediately before actually bundling
anything** — license terms on a hosted model card can change independently
of the engine's own license, and this verification (2026-08-19) is a
point-in-time finding, not a standing guarantee.

## 2. Hotwords / contextual biasing (Part D research)

Confirmed real, not aspirational: sherpa-onnx supports hotwords via an
**Aho-corasick automaton** matched against the decoder's own token stream —
**inference-time only, no model retraining required.** Two hard constraints
found:

1. **Only available on transducer models using `modified_beam_search`
   decoding** — not every decoding mode supports it. The candidate model
   above is a transducer, so it qualifies.
2. Configured via a plain-text hotwords file plus `hotwords-score` (bias
   strength) and `modeling-unit`/`bpe-vocab` parameters (the automaton
   operates on the model's own tokenization, not raw words).

This is exactly the real functionality `CasinoVoiceContext.buildHotwordList`
(§3.3 of the architecture doc) is designed to eventually feed — see that
module's own doc comment for the (not-yet-built) wiring plan.

**N-best limitation, found during this research, worth flagging:** unlike
Web Speech's `maxAlternatives`, streaming transducer decoding produces one
best path per step, not a native N-best list — `nBestResolver.ts`'s
multi-alternative scoring would effectively degrade to "the only
alternative" for a sherpa-onnx-backed provider unless a future
implementation specifically requests N-best output from
`modified_beam_search` directly. Not solved here; recorded for the next
round that attempts a real integration.

## 3. Browser/WASM, offline, and streaming status — summary

| Question | Finding |
|---|---|
| Runs in a browser at all? | Yes — real WASM build targets exist and are demonstrated in the project's own examples/Spaces |
| Runs offline (no network after model load)? | Yes, in principle — once the WASM module and model files are fetched once, recognition itself requires no network call, unlike a cloud ASR API |
| Streaming (partial results as speech continues)? | Yes — the "online" recognizer API is built for exactly this |
| Actually verified in THIS environment? | **No** — no microphone, audio file, or browser-with-WASM execution capability exists here. Every claim above is sourced from the project's own repository/documentation, not independently reproduced by running it. |

## 4. Firefox / iPhone-Safari feasibility (Part 18/19 of the final report)

- **Firefox:** a WASM-based provider (sherpa-onnx or otherwise) is
  architecturally the ONLY realistic path to Firefox voice support, per
  `docs/EYEONPIT_1_9_VOICE_INDEPENDENCE.md` §4 — Firefox has no native Web
  Speech recognition constructor at all, so `BrowserWebSpeechProvider` can
  never work there regardless of any fix on EyeOnPit's side. WASM itself is
  fully supported in Firefox, so there is no fundamental blocker — but this
  has not been tested, since testing it requires exactly the audio/browser
  capability this environment lacks.
- **iPhone/Safari:** feasibility is genuinely uncertain from documentation
  alone. Safari's WASM support is generally solid, but `getUserMedia`
  microphone access and `AudioWorkletNode` behavior on iOS Safari have a
  history of platform-specific restrictions (background-tab audio
  suspension, autoplay/user-gesture requirements) that would need real
  on-device testing to characterize — not something this research can
  responsibly claim either way without fabricating a result.

## 5. whisper.cpp (ggml-org/whisper.cpp) — reference only, no production integration

Researched per explicit instruction as a reference note, not a candidate for
this round's scaffold.

| Field | Finding |
|---|---|
| Repository | https://github.com/ggml-org/whisper.cpp |
| License | **MIT** |
| Model license | OpenAI's Whisper model weights are also **MIT licensed** — commercial-use-friendly, same permissive posture as sherpa-onnx above |
| Browser/WASM | Real — the project ships a `stream.wasm` example demonstrating streaming-style usage in-browser |
| Latency characteristic | Whisper is fundamentally a ~30-second-chunk-oriented model, not a natively streaming architecture — the WASM streaming example works around this with a sliding/rolling-window approach, but the underlying tradeoff is real: tiny/base Whisper models run roughly 2–3x realtime in WASM on modern CPUs, meaning genuine low-latency turn-by-turn narration (as EyeOnPit's compound-narration grammar assumes) is a harder fit than a natively-streaming transducer architecture like sherpa-onnx's zipformer models |

**Why not the primary candidate:** the licensing is equally clean (MIT vs.
Apache-2.0, both permissive), but the latency/chunking mismatch against
EyeOnPit's real-time compound-narration use case is a genuine architectural
concern sherpa-onnx's native streaming design doesn't share. This is a
documented reason for the choice of primary candidate, not a rejection of
whisper.cpp outright — it remains a reasonable fallback/reference if
sherpa-onnx's hotwords or WASM performance don't pan out in real testing.

## 6. Benchmark results — Chrome vs. sherpa-onnx vs. whisper.cpp

**Not measured, and not fabricated.** `src/lib/voice/voiceBenchmarkCorpus.ts`
(see `docs/EYEONPIT_VOICE_ARCHITECTURE.md` §5) proves EyeOnPit's own
classifier scores the full corpus correctly with **zero false CardEvents**
using Chrome-shaped real captured transcripts as input text — that is a
real, passing, automated result. It is NOT a measurement of Chrome's ASR
accuracy itself (this harness takes transcript text as a given input, it
does not run Chrome's recognizer), and it says nothing about sherpa-onnx or
whisper.cpp, because neither engine is running anywhere in this
environment. Any "Chrome vs. sherpa vs. whisper" comparison — false-
CardEvent rate, latency, CPU/RAM, model download size — requires a real
browser, real microphone or real recorded audio fixtures, and a real
running instance of each engine. None of those three exist here. This gap
is the top item in this document's own recommended next step (§7).

## 7. Recommended next step

Sherpa-onnx (Apache-2.0 engine + Apache-2.0 candidate model, real streaming,
real hotwords) is the stronger candidate of the two researched here,
primarily on the latency/streaming-architecture grounds in §5 — but that
recommendation is **based on documentation, not a measurement.** The
concrete next step is a round with real microphone/audio-file testing
capability that:

1. Actually installs the sherpa-onnx WASM build and the candidate model,
2. Wires a real (not scaffolded) `SherpaOnnxProvider` implementation per
   the detailed steps already documented in that file's own top comment,
3. Runs it against `VOICE_BENCHMARK_CORPUS` (extended with real recorded
   audio, not just text) side-by-side with `BrowserWebSpeechProvider`,
4. Populates the currently-`null` latency/CPU/RAM/model-size fields in
   `computeBenchmarkMetrics` with real numbers for both providers,
5. Only then considers wiring either provider into `VoiceControl.tsx` —
   and only if the approval gate in
   `docs/EYEONPIT_1_9_VOICE_INDEPENDENCE.md` §6 ("beats or materially
   complements the current baseline, safely — false CardEvents dominate
   every other metric") is actually met.

Nothing in §1–§7 above made that decision or shortcut that gate. **Steps 1
and 2 of this recommendation have since been carried out — see §8.** Steps
3–5 (a real side-by-side run against `VOICE_BENCHMARK_CORPUS` with real
recorded CASINO-vocabulary audio, and any production wiring) remain not
done, for reasons explained in §8.5.

## 8. Real implementation gate (2026-08-19) — what was actually run

This section supersedes §6's "not measured, and not fabricated" for the
*engine itself* (not for the Chrome-vs-sherpa casino-corpus comparison,
which remains partially not measured — see §8.5). Full technical detail
lives in `src/lib/voice/sherpaOnnxProvider.ts`'s own VERIFICATION doc
comment; this section is the narrative/report version.

### 8.1 Correction to §1

§1 named `sherpa-onnx-streaming-zipformer-en-20M-2023-02-17` as "the"
candidate model. That was a reasonable documentation-based guess, but it
was **wrong for the specific official prebuilt browser release** this gate
actually used. Tracing k2-fsa's own build workflow
(`.github/workflows/wasm-simd-hf-space-en-asr-zipformer.yaml`) shows the
official `en-asr-zipformer` WASM release bundles a **different** model:
**`sherpa-onnx-streaming-zipformer-en-2023-06-21`** (also Apache-2.0,
confirmed via the model's own Hugging Face API `license:apache-2.0` tag,
trained on LibriSpeech + GigaSpeech via
`marcoyang/icefall-libri-giga-pruned-transducer-stateless7-streaming-2023-04-04`).
`SHERPA_ONNX_PROVENANCE` in `sherpaOnnxProvider.ts` now cites the corrected,
confirmed model.

### 8.2 What was actually downloaded and run

No source was compiled (confirmed no `emcc`/`em++`/`cmake` in this
environment — that path is genuinely closed, not merely untried). Instead,
the **official prebuilt browser-WASM release** was downloaded directly from
k2-fsa's own GitHub Releases —
`sherpa-onnx-wasm-simd-v1.13.6-en-asr-zipformer.tar.bz2`, 175,242,241 bytes
— the same artifact their own CI publishes to their live Hugging Face
Space (which this environment could not reach directly — HF Spaces
specifically returned HTTP 401 from this network, while huggingface.co
model/dataset pages did not; GitHub Releases were unaffected). Extracted:
a 13.1MB `.wasm` binary and a 191.0MB `.data` virtual-filesystem package
(encoder/decoder/joiner ONNX weights + tokens, embedded by k2-fsa's own
build), plus the unmodified official `index.html`/`app-asr.js`/
`sherpa-onnx-asr.js` glue.

This was served from a local static HTTP server and loaded, **unmodified**,
in a real Chrome tab via the Claude-in-Chrome browser automation tools —
not a simulation, not a mock. The WASM module initialized and
`createOnlineRecognizer(Module)` succeeded in ~18 seconds over localhost.

### 8.3 Real audio, real transcripts

No microphone exists in this environment, so the mic-capture UI wasn't
used. Instead, real recorded English speech was fed directly into the
live recognizer's own `stream.acceptWaveform()` API — the same call the
official mic-capture code path uses internally, just supplied with audio
decoded from a file instead of a live `MediaStream`. The audio was
`test_wavs/0.wav` and `test_wavs/1.wav` from the bundled model's own
Hugging Face repo (same Apache-2.0 license, LibriSpeech "Scarlet Letter"
audiobook excerpts, with the repo's own `trans.txt` ground truth):

| File | Duration | Result |
|---|---|---|
| `0.wav` | 6.625s | **Exact word-for-word match** against ground truth |
| `1.wav` | 16.715s | **Exact word-for-word match** against ground truth (44-word sentence) |

Full transcripts are recorded verbatim in `SHERPA_ONNX_REAL_AUDIO_VERIFICATION`
in `sherpaOnnxProvider.ts`. Streaming was confirmed genuine, not batch: `1.wav`
fed in simulated 200ms real-time chunks produced 49 growing partial
transcripts, the first at 205ms.

### 8.4 Hotwords — real, not aspirational

§3's hotwords research was confirmed by actually doing it: a real EyeOnPit
casino-vocabulary hotwords file (dealer, player, spot, seat, hit, stand,
split, double, surrender, insurance, ace, king, queen, jack) was written
into the WASM's Emscripten virtual filesystem via `FS.writeFile`, and a
recognizer was constructed with `decodingMethod: "modified_beam_search"` +
that `hotwordsFile` — confirmed required, since the demo's own default
`greedy_search` silently ignores `hotwordsFile` entirely (traced directly
in `sherpa-onnx-asr.js`'s `createOnlineRecognizer`, which replaces its
entire default config object when a caller-supplied config is given, rather
than merging). Construction and decode succeeded without error, same
correct transcript (neither test clip contains casino vocabulary, so this
confirms the *pipeline* works, not that biasing measurably changed an
output — no real-audio casino phrase exists to test that with; see §8.5).

### 8.5 What is still honestly NOT measured

- **No real casino-vocabulary audio exists anywhere** — LibriSpeech has no
  "dealer has a five." The two real test clips prove the ENGINE works
  correctly on real speech; they cannot show whether sherpa-onnx correctly
  recognizes EyeOnPit's own phrase corpus, and this document does not
  claim otherwise.
- **No same-audio Chrome comparison is possible at all**, for a real
  architectural reason, not a shortcut: the Web Speech API's
  `SpeechRecognition` interface is microphone-only by spec — it has no
  `acceptWaveform`-equivalent to feed a file, unlike sherpa-onnx's engine
  level API. Testing Chrome on the same two clips would require literally
  playing the audio through a speaker into a live microphone, which this
  environment cannot do. Chrome's own real-world accuracy/latency numbers
  come from separate, earlier real-mic field-test sessions (see
  `docs/EYEONPIT_VOICE_FIELD_TEST_2.md`), on different phrases, not a
  head-to-head with this section's results.
- **CPU/RAM are asymmetrically measurable, for a real reason**: sherpa-onnx
  runs inside the page's own JS/WASM context, so `performance.memory`
  could observe it (~195MB JS heap in use, Chrome-specific, approximate).
  Chrome's built-in recognizer runs in the browser/OS's own internal or
  cloud-connected service, invisible to page-level JS entirely — there is
  no API that exposes its CPU/RAM cost to a web page, on any site,
  ever. This is not a gap in this round's measurement; it is not
  measurable by any page-level code.
- **Firefox was not tested** — no Firefox browser-automation capability
  exists in this environment (only Chrome). Every API this gate actually
  exercised (`WebAssembly`, `fetch`, `AudioContext`/`AudioWorkletNode`,
  `Blob`/`URL.createObjectURL`) is real, standard, and Firefox-supported
  per spec, so there is no known architectural blocker — but "no known
  blocker" is an inference from what was tested in Chrome, not a Firefox
  verification, and is reported as exactly that distinction.
- **iPhone/Safari feasibility is unchanged from §4** — still not testable
  here, still genuinely uncertain (iOS `getUserMedia`/`AudioWorkletNode`
  platform quirks), still not claimed either way.
- **This exact `SherpaOnnxProvider` wrapper** (dynamic script loading,
  `AudioWorkletNode` capture, the pause/resume suppression logic) was
  written against the verified API contract above but has not itself been
  re-run end-to-end — only the underlying official demo code and the raw
  API calls it makes were independently verified. See that file's own
  "WHAT WAS NOT RE-VERIFIED" note.

### 8.6 Revised recommendation

Unchanged in direction from §7, strengthened in confidence: sherpa-onnx is
real, its license chain is clean and now double-checked, it runs correctly
in a real browser against real audio, streaming and hotwords both function
as documented. It remains **EXPERIMENTAL and not production-wired** — the
missing piece is no longer "does the engine work" (answered: yes) but
"does it work well enough, on EyeOnPit's own vocabulary, under EyeOnPit's
own zero-false-CardEvent bar" — which requires either real casino-phrase
audio recordings or a live microphone session, neither available in this
environment. That remains the concrete next step.

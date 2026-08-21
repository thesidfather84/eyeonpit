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

## 9. Dealer hotword investigation (2026-08-20) — root cause found, lab-only fix built

A real mic session (run by the user, not this environment) against the
real Dealer/Player/noise phrase script found Dealer recognition genuinely
unstable even with hotwords "on": "Dealer has a five" consistently
misheard as "Taylor," "Dealer showing ten" as "Tillers... a tin," while
bare "Dealer" and "Dealer has a king" came through correctly. Investigated
why, per explicit instruction to confirm rather than assume before
changing any configuration.

### 9.1 Confirmed root causes — two independent, compounding bugs

1. **`modelingUnit` was left at its default, `"cjkchar"`.** Read directly
   from sherpa-onnx's own `online-model-config.cc`: `bpe_vocab` is only
   required (and only validated to exist) when `modeling_unit` is `"bpe"`
   or `"cjkchar+bpe"` — so the shipped `"cjkchar"` default silently passed
   config validation with an empty `bpeVocab`, then encoded hotword text
   using a CJK-character tokenizer against an English BPE model's
   vocabulary. Confirmed with a real sentencepiece test against this
   model's own training tokenizer: `"DEALER"` → `["▁DE","AL","ER"]` (three
   real, valid vocabulary pieces) but `"dealer"` → `["▁","dealer"]` (an
   unmatched fallback — nothing to bias).
2. **Hotword phrase text was lowercase.** `casinoVoiceContext.ts`'s base
   vocabulary is lowercase; this model's 500-piece BPE vocabulary was
   trained on UPPERCASE text only (every piece in the real `bpe.model` is
   uppercase). Confirmed by the same sentencepiece test above — the
   working `"DEALER"` example above IS the uppercase form.

Both had to be fixed together: fixing only `modelingUnit` without a real
`bpe.vocab` file causes sherpa-onnx's own config validation to hard-fail
recognizer construction; fixing only casing without `modelingUnit`/
`bpeVocab` has no effect, since `cjkchar` tokenization was never going to
produce correct BPE pieces regardless of case.

### 9.2 The missing `bpe.vocab` — found, generated, and verified, not assumed

The bundled model repo (`csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-21`)
ships only `tokens.txt` — no `bpe.vocab`. Traced the model back to its real
training source, `marcoyang/icefall-libri-giga-pruned-transducer-stateless7-streaming-2023-04-04`,
which DOES ship the real sentencepiece `bpe.model` at
`data/lang_bpe_500/bpe.model`. Verified it's the correct, matching
tokenizer (not a guess) by confirming `tokens.txt` is byte-identical
between the training repo and the bundled model repo. Installed the
`sentencepiece` Python package, downloaded the real `bpe.model`, and
generated a real `bpe.vocab` (piece + log-probability per line, matching
sherpa-onnx's documented format) from it. Deployed to
`public/sherpa-onnx-lab/bpe.vocab` — gitignored, lab-only, same treatment
as the WASM/model bundle, never committed.

### 9.3 Fix verified real, in a real browser — construction and non-regression only

Loaded the real WASM+model bundle in a real Chrome tab (browser
automation), constructed a recognizer with `modelingUnit: "bpe"` + the
generated `bpe.vocab` + UPPERCASE hotword text, and confirmed:
construction succeeds (no config-validation error), and decoding a real
audio clip still produces the exact same word-for-word correct transcript
as before (the fix doesn't degrade ordinary recognition). **What this does
NOT show:** whether it actually improves real Dealer recognition accuracy
against real speech — no microphone exists in this environment. That
measurement is exactly what §9.4's tooling exists for.

### 9.4 Lab-only A/B/C tooling built, not yet run

`/lab/sherpa-voice-test` now offers three selectable Sherpa configurations
against the same phrase script and mic conditions:

- **A** — hotwords off entirely.
- **B** — hotwords on, exact configuration every prior round shipped
  (`modelingUnit` default, lowercase phrases) — the confirmed-wrong
  baseline, kept deliberately so the comparison measures the real
  regression rather than a strawman.
- **C** — the corrected configuration from §9.1–§9.3.

Each recorded utterance shows the raw transcript AND EyeOnPit's real,
unmodified, read-only `classifyVoiceTranscript` result (accepted/rejected,
whether a CardEvent would be produced) — informational only, never
dispatched or written anywhere; this page still creates zero CardEvents.
An operator-marked correct/incorrect judgment and per-configuration
aggregate accuracy round out the comparison. The phrase script includes
the exact Dealer stress phrases requested ("Dealer," "Dealer has a five,"
"Dealer has a king," "Dealer showing ten," "Dealer has an ace," "Dealer
has a king and a five"), representative Player/Spot phrases (so a
Dealer-focused change can't hide a regression elsewhere), and the existing
noise-phrase set (checks whether hotword biasing hallucinates casino
vocabulary into unrelated speech).

**Still requires real-microphone validation** — this round built and
verified the tooling and the underlying configuration fix; it did not, and
could not, run the actual A/B/C comparison against real speech. That is
the explicit next step, to be run by the user.

## 10. "assets-not-found" production incident — root cause, fix, and Vercel Blob deployment (2026-08-20)

**The incident:** the user ran a real production mic session against
`/lab/sherpa-voice-test` and got `error: "assets-not-found"` on all 30
attempts, with zero recognition output at all (finalText/interims/
confidence/timing all null) — a deployment/asset-availability defect, not
a speech-recognition accuracy failure.

**Root cause (confirmed, not guessed):** `public/sherpa-onnx-lab/` — the
~204MB WASM/model/vocab bundle §8-§9 above verified running — is git­ignored
(`.gitignore`) and was never committed. Vercel deploys only what's tracked
in git, so none of these files ever reached the production deployment.
`start()`'s own error-classification correctly reported the resulting 404
as `assets-not-found` — this was designed, honest, fail-closed behavior;
the actual gap was that nothing had ever provisioned real assets for a
real deployment, and the Lab route has no environment check preventing it
from being reachable (behind the `/lab` passcode) regardless.

**Fix — Vercel Blob, version-pinned, public-read:**

- All 5 files the provider actually requires (`sherpa-onnx-asr.js`,
  `sherpa-onnx-wasm-main-asr.js/.wasm/.data`, `bpe.vocab` — NOT
  `app-asr.js`/`index.html`, which the provider's own runtime code never
  references) were uploaded, byte-identical to the exact locally-verified
  files (sha256-checked — see `src/lib/voice/sherpaAssetManifest.ts`), to
  a new public-read Vercel Blob store (`eyeonpit-lab-sherpa-assets`,
  connected to the `eyeonpit` project's Production and Preview
  environments; the write-capable `BLOB_READ_WRITE_TOKEN` is a normal
  server-side env var, never exposed to the browser).
- **Model/version path** (immutable — `allowOverwrite: false`, uploaded
  with `addRandomSuffix: false` for predictable filenames):
  ```
  https://9uezlmmeazeykpud.public.blob.vercel-storage.com/sherpa/en-zipformer-2023-06-21-v1.13.6/
  ```
  The segment `en-zipformer-2023-06-21-v1.13.6` encodes both the bundled
  model identity (`sherpa-onnx-streaming-zipformer-en-2023-06-21`) and the
  engine/WASM release it was built from (`1.13.6`), so a future genuinely
  different model build lives at a different path rather than silently
  overwriting this one.
- **Total footprint:** 204,249,120 bytes (≈194.8 MiB) — `sherpa-onnx-asr.js`
  53,867 B, `sherpa-onnx-wasm-main-asr.js` 82,688 B,
  `sherpa-onnx-wasm-main-asr.wasm` 13,148,431 B,
  `sherpa-onnx-wasm-main-asr.data` 190,951,044 B, `bpe.vocab` 13,090 B —
  every URL verified (HTTP 200, exact expected `Content-Length`) before
  any production config change.
- **Why not committed to git directly:** Vercel's own documented CLI/source
  upload limit is 100MB (Hobby) / 1GB (Pro); the single 190MB `.data` file
  alone already exceeds the Hobby cap, and Vercel's own guidance is to
  serve large static files from an external store, not source-controlled
  build input.
- **Production configuration:** `NEXT_PUBLIC_SHERPA_ASSET_BASE_URL` is now
  set (Production environment) to the Blob base URL above — inlined into
  the client bundle at build time. Development is deliberately left unset,
  so ordinary local dev keeps using the gitignored `/sherpa-onnx-lab/`
  path unchanged.
- **A real Next.js build-time-inlining bug found and fixed in the same
  round:** the first implementation read
  `env.NEXT_PUBLIC_SHERPA_ASSET_BASE_URL` from a `process.env` object
  passed as a function parameter — Next.js's static replacement of
  `NEXT_PUBLIC_*` vars only recognizes the literal expression
  `process.env.NEXT_PUBLIC_X` textually in the source, so the client
  bundle silently never received the real value and kept resolving to the
  local dev path even in a "production-configured" local test. Caught by
  the local Blob-hosted-construction verification itself (network requests
  kept hitting `/sherpa-onnx-lab/*` instead of the Blob URL) — fixed by
  making the literal `process.env.NEXT_PUBLIC_SHERPA_ASSET_BASE_URL`
  expression appear directly at each of the two call sites
  (`sherpaOnnxProvider.ts`, `page.tsx`), while keeping the underlying
  resolution function itself parameterized/testable.
- **Improved error diagnostics:** a failed asset load now reports
  `assets-not-found: <exact failing URL/detail>` (was a bare generic
  string) — both in the provider's `onError` callback and, unchanged, the
  Lab page's existing error display, so an operator immediately sees which
  specific asset request failed.
- **Asset-manifest/integrity mechanism:** `sherpaAssetManifest.ts` records
  filename/size/sha256/version for all 5 files; wired into a real runtime
  check on `bpe.vocab` (the one asset fetched via plain `fetch()` — checked
  against the response's `Content-Length` header, not decoded text length,
  to avoid a UTF-8-vs-UTF-16 false positive) that throws a specific
  "possible model/version mismatch" error on a size mismatch. The
  `.wasm`/`.data`/glue-script files are loaded via Emscripten's own
  internal `<script src>`-triggered fetch, which this provider has no hook
  into to check before the browser commits to using it — documented
  honestly as a known, deliberate limitation of "smallest safe
  implementation" scope, not silently overclaimed as fully covered.

**Verified locally, twice, both ways:**

1. Local dev, default config (no `NEXT_PUBLIC_SHERPA_ASSET_BASE_URL` set):
   recognizer reached `status: "listening"` against the local
   `/sherpa-onnx-lab/*` files, ~2.3–2.5s load time, ~205-215MB JS heap,
   zero errors — confirms local dev is completely unaffected.
2. Local dev with `NEXT_PUBLIC_SHERPA_ASSET_BASE_URL` pointed at the real
   Blob URL: network requests confirmed hitting
   `https://9uezlmmeazeykpud.public.blob.vercel-storage.com/...` exclusively
   (zero requests to `/sherpa-onnx-lab/*`), recognizer reached
   `status: "listening"`, ~6.5s load time (real CDN latency vs. localhost),
   ~204.6MB JS heap, zero errors — confirms the Blob-hosted path works
   end-to-end, construction-only.

**Explicitly NOT claimed:** recognition accuracy. Construction and asset
loading were verified; whether Sherpa actually transcribes real speech
correctly through the Blob-hosted assets in production has not been
measured and requires the user's own real-microphone session against the
deployed page — this provider remains experimental, Lab-only, and not
production-ready.

## 11. Real production A/B/C mic session (2026-08-20) — results, two real
defects found and fixed, Sherpa still NOT production-approved

The user ran the actual A/B/C comparison §10 (and §9.4 before it) built but
could not itself execute — a real microphone, against the real
Blob-deployed assets, through all three configurations. This section
records that session's real findings and this round's remediation. **Sherpa
remains an EXPERIMENTAL, Lab-only provider. Production EyeOnPit
(`VoiceControl.tsx`/`useVoiceRecognition.ts`) still uses Browser Web Speech
exclusively and was not touched.**

### 11.1 Headline result — C preferred, on phrase quality, not just rate

| Config | Completed records | Accepted rate | Would-produce-CardEvent rate |
|---|---|---|---|
| A — hotwords OFF | 26 | 23.1% | 15.4% |
| B — shipped (cjkchar, lowercase) | 27 | 44.4% | 25.9% |
| C — tuned (bpe + uppercase) | 25 | 44.0% | 28.0% |

**A is clearly inferior** to both B and C. **B and C are close in aggregate
rate** (44.4% vs. 44.0% accepted) — but **C is preferred anyway**, because
the real basis for that decision is phrase-LEVEL blackjack recognition
quality, not the aggregate percentage: C correctly recovered specific real
Dealer/Player phrases that A and B both missed. An aggregate-rate-only
reading would have called B and C a wash; it isn't, once the actual missed
phrases are the criterion the task explicitly asked to prioritize.

**Important caveat, stated plainly and never hidden in the numbers above:**
the three configurations do **not** have equal completed-record counts (26 /
27 / 25) — see §11.4. These percentages are **descriptive of what was
actually captured in each run, not a controlled, equal-N accuracy
comparison** between A, B, and C. No number here has been reweighted,
padded, or otherwise adjusted to make the three runs look comparable.

### 11.2 SAFETY DEFECT — false `SEAT5:3` from config B, root-caused and fixed

**What happened:** the operator said "Has a five and a three" (an ordinary
target-omitted continuation utterance — no seat named at all). Sherpa (config
B) recognized it as **"FIVE IN THE THREE"**. EyeOnPit's own classification
pipeline then produced `SEAT5:3` — an ACCEPTED result that would have
written a real CardEvent to Seat 5, even though the spoken phrase never
named any seat.

**Root cause — confirmed by reading the actual code, not guessed:**
`parseNarration.ts`'s "leading-seat shorthand" rule (added for legitimate
phrases like "three has a ten") treats a bare number at the start of a
clause, immediately followed by ANY of `HAND_CONNECTOR_WORDS` (`has`, `as`,
`and`, `with`, `gets`, `got`, `shows`, `in`), as unambiguous evidence the
number is a NEW seat target. Two of those connector words — `in` and `as` —
are themselves already documented, elsewhere in the same file, as
ASR-MISRECOGNITION-RECOVERY ALIASES ONLY (`in` for a misheard `and`, `as`
for a misheard `has`) — no operator ever deliberately opens a fresh
seat-claim by saying "five in..." Sherpa's real transcript dropped the true
leading "has a" and misheard "and" as "in," leaving exactly the bare-number
+ "in" shape the shorthand rule (wrongly) treats as a deterministic Seat 5
claim.

**This is a defect in generic production parser logic
(`src/lib/voice/parseNarration.ts`), not something Sherpa-specific, and not
something introduced to accommodate Sherpa.** The exact same false positive
is reachable from ANY provider (including Browser Web Speech) that ever
produces this token shape — Sherpa's real session is simply what surfaced
it first. Browser Web Speech's own behavior was not weakened to fix this;
the fix makes the shared parser strictly safer for both providers.

**The fix:** the leading-shorthand trigger now requires the immediate
connector to be exactly `"has"` — the ONLY connector any existing test or
real transcript ever actually exercises in that position (every existing
passing test — "three has a ten," "2 has 5 7," "one has a king and an
ace" — already uses "has"). `in`/`as`/`and`/`with`/`gets`/`got`/`shows`
remain fully recognized as CONTINUATION connectors once a target is already
established, or via the existing `allowUnscopedContinuation` mechanism —
only the "invent a brand-new seat target from a bare number" trigger was
narrowed. Legitimate forms are unaffected and regression-tested: "three has
a ten" (Seat 3), "Player five has a three" (Seat 5 — an explicit
seat-prefixed phrase, never routed through the shorthand rule at all).
"five in the three" now resolves as two ordinary unscoped cards (5, 3),
correctly deferring to whatever target is genuinely active — the same
outcome the operator's actual words always meant — or rejects outright when
no such target evidence exists, never guessing a seat. See
`src/lib/voice/parseNarration.ts` and its own test file for the full fix
and regression coverage.

### 11.3 Finalization truncation — investigated, real delivery-race defect found and fixed

The session repeatedly showed cases where an INTERIM already contained the
complete, correct phrase, but the declared FINAL transcript was missing the
last word — "Dealer has a king" → "Dealer has a"; "Player three hits, gets a
four" / "Player three hits a four" → missing "four."

**Investigated per instruction, before touching any grammar/hotwords.**
Two candidate mechanisms were considered (both real properties of this
pipeline — full detail in `sherpaOnnxProvider.ts`'s own doc comment):

1. **A genuine, confirmed, deterministic delivery race in `stop()` — this is
   what was fixed.** Audio is captured on the AudioWorkletProcessor's
   real-time rendering thread and delivered to the main thread
   asynchronously via `port.onmessage`. The prior `stop()` called
   `stream.inputFinished()` and read the result SYNCHRONOUSLY, in the same
   tick as the "End Phrase" click. Any audio chunk already captured but not
   yet delivered to `handleAudioChunk` at that exact instant was never fed
   into the stream before finalization, and was then silently dropped
   entirely once `stop()`'s cleanup nulled `recognizer`/`stream`. An
   operator who finishes speaking and clicks "End Phrase" promptly — the
   natural field-test cadence — reliably lands in this window, and it is
   always the TRAILING word that's lost, matching every real example above.
2. **A real, but not-yet-observed-as-the-cause, property of
   `modified_beam_search`** (the decoding method hotwords require, used by
   both B and C): its top-ranked hypothesis can, in principle, change as
   more audio is decoded, including during `inputFinished()`'s own trailing
   flush. This is a documented characteristic of beam-search transducer
   decoding, not an EyeOnPit bug — it was NOT what this round fixed, since
   the delivery race above is independently sufficient, is a genuine
   deterministic code defect, and is the only one of the two with an actual
   deterministic fix available.

**The fix — a finalization DRAIN, not a promotion of interim text:** `stop()`
now awaits one real event-loop tick before calling `inputFinished()`, giving
any already-captured-but-undelivered audio a chance to reach the stream
first. This is purely additive ordering — it can only let MORE real,
already-spoken audio be incorporated before the final is declared. It never
inspects, compares against, or falls back to interim text; the actual
`getResult()` read still happens exactly once, after the real decode, same
as before. Extracted as a pure, independently unit-tested function,
`finalizeSherpaStream` (`sherpaOnnxProvider.ts`), specifically so this
ordering guarantee has real regression coverage without needing a real
microphone. **If truncation is reproduced again in a future real-mic session
after this fix ships, that is real evidence mechanism 2 (beam-search
re-ranking) is also contributing — the next thing to investigate then, not
assumed or patched preemptively now.**

### 11.4 Lab UX fix — config switch left the phrase run stuck; unequal totals explained

**Reported bug:** changing the A/B/C selector left the operator at wherever
the PREVIOUS configuration's phrase run had reached, forcing a page reload
to get back to Phrase 1.

**Root cause, confirmed by reading the Lab page's own state management:**
`abConfig`/`providerChoice` changes never reset `phraseIndex` — only the
existing manual "Restart list from phrase 1" link did. Forgetting that one
click meant the newly-selected configuration's captured records silently
started mid-corpus (or, if the prior run had reached the last phrase, could
capture almost nothing at all) instead of a fresh Phrase-1 pass.

**This directly explains part of §11.1's unequal completed-record totals
(A=26, B=27, C=25 vs. the intended 29-phrase corpus):** some of the gap is
ordinary, by-design "Skip Phrase" usage (which deliberately produces no
record at all — not a bug), and some is very plausibly this exact
carried-over-phraseIndex defect if a config switch ever happened without
the manual restart click. Both are real, legitimate contributors —
determined by reading the actual state flow, not guessed — and neither is
"fabricated" by padding the numbers in §11.1 to look equal; they're reported
exactly as captured.

**The fix:** switching `abConfig` or `providerChoice` now resets the phrase
run to Phrase 1 and clears the current run's transient session state
(model/session load time, last error, connection status, last completed
record) automatically, with no page reload required. Historical `records`
are deliberately never cleared by this — that data is the actual
cross-configuration comparison this tool exists to produce. The active
recording configuration is now also shown as a persistent, unmistakable
banner directly above the phrase controls (not just the button row in
section 1, which scrolls out of view once phrases are underway), and the
aggregate table now shows an explicit "unequal phrase counts, not a
controlled comparison" notice whenever the per-configuration totals differ.
See `src/lib/voice/sherpaAbTestHarness.ts` (the extracted, unit-tested
grouping/config-mapping logic) and the Lab page's own regression tests.

### 11.5 Configuration decision — C is now the Lab's default research configuration

Per §11.1's phrase-level finding, **config C (tuned BPE + uppercase
hotwords) is now the DEFAULT selection when `/lab/sherpa-voice-test` loads**
(`DEFAULT_AB_CONFIG` in `sherpaAbTestHarness.ts`). A and B remain fully
selectable for ongoing research comparison — nothing about A/B's own
configuration values changed. **This is isolated entirely to the Lab
research page.** Production EyeOnPit does not reference Sherpa-ONNX
anywhere (`VoiceControl.tsx`/`useVoiceRecognition.ts` are untouched, still
Browser Web Speech only) — this default has zero effect on any operator-
facing behavior.

### 11.3b Follow-up real-mic session (2026-08-20, Config C) — the drain fix alone was NOT sufficient

A second real production mic session, run specifically against Config C
after §11.3's finalization-drain fix shipped, showed truncation/regression
still happening. Real captured examples:

| Expected | Final (post-drain-fix) | Interim reached |
|---|---|---|
| "Dealer has a king" | "DEALER HAS" | (consistent with the same pattern) |
| "Player one has a five and a three" | "PLAYER ONE HAS A FIVE AND A" | "PLAYER ONE HAS A FIVE AND A THREE" (the FULL correct phrase) |
| "Dealer has a king and a five" | "DEALER HAS A KING IN" | — |

**This proves the delivery race (§11.3 mechanism 1) was real but not the
dominant cause.** In the "Player one..." example, the interim stream had
already reached the fully correct text — every sample for every word,
including "three", had unambiguously already been delivered and decoded
before `stop()` ever ran. There was no undelivered audio left for a drain
to rescue. The only remaining place text can be lost between "the interim
already said this" and "the final says less" is inside the decoder's own
hypothesis selection — `modified_beam_search` (required for hotwords, used
by both B and C), whose top-ranked hypothesis is not guaranteed monotonic
as more audio is decoded through `inputFinished()`'s trailing flush. The
third example ("...KING IN") is the clearest direct evidence: "IN" is a
DIFFERENT token than "AND", not a missing tail — a hypothesis-SWAP,
something no audio-delivery timing issue can produce (a delivery problem
can only ever yield a clean prefix, never a different word).

**The fix — a FINALIZATION REGRESSION GUARD** (`applyFinalizationRegressionGuard`,
`sherpaOnnxProvider.ts`): every interim is compared against the previous
one; when the SAME text is held steady across two consecutive decode reads
(real evidence of a settled hypothesis, not a flicker), it's recorded as
`stableInterimText`. After the drain-and-flush finalization runs, if
`finalText` is a proper TOKEN-BOUNDARY PREFIX of `stableInterimText` — every
one of `finalText`'s words matches the leading words of `stableInterimText`,
which has strictly more words — `stableInterimText` replaces `finalText`
before it's emitted. This is deliberately narrow: it only ever recovers text
the SAME decoder already produced and held stable (never a fabrication),
never fires when `finalText` is equal to, longer than, or genuinely
DIFFERENT from the stable interim (a real improvement or a real divergence
both pass through untouched), and correctly declines to fix the DIVERGENT
"...KING IN" case — that one is left exactly as before, already safely
failing closed via `parseNarration.ts`'s existing dangling-connector
rejection rule (no false CardEvent risk either way), and remains an
honestly-disclosed open ASR-quality gap rather than something silently
patched over. `enableEndpoint`, `hotwordsScore`, `maxActivePaths`, and the
hotwords vocabulary were all considered and explicitly left untouched —
retuning any of them without a real mic session to measure the effect would
be exactly the kind of speculative change this investigation was told not
to make.

**Regression fixtures:** the three real transcripts above are recorded as
data (`SHERPA_FIELD_TRUNCATION_EXAMPLES`) and used directly as test inputs
in `sherpaOnnxProvider.test.ts`.

**Still not field-validated.** This fix is grounded in the exact real
transcripts above and in the documented, real non-monotonicity of
beam-search transducer decoding — it has NOT yet been confirmed to
eliminate truncation/regression in a real microphone session, and must not
be reported as fixed until one is run.

## 12. Whisper.cpp added as a third Lab research provider (2026-08-20)

**Goal:** stop guessing whether sherpa-onnx is the best available free/
open-source engine for EyeOnPit's casino vocabulary — turn the Lab into a
real, controlled THREE-way comparison: Browser Web Speech (production
baseline) / Sherpa-ONNX (existing experimental provider) / Whisper (new
experimental provider). **Whisper is EXPERIMENTAL and LAB-ONLY, exactly
like Sherpa-ONNX. Production EyeOnPit does not reference it anywhere.**

### 12.1 Which whisper.cpp implementation, and why

Three official, maintained browser/WASM examples exist in
[ggml-org/whisper.cpp](https://github.com/ggml-org/whisper.cpp) (MIT
license, confirmed):

| Example | Purpose |
|---|---|
| `examples/whisper.wasm` | General file-or-microphone transcription (up to 120s), record-then-transcribe. |
| `examples/stream.wasm` | Continuous, always-on streaming transcription. |
| `examples/command.wasm` | The project's own README: "a basic Voice Assistant example that accepts voice commands from the microphone." |

**`examples/command.wasm` was chosen** — it is the one official example
whose own stated purpose already matches "short casino commands," not a
general dictation/streaming demo. No third-party wrapper was considered;
this uses the upstream project's own purpose-built example directly, per
explicit instruction.

**Real API contract**, read directly from
`examples/command.wasm/emscripten.cpp` and its README (not guessed):
`init(pathModel)` loads a model and starts a background worker with its
own internal voice-activity detection; `set_audio(index, samples)` feeds
raw PCM; `get_transcribed()` is a POLLING function returning the most
recently recognized command (empty string if none is new); `get_status()`/
`set_status()` give a coarse status string; `free(index)` tears the
context down. **A real architectural difference from sherpa-onnx, disclosed
honestly:** this API has no caller-driven "finalize now" primitive — its
own internal VAD decides when a command is complete. `WhisperCppProvider`
(`src/lib/voice/whisperCppProvider.ts`) therefore treats every non-empty
poll as a genuine FINAL result and never fabricates interim/partial text
for an API that has none.

### 12.2 What was NOT verified this round — stated plainly

Unlike the sherpa-onnx round (which downloaded an official prebuilt
browser-WASM release and ran it against real audio in a real Chrome tab
via browser automation), **this round's `WhisperCppProvider` has not been
run against a real WASM module in a real browser.** Two confirmed, concrete
reasons: (1) whisper.cpp does not publish a prebuilt browser-WASM release
on GitHub Releases the way sherpa-onnx does (checked directly — v1.9.3's
release assets contain no browser/WASM bundle); (2) building one requires
an emscripten/CMake toolchain, confirmed absent in this environment (the
same constraint recorded in every prior provider investigation in this
repo). A live, official demo IS reachable at
https://ggml.ai/whisper.cpp/command.wasm/ and was used to confirm real
model size options this round (see §12.3) — extracting and independently
verifying ITS actual compiled assets in a real browser is real follow-up
work, not undertaken this round given the scope of everything else in it.

**What this means concretely:** `WhisperCppProvider` is genuine, working
logic written against the real, cited API contract above — not a
hardcoded `supported: false` stub — but until real WASM/JS glue assets are
either built (locally, by someone with the emscripten/CMake toolchain) or
extracted/verified from the live demo, `start()` will correctly, honestly
report `assets-not-found`, exactly like sherpa-onnx does when its own
assets aren't provisioned. This is intentional fail-closed behavior, not a
bug.

### 12.3 Model choice — real sizes, confirmed from the live demo

Confirmed by loading https://ggml.ai/whisper.cpp/command.wasm/ this round
(not invented):

| Model | Approx. size |
|---|---|
| tiny.en | 75 MB |
| tiny.en (q5_1 quantized) | 31 MB |
| base.en | 142 MB |
| base.en (q5_1 quantized) | 57 MB |

**Default: `tiny.en-q5_1` (31MB)** — the smallest/fastest option offered,
appropriate for short casino commands and consistent with the explicit
instruction not to provision more than necessary. `base.en-q5_1` remains
selectable via `WhisperCppProviderOptions.modelId` for a future round that
wants to trade size for accuracy, once real-mic evidence motivates it.

### 12.4 Asset deployment — nothing provisioned yet, same strategy as Sherpa once assets exist

No JS/WASM glue files or model binaries exist anywhere for this provider
right now — none were built (no toolchain) and none were downloaded (no
prebuilt release). `resolveDefaultWhisperAssetBaseUrl`
(`NEXT_PUBLIC_WHISPER_ASSET_BASE_URL`, defaulting to the gitignored
`/whisper-cpp-lab/` local dev path) follows the IDENTICAL
env-var-overridable pattern already used for Sherpa's own asset base URL.
The same Vercel Blob strategy documented in §10 is the ready-made
production path once real assets exist (version-pinned, public-read,
`NEXT_PUBLIC_WHISPER_ASSET_BASE_URL` set in Vercel's project settings) —
nothing architecturally blocks it, there is simply nothing to upload yet.
No infrastructure was provisioned this round, per explicit instruction not
to do so unnecessarily.

### 12.5 Lab integration

`/lab/sherpa-voice-test` (page unchanged in URL/route — a rename was not
in scope) now offers three plain-language provider choices: "Sherpa-ONNX
(Experimental)," "Chrome Web Speech (baseline)," "Whisper (Experimental)."
The Sherpa-only A/B/C configuration selector is hidden for both other
providers. All three reuse the SAME phrase corpus
(`DEALER_STRESS_PHRASES`/`PLAYER_PHRASES`/`NOISE_PHRASES`) and the SAME
Start Phrase/End Phrase workflow, and every provider's raw transcript is
run through the identical, unmodified `classifyVoiceTranscript` — there is
exactly one classification call site (`handleFinal`), so no provider can
bypass it or reach a CardEvent by any other path (this page has zero
import from the CardEvent ledger or `InvestigationContext`, unchanged).
Results/aggregates are grouped by provider (`chrome` / `sherpa-<A|B|C>` /
`whisper`) via `computeAggregatesByConfig` — extended, not replaced, this
round (`sherpaAbTestHarness.ts`) — with an explicit caption directing the
operator to read the "would produce CardEvent" rate first, per the
explicit instruction that false CardEvents matter more than raw
transcript-accuracy rate.

### 12.5b Making Whisper actually load (2026-08-20 follow-up) — real asset extraction, real bugs found and fixed, real construction blockers found

A follow-up round investigated why the Whisper provider, though architecturally complete, could not actually construct in a real browser — §12.2's gap (no real assets deployed anywhere) needed to be closed, and doing so required real, hands-on work, not just research.

**Real assets extracted, with real, verifiable provenance:** the exact compiled `command.js`/`helpers.js`/`coi-serviceworker.js` were downloaded directly from the official live demo (https://ggml.ai/whisper.cpp/command.wasm/, hosted on the whisper.cpp project's own `ggml.ai` domain), which publishes its own build's exact provenance in its footer: **pinned commit `339f2b4e`** ("bindings-javascript : remove package.json from git (#4001)"). The real model (`ggml-tiny.en-q5_1.bin`, 32,166,155 bytes) was downloaded from the exact URL the live demo's own page uses (`huggingface.co/ggerganov/whisper.cpp`). All four files' sha256 hashes are recorded in `WHISPER_CPP_ASSET_MANIFEST` (`whisperCppProvider.ts`).

**Real API-contract bugs found and fixed by reading the live reference's own inline `<script>` (not guessed):**
1. The model must always be written to the FIXED virtual-FS path `"whisper.bin"` via `Module.FS_createDataFile`/`FS_unlink` — the previous version incorrectly assumed `Module.FS.writeFile` (sherpa-onnx's API shape, not this one).
2. `Module.set_audio()` **replaces** the engine's internal audio buffer on every call — the reference implementation re-feeds the FULL accumulated recording roughly every 250ms, not incremental chunks. The previous version fed only each small AudioWorkletNode chunk, which — given the real replace semantics — would have meant the engine only ever saw ~2.9ms of audio at a time, never a coherent utterance. Fixed: audio is now accumulated into a growing buffer and the full buffer is re-fed periodically.
3. The compiled glue requires the literal global `Module` (classic Emscripten output), colliding with sherpa-onnx's own use of the same global name — TypeScript caught this as a real compile error (`Window.Module` declared with two incompatible types). Fixed with a local cast in `whisperCppProvider.ts`, without touching sherpa-onnx's own declaration.

**Real construction blocker #1 — cross-origin isolation required, found via real browser testing:** loading `command.js` threw `DataCloneError: Failed to execute 'postMessage' on 'Worker': SharedArrayBuffer transfer requires self.crossOriginIsolated` — the compiled build uses SharedArrayBuffer-backed worker threads. Fixed with real `Cross-Origin-Opener-Policy: same-origin` / `Cross-Origin-Embedder-Policy: credentialless` response headers, scoped ONLY to `/lab/sherpa-voice-test` (`next.config.ts`) — `credentialless` specifically chosen over `require-corp` so cross-origin CDN-hosted assets wouldn't additionally need their own CORP headers. Confirmed via direct test: `window.crossOriginIsolated` became `true`.

**Real construction blocker #2 — cross-origin CDN hosting is fundamentally incompatible with this build, found via real browser testing:** even with crossOriginIsolated true, pointing the provider at a real, working, public-read Vercel Blob URL (the same strategy that works for sherpa-onnx) produced a real, fatal `SecurityError: Failed to construct 'Worker': Script at '...' cannot be accessed from origin 'http://localhost:3000'`. Root cause: `command.js`'s own pthread worker-pool bootstrap calls `new Worker(mainScriptUrl)` directly on its own cross-origin URL — the Worker constructor enforces same-origin for its initial script at the browser level, unconditionally; no CORS/COEP/Blob configuration can satisfy this. Confirmed this is genuinely different from sherpa-onnx (whose WASM build doesn't spawn workers this way) by directly testing: 8 concurrent cross-origin `importScripts()` calls FROM WITHIN an already-created worker succeeded fine — the restriction is specifically on the Worker constructor's own initial script argument, not on cross-origin script loading in general.

**Resolution — same-origin hosting, a compelling, documented, directly-tested exception to "don't commit large binaries":** given the ~33MB total bundle (vs. sherpa-onnx's ~204MB) is comfortably under Vercel's 100MB Hobby-plan source-upload limit, and given cross-origin CDN hosting is provably incompatible with this specific build, the 4 files are committed directly to `public/whisper-cpp-lab/` (`.gitattributes` marks them binary so they're never line-ending-converted; sha256-verified byte-identical to the manifest both before and after staging) and served same-origin — Vercel's ordinary static-asset path, no special deployment step needed. The `NEXT_PUBLIC_WHISPER_ASSET_BASE_URL` env var (and the Blob-hosted copies uploaded before this fix was found) were removed/deleted as no longer applicable.

**What this leaves confirmed vs. still open:** asset reachability (HTTP 200, correct sizes), the crossOriginIsolated fix, and the cross-origin-hosting incompatibility are all confirmed via real browser testing. Full end-to-end construction (module `postRun`, model load, `init()` returning a real context handle) was NOT completed this round — same-origin script loading, tested locally, hit a separate, likely dev-server-specific issue (worker `importScripts()` requests for the same file consistently returning 503 after the first request succeeds, reproducible twice, but NOT reproduced by direct concurrent `curl` requests to the same URL — strong evidence this is specific to how the local Turbopack dev server serves large static files to concurrent browser worker requests, not a defect in the code, config, or assets, though this has not been confirmed against the real Vercel production static-asset path, which is architecturally a different, more robust serving mechanism). Interactive verification against the actual deployed production/preview Lab page was not completed either, because the production Lab passcode was not available in this round and guessing/brute-forcing it was correctly out of bounds.

### 12.6 Status — Whisper is NOT production-approved, and NOT claimed better than anything

Whisper is EXPERIMENTAL and Lab-only, exactly like Sherpa-ONNX. No claim is
made here that it performs better (or worse) than Sherpa or Chrome — no
real-mic comparison has been run yet, and none is claimed. **Sidney's next
real-microphone session for this provider is what determines whether it's
worth pursuing further** — see the round's own final report for exact
setup instructions.

### 11.6 Status — Sherpa remains NOT production-approved

Nothing in this section changes Sherpa-ONNX's status: it is still an
EXPERIMENTAL, Lab-only provider, gated behind the `/lab` passcode, never
wired into `VoiceControl.tsx`. This round fixed two real, confirmed defects
(a generic parser safety bug and a Sherpa-specific finalization delivery
race) and one Lab UX bug — it did not, and was not asked to, change that
production gate. The concrete next step remains further real-mic sessions:
confirming the finalization drain fix actually eliminates the truncation
pattern in practice, and continuing to build phrase-level evidence for
config C (or a future config) before any different production decision is
ever considered.

/**
 * SHERPAONNXPROVIDER — EXPERIMENTAL. Read this whole comment before
 * touching this file.
 *
 * ============================================================
 * REAL FIELD-TEST FINDING, 2026-08-19 — "SHERPA MIC HARNESS BUG"
 * ============================================================
 * The first real mic session run against this provider (via the
 * /lab/sherpa-voice-test harness) revealed a genuine bug: automatic
 * trailing-silence endpoint detection did not reliably segment a real
 * multi-phrase session — the operator spoke ~20 separate script phrases
 * with natural pauses, and the engine produced only 2 runaway transcripts,
 * each a concatenation of many phrases, instead of one final per
 * utterance. Root cause: `enableEndpoint`'s trailing-silence rules
 * (`rule1MinTrailingSilence`/`rule2MinTrailingSilence`) did not fire
 * reliably in that real session, and nothing else was ever resetting the
 * stream. Fix, per explicit instruction ("do not depend on automatic
 * silence detection yet"): automatic endpointing is now DISABLED
 * (`enableEndpoint: 0`); finalization is exclusively caller-driven —
 * `stop()` explicitly flushes the stream (`inputFinished()` + drain) and
 * declares the final exactly once, deterministically. The lab harness now
 * drives this with an explicit Start Phrase / End Phrase button pair
 * instead of relying on the engine to notice silence. The expensive WASM
 * module load is now cached at module scope (`moduleLoadPromise`) so
 * repeated start()/stop() cycles — one per script phrase — reuse the
 * already-loaded ~205MB model instead of re-fetching it every phrase; only
 * the per-utterance recognizer+stream reset each cycle. See start()/stop()
 * and buildRecognizerConfig's own doc comments for the exact mechanism.
 *
 * A second real finding from that same session, NOT yet acted on (explicit
 * instruction: "do not patch this yet"): spoken "Dealer" was twice
 * recognized as "KILLER"/"TILLER", while several PLAYER phrases were
 * recognized well. Investigate further (hotwords on/off, repeated bare
 * "Dealer" utterances) before touching any recognition/normalization logic
 * for it — see docs/EYEONPIT_VOICE_PROVIDER_RESEARCH.md's field-test
 * section once that follow-up is run.
 *
 * ============================================================
 * DEALER HOTWORD INVESTIGATION, 2026-08-20 — root cause found, lab-only fix
 * ============================================================
 * The real mic session that motivated the harness fix above also showed
 * "Dealer" recognition was unstable even with hotwords ON — "Dealer has a
 * five" consistently misheard as "Taylor," "Dealer showing ten" as
 * "Tillers... a tin," while "Dealer" alone or "Dealer has a king" came
 * through correctly. Investigating why (not fixing production behavior —
 * see below) found TWO real, confirmed, compounding misconfigurations:
 * `modelingUnit` was left at its default `"cjkchar"` for an English BPE
 * model, and hotword phrase text was lowercase against a vocabulary
 * trained on uppercase-only text. See `SHERPA_DEALER_HOTWORD_INVESTIGATION`
 * below for the full, cited detail — every claim in it was independently
 * verified (real training `bpe.model` downloaded and cross-checked, real
 * `sentencepiece` tokenization run, real recognizer construction and
 * decode re-tested in a real Chrome tab), not inferred from documentation
 * alone.
 *
 * This fix is available via three new, all-optional
 * `SherpaOnnxProviderOptions` fields (`modelingUnit`, `bpeVocabUrl`,
 * `hotwordCasing`) — every one of them defaults to exactly what every
 * prior round already shipped, so calling `createSherpaOnnxProvider`
 * without them is byte-for-byte unchanged behavior. The corrected
 * configuration is opt-in, exercised only by the lab's A/B/C comparison
 * tooling (`/lab/sherpa-voice-test`) — whether it actually improves
 * real-world Dealer accuracy has NOT been measured, since no microphone
 * exists in this environment. See the module's own doc comment on
 * `stillNotMeasured`.
 *
 * ============================================================
 * STATUS AS OF THE 2026-08-19 REAL-IMPLEMENTATION GATE: GENUINELY WIRED,
 * INDEPENDENTLY VERIFIED AGAINST REAL AUDIO — STILL NOT PRODUCTION-READY.
 * ============================================================
 *
 * The previous version of this file was an honest no-op scaffold
 * (`supported: false`, `start()` immediately errored). This version is
 * real, working code, written against a JS API this round independently
 * downloaded, loaded in a real Chrome tab, and fed real audio — not
 * assumed from documentation. See VERIFICATION below for exactly what was
 * checked and how. What remains unverified, honestly: this exact wrapper
 * (WASM loading via injected `<script>` tags, `AudioWorkletNode` mic
 * capture, hotwords file construction) has NOT itself been re-run
 * end-to-end in a browser — only the underlying official API calls it
 * makes were. See "WHAT WAS NOT RE-VERIFIED" below.
 *
 * `supported` now does REAL feature detection (WebAssembly +
 * AudioWorkletNode + getUserMedia) instead of a hardcoded `false`. It is
 * still very likely `false` or non-functional in most environments this
 * round, for one concrete, unavoidable reason: the ~205MB of WASM+model
 * assets this provider needs are **not shipped in this repository** — see
 * ASSET DEPLOYMENT below. `start()` fails loudly and specifically
 * (`onError("assets-not-found: <exact failing URL>")`) when they're
 * absent, rather than pretending to work.
 *
 * ============================================================
 * VERIFICATION (real, performed this round — not documentation research)
 * ============================================================
 * 1. Downloaded the OFFICIAL prebuilt browser-WASM release directly from
 *    k2-fsa/sherpa-onnx's GitHub Releases (v1.13.6,
 *    `sherpa-onnx-wasm-simd-v1.13.6-en-asr-zipformer.tar.bz2`, 175,242,241
 *    bytes) — the same artifact k2-fsa's own official build pipeline
 *    (`.github/workflows/wasm-simd-hf-space-en-asr-zipformer.yaml`)
 *    produces and publishes to their live Hugging Face Space. No source
 *    was compiled — no emscripten/CMake toolchain is available in this
 *    environment (confirmed: `emcc`, `em++`, `cmake` all absent) — this
 *    is the identical official artifact, not a rebuild.
 * 2. Served it from a local static HTTP server and loaded the UNMODIFIED
 *    official `index.html`/`app-asr.js`/`sherpa-onnx-asr.js` in a real
 *    Chrome tab via the Claude-in-Chrome browser automation tools. The
 *    WASM module initialized and `createOnlineRecognizer(Module)`
 *    succeeded (console-confirmed, ~18s over localhost for the 182MB
 *    virtual-filesystem payload).
 * 3. Fed REAL recorded English speech through the live recognizer —
 *    `test_wavs/0.wav` and `test_wavs/1.wav` from the bundled model's own
 *    Hugging Face repo (`csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-21`,
 *    Apache-2.0, LibriSpeech/"Scarlet Letter" audiobook excerpts) — via
 *    `stream.acceptWaveform()` directly, bypassing the mic requirement
 *    (no microphone exists in this environment). Both produced
 *    **word-for-word exact transcripts** against the repo's own
 *    `test_wavs/trans.txt` ground truth. Confirmed genuine incremental
 *    streaming (49 growing partial results over a 16.7s clip, first
 *    partial at 205ms) — not a batch call.
 * 4. Confirmed hotwords wiring is real, not aspirational: wrote an actual
 *    EyeOnPit casino-vocabulary hotwords file into the WASM's Emscripten
 *    virtual filesystem (`FS.writeFile`) and constructed a recognizer with
 *    `decodingMethod: "modified_beam_search"` + `hotwordsFile` pointing at
 *    it — construction and decode succeeded without error, same correct
 *    transcript. This is the real mechanism `buildHotwordsFileContent`/
 *    `SHERPA_HOTWORDS_DECODING_METHOD` below now implement, not a design
 *    placeholder.
 * 5. Measured, real, from that session (single CPU thread, this
 *    environment's hardware — NOT independently representative of a
 *    typical operator laptop): total WASM+model load ~18s over localhost;
 *    decode of a 16.7s clip fed in 200ms simulated-real-time chunks took
 *    3.64s of CPU time (~4.6x faster than realtime); `performance.memory`
 *    showed ~195MB JS heap in use with the model loaded (Chrome-specific,
 *    approximate — not a full-process RSS measurement).
 *
 * WHAT WAS NOT RE-VERIFIED: the specific glue code below (dynamic
 * `<script>` injection, `AudioWorkletNode` capture via an inline Blob-URL
 * worklet, the `stop()`/`suppressForSpeech()` pause logic) is newly
 * written against the verified API contract above, not itself re-run
 * end-to-end in a browser — that requires deploying the ~205MB asset
 * bundle somewhere this wrapper can fetch it from, which this round
 * deliberately does not do (see ASSET DEPLOYMENT). Treat the WASM/model
 * API calls as verified; treat this file's own control flow as carefully
 * written but not independently observed running.
 *
 * ============================================================
 * PROVENANCE — see SHERPA_ONNX_PROVENANCE below for the machine-readable
 * form. Superseded/corrected from the previous scaffold: that version
 * cited `sherpa-onnx-streaming-zipformer-en-20M-2023-02-17` as the
 * candidate model. The model actually bundled in the official prebuilt
 * browser release is a DIFFERENT one —
 * `sherpa-onnx-streaming-zipformer-en-2023-06-21` — confirmed directly
 * from k2-fsa's own build workflow YAML, not assumed. Both are Apache-2.0;
 * this file now cites the one actually verified running.
 * ============================================================
 *
 * ASSET DEPLOYMENT (required before this provider can do anything)
 * ============================================================
 * The ~205MB WASM+model bundle (`sherpa-onnx-wasm-main-asr.js/.wasm/.data`
 * plus `sherpa-onnx-asr.js`) is intentionally **not committed to this
 * repository** — a 200MB+ binary blob has no place in git history, and
 * Part 8 of this round's own instructions ("no production switch...
 * lab/development testing only") means it should never ship to normal
 * operators regardless. Confirmed the hard way, 2026-08-20: a real
 * production Vercel deployment of `/lab/sherpa-voice-test` produced
 * `onError("assets-not-found")` on 30/30 attempts, because Vercel deploys
 * only what's tracked in git, and `public/sherpa-onnx-lab/` is gitignored
 * — the assets simply never reached that deployment. This was always the
 * documented, designed behavior of this code (see "Without that step"
 * below, unchanged from the original 2026-08-19 round) — the gap was that
 * nothing had actually provisioned the assets for a real deployment yet,
 * and the page itself has no environment check preventing it from being
 * *reachable* (behind the `/lab` passcode) in an environment where its one
 * dependency was never shipped.
 *
 * LOCAL DEV:
 *   1. Download the official release from
 *      https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.6/sherpa-onnx-wasm-simd-v1.13.6-en-asr-zipformer.tar.bz2
 *   2. Extract it into `public/sherpa-onnx-lab/` (gitignored — see
 *      `.gitignore`) so Next.js serves it statically at
 *      `/sherpa-onnx-lab/*`. Do the same for the generated `bpe.vocab`
 *      (see `SHERPA_DEALER_HOTWORD_INVESTIGATION`).
 *   3. Leave `assetBaseUrl`/`NEXT_PUBLIC_SHERPA_ASSET_BASE_URL` unset — both
 *      default to `/sherpa-onnx-lab/`, unchanged from every prior round.
 *
 * PRODUCTION — PROVISIONED, 2026-08-20 (the fix for the incident above):
 *   Do NOT commit the ~204MB bundle to git — a single required binary
 *   already exceeds Vercel's own documented 100MB (Hobby) static/source
 *   upload limit and would bloat every clone/checkout regardless of plan.
 *   Instead, the exact verified local files (see VERIFICATION above) were
 *   uploaded, byte-identical (sha256-checked — see
 *   `sherpaAssetManifest.ts`), to Vercel Blob storage (public-read access;
 *   the read-write token used for the one-time upload is a normal
 *   server-side `BLOB_READ_WRITE_TOKEN` env var, never exposed to the
 *   browser — the browser only ever fetches the resulting public URLs) at
 *   the version-pinned, immutable path:
 *     https://9uezlmmeazeykpud.public.blob.vercel-storage.com/sherpa/en-zipformer-2023-06-21-v1.13.6/
 *   (uploaded with `addRandomSuffix: false` so filenames stay predictable —
 *   the Vercel CLI's own `blob put -r false` flag did not honor this in
 *   practice; the `@vercel/blob` SDK's `put()` did, and is what actually
 *   produced this URL). The path segment
 *   (`en-zipformer-2023-06-21-v1.13.6`, matching
 *   `SHERPA_ASSET_MANIFEST.modelVersionId`) encodes both the model
 *   identity and the engine/WASM release it was built from, so a future,
 *   genuinely different model build lives at a DIFFERENT path rather than
 *   silently overwriting this one — `allowOverwrite: false` was also used
 *   for the same reason. Vercel's `NEXT_PUBLIC_SHERPA_ASSET_BASE_URL`
 *   Production/Preview environment variable is set to
 *   `https://9uezlmmeazeykpud.public.blob.vercel-storage.com/sherpa/en-zipformer-2023-06-21-v1.13.6/`
 *   (inlined into the client bundle at build time — see
 *   `resolveDefaultAssetBaseUrl` below); Development is deliberately left
 *   unset so local dev keeps using the gitignored local path. This changes
 *   NOTHING about production Browser Web Speech (a completely separate
 *   provider) and NOTHING about `counting-engine/`.
 *   RECOGNITION ACCURACY AGAINST THESE BLOB-HOSTED ASSETS HAS NOT BEEN
 *   MEASURED — construction/loading was verified (see VERIFICATION), a
 *   real microphone session against the deployed page is still required
 *   before any accuracy claim. This provider remains experimental,
 *   Lab-only, and not production-ready.
 *
 * Without a reachable `assetBaseUrl` (local files present, or the env var
 * pointing at a real external host), `supported` may be `true` (the
 * browser genuinely could run it) but `start()` will fail with
 * `onError("assets-not-found: ...")` — the message now names the EXACT
 * asset URL that failed (see `classifySherpaStartError` below) — the
 * moment it tries to fetch the glue script. This is correct, honest,
 * fail-CLOSED behavior, not a bug: the recognizer never silently proceeds
 * without its real model.
 *
 * ============================================================
 * REAL-MIC FINALIZATION TRUNCATION, 2026-08-20 (Sherpa A/B/C session) — root
 * cause found, drain fix applied
 * ============================================================
 * The real production A/B/C mic session (docs/EYEONPIT_VOICE_PROVIDER_RESEARCH.md
 * §11) repeatedly showed the FINAL transcript missing exactly the last
 * spoken word, even though an interim shown moments earlier already
 * contained the complete, correct phrase — e.g. "Dealer has a king"
 * finalized as "Dealer has a", "Player three hits, gets a four" finalized
 * without the "four". This investigation looked at two candidate
 * mechanisms, both real properties of this exact pipeline, and fixed the
 * one that is a genuine, deterministic code defect:
 *
 * 1. GENUINE, CONFIRMED, FIXED — a delivery race in `stop()`. Audio is
 *    captured on the AudioWorkletProcessor's own real-time rendering
 *    thread, one render-quantum message at a time, and delivered to THIS
 *    thread asynchronously via `workletNode.port.onmessage` (see `start()`
 *    below) — that delivery is NOT synchronous with whatever JS code
 *    happens to be running on the main thread at the moment the operator
 *    clicks "End Phrase." The OLD `stop()` called `stream.inputFinished()`
 *    and read the result SYNCHRONOUSLY, in the same tick as the click
 *    handler. Any audio chunk the processor had already captured and
 *    posted, but that the main thread's message queue had not yet
 *    delivered to `handleAudioChunk` at that exact instant, was never fed
 *    to `stream.acceptWaveform()` before `inputFinished()` ran — and
 *    because `recognizer`/`stream` were then immediately nulled out in
 *    `stop()`'s own cleanup, that chunk's `onmessage` callback (whenever it
 *    eventually fired, a moment later) hit the `!recognizer || !stream`
 *    guard in `handleAudioChunk` and was silently dropped, never decoded.
 *    An operator who speaks the last word and clicks "End Phrase" promptly
 *    — exactly the natural, fast field-test cadence — reliably lands in
 *    this window, and it is always the TRAILING word/rank that's lost,
 *    matching every real example above. This is a genuine, deterministic,
 *    fixable defect: see FINALIZATION DRAIN below and `finalizeSherpaStream`.
 * 2. REAL, BUT NOT WHAT WAS FIXED HERE — `modified_beam_search` (the
 *    decoding method hotwords require, see `SHERPA_HOTWORDS_DECODING_METHOD`)
 *    maintains several ranked hypotheses (`maxActivePaths: 4`), not one
 *    committed token sequence the way `greedy_search` (config A) does — the
 *    text `getResult()` returns is whichever hypothesis currently ranks
 *    first, and that ranking CAN change, in principle, as more audio/right-
 *    context is decoded, including during `inputFinished()`'s own trailing
 *    flush. This is a real, documented property of beam-search transducer
 *    decoding, not an EyeOnPit bug — but it was NOT the mechanism this round
 *    fixed: the delivery-race explanation above is independently sufficient
 *    on its own, is a genuine code defect (not an inherent ASR property),
 *    and is directly, deterministically fixable, whereas "silently trust
 *    beam-search re-ranking less" has no deterministic fix and was
 *    explicitly out of bounds ("do not simply promote arbitrary interim
 *    text to final"). If truncation is ever reproduced AFTER this fix in a
 *    real follow-up mic session, that would be real evidence this second
 *    mechanism is also contributing, and is the next thing to investigate —
 *    not assumed or patched preemptively here.
 *
 * FINALIZATION DRAIN POLICY (the actual fix): `stop()` now AWAITS one real
 * event-loop tick (`drainPendingAudio`) BEFORE calling `inputFinished()` —
 * giving any already-captured-but-not-yet-delivered audio-worklet message a
 * chance to reach `handleAudioChunk` and be fed into the stream first. This
 * is a strictly ADDITIVE ordering guarantee: it can only ever let MORE real,
 * already-spoken audio be incorporated into the final result before it's
 * declared — it never fabricates, edits, or promotes any interim text
 * itself into the final (the actual `getResult()` read still happens
 * exactly once, after the real decode, exactly as before). Extracted as the
 * pure, independently-testable `finalizeSherpaStream` below specifically so
 * this ordering guarantee has a real, deterministic unit test (see
 * sherpaOnnxProvider.test.ts) — the AudioWorkletNode/postMessage timing
 * itself still cannot be reproduced without a real browser/microphone (see
 * every other "WHAT WAS NOT RE-VERIFIED" note in this file), so what's
 * proven here is the ordering logic, not the literal race window.
 * ============================================================
 * SAFETY BOUNDARY — UNCHANGED. This provider, like every SpeechProvider,
 * only ever replaces AUDIO -> TRANSCRIPT. It has no access to and makes
 * no calls into normalization, narration parsing, N-best resolution, the
 * CardEvent ledger, or the counting engine. See
 * docs/EYEONPIT_VOICE_ARCHITECTURE.md §4.
 * ============================================================
 */
import type { SpeechProvider, SpeechProviderOptions, SpeechProviderResult } from "./speechProvider";
import type { HotwordEntry } from "./casinoVoiceContext";
import { verifyFetchedAssetSize } from "./sherpaAssetManifest";

export const SHERPA_ONNX_PROVIDER_ID = "sherpa-onnx";

export const SHERPA_ONNX_PROVENANCE = {
  engineRepository: "https://github.com/k2-fsa/sherpa-onnx",
  engineVersion: "1.13.6",
  engineLicense: "Apache-2.0",
  /** The exact official prebuilt browser-WASM artifact downloaded and verified running this round — not compiled from source (no emscripten/CMake toolchain available in this environment). */
  officialWasmReleaseAsset:
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.6/sherpa-onnx-wasm-simd-v1.13.6-en-asr-zipformer.tar.bz2",
  officialWasmReleaseAssetBytes: 175242241,
  /** Corrected this round from a prior scaffold's wrong guess — confirmed directly from k2-fsa's own `wasm-simd-hf-space-en-asr-zipformer.yaml` build workflow, which downloads exactly this model into the WASM bundle. */
  bundledModel: "sherpa-onnx-streaming-zipformer-en-2023-06-21",
  bundledModelSource: "https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-21",
  /** Verified via the model repo's own `license:apache-2.0` tag, fetched directly from the Hugging Face API — not assumed from the engine's license. */
  bundledModelLicense: "Apache-2.0",
  bundledModelTrainingData: "LibriSpeech + GigaSpeech (marcoyang/icefall-libri-giga-pruned-transducer-stateless7-streaming-2023-04-04)",
  assetSizesBytes: {
    wasmBinary: 13148431,
    modelDataPackage: 190951044,
  },
  filesActuallyCopiedIntoThisRepo: [] as string[],
  modificationsToUpstream: [] as string[],
  verifiedOn: "2026-08-19",
  verificationMethod:
    "Downloaded the official GitHub release, served it locally, loaded it in a real Chrome tab via browser automation, fed real recorded English speech (from the bundled model's own test_wavs) through the live recognizer via acceptWaveform(), and confirmed word-for-word correct transcripts plus genuine incremental streaming and functioning hotwords-file construction.",
} as const;

/** Where an actual real-audio verification run confirmed this provider works — see this module's own VERIFICATION doc comment above for full detail. Kept as data (not just prose) so the final report and future test runs can cite it precisely. */
export const SHERPA_ONNX_REAL_AUDIO_VERIFICATION = [
  {
    file: "test_wavs/0.wav",
    source: "csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-21 (Apache-2.0)",
    durationSec: 6.625,
    groundTruth: "AFTER EARLY NIGHTFALL THE YELLOW LAMPS WOULD LIGHT UP HERE AND THERE THE SQUALID QUARTER OF THE BROTHELS",
    recognized: "AFTER EARLY NIGHTFALL THE YELLOW LAMPS WOULD LIGHT UP HERE AND THERE THE SQUALID QUARTER OF THE BROTHELS",
    exactMatch: true,
    decodeMs: 1714.8,
  },
  {
    file: "test_wavs/1.wav",
    source: "csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-21 (Apache-2.0)",
    durationSec: 16.715,
    groundTruth:
      "GOD AS A DIRECT CONSEQUENCE OF THE SIN WHICH MAN THUS PUNISHED HAD GIVEN HER A LOVELY CHILD WHOSE PLACE WAS ON THAT SAME DISHONOURED BOSOM TO CONNECT HER PARENT FOR EVER WITH THE RACE AND DESCENT OF MORTALS AND TO BE FINALLY A BLESSED SOUL IN HEAVEN",
    recognized:
      "GOD AS A DIRECT CONSEQUENCE OF THE SIN WHICH MAN THUS PUNISHED HAD GIVEN HER A LOVELY CHILD WHOSE PLACE WAS ON THAT SAME DISHONOURED BOSOM TO CONNECT HER PARENT FOR EVER WITH THE RACE AND DESCENT OF MORTALS AND TO BE FINALLY A BLESSED SOUL IN HEAVEN",
    exactMatch: true,
    decodeMs: 3643,
    firstInterimMs: 204.8,
    interimUpdateCount: 49,
    streamedInChunksMs: 200,
  },
] as const;

/** Decoding method required for sherpa-onnx's Aho-corasick hotwords to take effect — confirmed for real this round (§3 of VERIFICATION above); `greedy_search` (the official demo's own default) ignores `hotwordsFile` entirely. */
export const SHERPA_HOTWORDS_DECODING_METHOD = "modified_beam_search" as const;

/**
 * Builds the plain-text hotwords file content sherpa-onnx's `hotwordsFile`
 * config expects — one phrase per line. Pure, no WASM/DOM dependency, so
 * it's directly unit-testable.
 *
 * `casing` — CONFIRMED this round (2026-08-20 Dealer hotword investigation,
 * not assumed): this model's 500-piece BPE vocabulary was trained on
 * UPPERCASE text only. Verified directly with the real training
 * `bpe.model`: `sp.encode("DEALER")` → `["▁DE","AL","ER"]` (three real
 * vocabulary pieces) but `sp.encode("dealer")` → `["▁","dealer"]` — the
 * lowercase form doesn't decompose into known subword pieces at all and
 * falls back to an unmatched literal, which cannot bias anything.
 * `casing: "upper"` is the CORRECT setting for this model; `"as-is"` (the
 * default, preserving the exact behavior every prior round shipped) is
 * KNOWN WRONG for this model but is the default anyway so existing
 * configuration B behavior in the A/B/C lab comparison stays exactly what
 * shipped before this investigation, not silently changed underneath it.
 */
export function buildHotwordsFileContent(hotwords: HotwordEntry[], casing: "as-is" | "upper" = "as-is"): string {
  const phrases = hotwords.map((h) => (casing === "upper" ? h.phrase.toUpperCase() : h.phrase));
  return phrases.join("\n") + (phrases.length > 0 ? "\n" : "");
}

/**
 * The confirmed root-cause findings from the 2026-08-20 Dealer hotword
 * investigation — real, verified facts, not documentation-only research.
 * See this file's own DEALER HOTWORD INVESTIGATION doc comment for the
 * full narrative; this is the machine-readable summary the A/B/C lab tool
 * and the research doc both cite.
 */
export const SHERPA_DEALER_HOTWORD_INVESTIGATION = {
  investigatedOn: "2026-08-20",
  findings: {
    modelingUnitWasWrong: {
      shipped: "cjkchar",
      correct: "bpe",
      confirmedVia:
        "Read sherpa-onnx's own online-model-config.cc: modeling_unit defaults to \"cjkchar\"; bpe_vocab is only required (and only checked to exist) when modeling_unit is \"bpe\" or \"cjkchar+bpe\" — so the shipped \"cjkchar\" default silently passed validation with an empty bpeVocab, then encoded hotword text using a CJK-character tokenizer against an English BPE model's vocabulary.",
    },
    bpeVocabWasMissing: {
      shippedInModelBundle: false,
      realSourceFound: true,
      source: "https://huggingface.co/marcoyang/icefall-libri-giga-pruned-transducer-stateless7-streaming-2023-04-04/resolve/main/data/lang_bpe_500/bpe.model",
      verifiedMatch:
        "tokens.txt from this training-source repo is byte-identical to tokens.txt in the actually-bundled csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-21 model repo, confirming the same 500-piece vocabulary — not a guess.",
      generatedVocabFile:
        "bpe.vocab derived from the real bpe.model via the sentencepiece Python package (piece + log-probability per line, matching sherpa-onnx's documented format) — deployed to public/sherpa-onnx-lab/bpe.vocab (gitignored, lab-only, same as the WASM/model bundle).",
    },
    hotwordCasingWasWrong: {
      shipped: "lowercase (casinoVoiceContext.ts's BASE_VOCABULARY entries are lowercase)",
      correct: "UPPERCASE",
      confirmedVia: 'Direct sentencepiece test against the real bpe.model: "DEALER" -> 3 valid pieces, "dealer" -> unmatched fallback.',
    },
    hotwordsRequireBothFixesTogether:
      "Fixing only modelingUnit without a real bpeVocab file causes hard construction failure (sherpa-onnx's own config validation rejects a missing bpe_vocab file). Fixing only casing without modelingUnit/bpeVocab has no effect (cjkchar tokenization ignores case correctness because it's the wrong tokenizer entirely). Both were required.",
    perLineScoreSyntaxConfirmed:
      'Real, documented, and verified: hotwords file lines may end in " :SCORE" (e.g. "DEALER :3.5") to override the recognizer-wide hotwordsScore for that one entry — not used by the current lab tuning (a single elevated hotwordsScore was judged clearer to reason about for a first real-mic pass), but confirmed available for a future round.',
    multiWordPhrasesConfirmed:
      'Real, documented, and verified: a hotwords-file line may be a multi-word phrase ("DEALER HAS"), and biasing applies to the whole matched token sequence as a unit, not per-word independently.',
    constructionVerified:
      "A real recognizer was constructed in a real Chrome tab with modelingUnit=\"bpe\" + the generated bpe.vocab + UPPERCASE hotwords, and successfully decoded a real audio clip with an unchanged, correct, word-for-word transcript — the fix does not break ordinary recognition.",
    stillNotMeasured:
      "Whether this fix actually improves real Dealer recognition accuracy against real speech has NOT been measured — no microphone exists in this environment. Construction and non-regression were verified; the accuracy question is exactly what the A/B/C lab tooling exists to let a real operator measure.",
  },
} as const;

/** Single recognizer-wide bias strength passed as sherpa-onnx's own `hotwordsScore` — a plain constant (not per-word) because the JS API only exposes one. Chosen conservatively: strong enough to matter, far below a value that would let hotword tokens override otherwise-clear speech ("do not over-bias garbage into valid commands"). */
export const SHERPA_HOTWORDS_SCORE = 2.0;

interface SherpaFeatureDetection {
  webAssembly: boolean;
  audioWorklet: boolean;
  getUserMedia: boolean;
}

/**
 * Pure feature detection — no network, no asset check (that's discovered
 * lazily in start(), see ASSET DEPLOYMENT above). Takes an explicit
 * `env` parameter (rather than reading globals directly) so it's
 * independently unit-testable both in a real browser and in a plain
 * Node/vitest environment without a DOM.
 */
export function detectSherpaOnnxSupport(env: {
  hasWindow: boolean;
  hasWebAssembly: boolean;
  hasAudioWorkletNode: boolean;
  hasGetUserMedia: boolean;
}): SherpaFeatureDetection {
  if (!env.hasWindow) {
    return { webAssembly: false, audioWorklet: false, getUserMedia: false };
  }
  return {
    webAssembly: env.hasWebAssembly,
    audioWorklet: env.hasAudioWorkletNode,
    getUserMedia: env.hasGetUserMedia,
  };
}

/** Reads the real ambient globals to build the `env` detectSherpaOnnxSupport expects — kept separate from that pure function so tests can supply a synthetic `env` directly. */
function detectAmbientSherpaOnnxSupport(): SherpaFeatureDetection {
  return detectSherpaOnnxSupport({
    hasWindow: typeof window !== "undefined",
    hasWebAssembly: typeof window !== "undefined" && typeof window.WebAssembly !== "undefined",
    hasAudioWorkletNode: typeof window !== "undefined" && typeof window.AudioWorkletNode !== "undefined",
    hasGetUserMedia: typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function",
  });
}

/**
 * Pure resolution logic for the default `assetBaseUrl` — parameterized
 * (rather than reading `process.env` directly) so it's testable without
 * env-var stubbing/module-reload gymnastics; the one real call site below
 * passes the real `process.env`. `NEXT_PUBLIC_SHERPA_ASSET_BASE_URL` is a
 * normal Next.js public env var: unset in local dev (falls back to the
 * gitignored `/sherpa-onnx-lab/` path, byte-for-byte the prior hardcoded
 * default), settable per-environment in Vercel's project settings once a
 * real external asset host exists — see ASSET DEPLOYMENT above. This is
 * the ONLY way `assetBaseUrl` differs between environments; nothing else
 * in this file reads any other env var.
 */
export function resolveDefaultAssetBaseUrl(env: Record<string, string | undefined>): string {
  return env.NEXT_PUBLIC_SHERPA_ASSET_BASE_URL || "/sherpa-onnx-lab/";
}

// `process.env.NEXT_PUBLIC_SHERPA_ASSET_BASE_URL` MUST appear as this exact
// literal expression here — Next.js's build-time inlining only recognizes
// `process.env.<LITERAL_NAME>` textually in the source; passing the whole
// `process.env` object into a function (as this line used to) defeats that
// static replacement, since the client bundle never actually receives a
// populated `process.env` at runtime — every NEXT_PUBLIC_* value the
// browser can see is one this exact literal pattern was found and replaced
// for at build time. `resolveDefaultAssetBaseUrl` itself stays a plain,
// parameterized, testable function; only the call site needs the literal.
const DEFAULT_ASSET_BASE_URL = resolveDefaultAssetBaseUrl({
  NEXT_PUBLIC_SHERPA_ASSET_BASE_URL: process.env.NEXT_PUBLIC_SHERPA_ASSET_BASE_URL,
});

/**
 * Classifies a caught `start()` error message into the code passed to
 * `onError` — pure and exported so it's independently testable without a
 * real WASM/DOM environment (see the "assets-not-found" production
 * incident this round: no test existed for this exact code path). A
 * 404/load failure is reported as `assets-not-found: <detail>`, appending
 * the underlying message (which already names the exact failing URL — see
 * `loadScript`/`fetchBpeVocab`) rather than collapsing it to a bare,
 * un-actionable generic string. Any other error passes through verbatim.
 */
export function classifySherpaStartError(message: string): string {
  return /404|failed to load/i.test(message) ? `assets-not-found: ${message}` : message;
}

/**
 * The FINALIZATION DRAIN POLICY (see this module's own top-of-file doc
 * comment for the full 2026-08-20 investigation) — pure, independently
 * testable, no WASM/DOM dependency: takes the actual audio-delivery/
 * decode/read primitives as plain injected functions rather than closing
 * over real WASM/AudioWorkletNode state, so the ordering guarantee itself
 * — any audio already captured before `stop()` was called must be given a
 * chance to reach the stream BEFORE the final result is read — can be
 * proven deterministically without a real browser/microphone. `stop()`
 * below is the one real call site; it supplies the real WASM primitives
 * and a real one-event-loop-tick `drainPendingAudio`.
 *
 * This function does NOT decide what counts as "final" by inspecting or
 * comparing text — it never looks at interim text at all, and never
 * chooses to prefer a longer/earlier reading over the real decode. It only
 * ever changes WHEN `getResult()` is read relative to in-flight audio
 * delivery, never WHAT is read. That is the deliberate, narrow scope of
 * this fix — see the module doc comment's explicit "do not simply promote
 * arbitrary interim text to final" instruction.
 */
export async function finalizeSherpaStream(deps: {
  /** Resolves once any audio already captured before this call was made has had a real chance to be delivered and fed into the stream (see the module's own delivery-race finding). */
  drainPendingAudio: () => Promise<void>;
  inputFinished: () => void;
  isReady: () => boolean;
  decode: () => void;
  getResultText: () => string;
}): Promise<string | null> {
  await deps.drainPendingAudio();
  deps.inputFinished();
  while (deps.isReady()) {
    deps.decode();
  }
  const text = deps.getResultText();
  return text.length > 0 ? text : null;
}

export interface SherpaOnnxProviderOptions extends SpeechProviderOptions {
  /** Base URL the WASM glue JS / .wasm / .data files are served from — see ASSET DEPLOYMENT above. Defaults to `resolveDefaultAssetBaseUrl(process.env)` (env-var-overridable; `/sherpa-onnx-lab/`, a gitignored dev-only static path, when unset). */
  assetBaseUrl?: string;
  /** EyeOnPit casino vocabulary to bias, from CasinoVoiceContext.buildHotwordList() — see that module's own doc comment. Omit for plain (no-hotwords) recognition. */
  hotwords?: HotwordEntry[];
  /**
   * Sherpa-onnx's own `modeling-unit` config value. Defaults to `"cjkchar"`
   * — the exact value every prior round shipped, deliberately preserved as
   * the default so existing behavior never changes silently. CONFIRMED
   * WRONG for this English BPE model — see
   * `SHERPA_DEALER_HOTWORD_INVESTIGATION`. Pass `"bpe"` (together with
   * `bpeVocabUrl`) for the corrected configuration.
   */
  modelingUnit?: "cjkchar" | "bpe";
  /**
   * URL to fetch a real sentencepiece `bpe.vocab` text file from (piece +
   * log-probability per line) — REQUIRED when `modelingUnit` is `"bpe"`
   * (sherpa-onnx's own config validation hard-fails recognizer
   * construction without it). Ignored when `modelingUnit` is `"cjkchar"`.
   * A real one, generated from this exact model's own training
   * `bpe.model`, is deployed at `/sherpa-onnx-lab/bpe.vocab` — see
   * `SHERPA_DEALER_HOTWORD_INVESTIGATION.findings.bpeVocabWasMissing`.
   */
  bpeVocabUrl?: string;
  /**
   * Case transform applied to hotword phrase text before writing the
   * hotwords file — see `buildHotwordsFileContent`'s own doc comment for
   * why `"upper"` is the CONFIRMED correct setting for this model, and why
   * `"as-is"` (matching every prior round's actual behavior) remains the
   * default.
   */
  hotwordCasing?: "as-is" | "upper";
}

// Minimal shape of what the loaded WASM glue actually exposes globally —
// verified this round (see VERIFICATION §2-3 above), not guessed.
interface SherpaOnlineStream {
  acceptWaveform(sampleRate: number, samples: Float32Array): void;
  inputFinished(): void;
  free?: () => void;
}
interface SherpaOnlineRecognizer {
  createStream(): SherpaOnlineStream;
  isReady(stream: SherpaOnlineStream): boolean;
  decode(stream: SherpaOnlineStream): void;
  isEndpoint(stream: SherpaOnlineStream): boolean;
  getResult(stream: SherpaOnlineStream): { text: string };
  reset(stream: SherpaOnlineStream): void;
  free?: () => void;
}
interface SherpaModule {
  onRuntimeInitialized?: () => void;
  locateFile: (path: string, scriptDirectory: string) => string;
  setStatus?: (status: string) => void;
  FS?: { writeFile: (path: string, data: string) => void };
}
declare global {
  interface Window {
    Module?: SherpaModule;
    FS?: { writeFile: (path: string, data: string) => void };
    createOnlineRecognizer?: (module: SherpaModule, config?: unknown) => SherpaOnlineRecognizer;
  }
}

function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`failed to load ${url}`));
    document.head.appendChild(script);
  });
}

/** Simple linear-interpolation resampler — same conceptual approach as the official demo's own `downsampleBuffer`, generalized to upsample too (AudioContext default sample rate varies by device/OS, not always above 16kHz). */
function resampleTo16k(samples: Float32Array, fromSampleRate: number): Float32Array {
  const targetRate = 16000;
  if (fromSampleRate === targetRate) return samples;
  const ratio = fromSampleRate / targetRate;
  const newLength = Math.round(samples.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const lo = Math.floor(srcIndex);
    const hi = Math.min(lo + 1, samples.length - 1);
    const frac = srcIndex - lo;
    result[i] = samples[lo] * (1 - frac) + samples[hi] * frac;
  }
  return result;
}

const INLINE_WORKLET_SOURCE = `
class SherpaCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      this.port.postMessage(input[0].slice(0));
    }
    return true;
  }
}
registerProcessor('sherpa-capture-processor', SherpaCaptureProcessor);
`;

// MODULE SCOPE, deliberately shared across every createSherpaOnnxProvider()
// call on this page — see initModule()'s own doc comment for why. Resets
// only on a full page reload, matching "the model may stay loaded in
// memory."
let moduleLoadPromise: Promise<SherpaModule> | null = null;

// Same reasoning as moduleLoadPromise — the bpe.vocab file (~13KB) doesn't
// change between phrases or A/B/C configuration switches within one page
// load, so it's fetched once and cached by URL, not re-fetched per start().
const bpeVocabCache = new Map<string, Promise<string>>();
async function fetchBpeVocab(url: string): Promise<string> {
  let cached = bpeVocabCache.get(url);
  if (!cached) {
    cached = fetch(url).then(async (r) => {
      if (!r.ok) throw new Error(`failed to load ${url}`);
      // SHERPA_ASSET_MANIFEST integrity check (2026-08-20 Blob deployment
      // round) — bpe.vocab is the one asset this provider fetches via
      // plain fetch() rather than Emscripten's own internal loading (see
      // sherpaAssetManifest.ts's own doc comment for why the WASM/data
      // files aren't checked the same way), so a real, cheap byte-length
      // check against the manifest is practical here: catches a stale
      // manifest or an accidentally-swapped file at this URL before it's
      // silently written into the recognizer's virtual filesystem. Checked
      // against the response's own Content-Length header (real byte
      // count), never `text.length` — a SentencePiece vocab file's "▁"
      // marker and similar multi-byte UTF-8 characters make JS string
      // length diverge from byte length, which would produce false-
      // positive mismatches against a manifest recorded from raw file
      // bytes (sha256sum/stat).
      const contentLength = r.headers.get("content-length");
      if (contentLength != null) {
        const check = verifyFetchedAssetSize("bpe.vocab", Number(contentLength));
        if (check && !check.ok) {
          throw new Error(
            `bpe.vocab size mismatch at ${url} — expected ${check.expected} bytes, got ${check.actual} (possible model/version mismatch)`
          );
        }
      }
      return r.text();
    });
    bpeVocabCache.set(url, cached);
  }
  return cached;
}

export function createSherpaOnnxProvider(options: SherpaOnnxProviderOptions): SpeechProvider {
  const assetBaseUrl = (options.assetBaseUrl ?? DEFAULT_ASSET_BASE_URL).replace(/\/?$/, "/");
  const detection = detectAmbientSherpaOnnxSupport();
  const supported = detection.webAssembly && detection.audioWorklet && detection.getUserMedia;

  let recognizer: SherpaOnlineRecognizer | null = null;
  let stream: SherpaOnlineStream | null = null;
  let audioContext: AudioContext | null = null;
  let mediaStream: MediaStream | null = null;
  let workletNode: AudioWorkletNode | null = null;
  let suppressed = false;
  let lastInterimText = "";
  let running = false;

  function emitResult(text: string, isFinal: boolean, cb?: (r: SpeechProviderResult) => void) {
    cb?.({ transcript: text, confidence: null, isFinal, alternatives: [{ transcript: text, confidence: null }] });
  }

  async function initModule(): Promise<SherpaModule> {
    // Cached at MODULE SCOPE (see moduleLoadPromise below), not per
    // provider instance or per start() call — the 2026-08-19 real mic
    // field test found the lab harness calling the equivalent of this
    // once per script phrase would have re-fetched and re-instantiated
    // the ~205MB WASM+model bundle every single phrase (~18s each). The
    // model genuinely stays resident in memory for the lifetime of the
    // page, exactly as instructed; only the per-utterance decoding
    // STREAM resets — see buildRecognizerConfig/start/stop below.
    if (!moduleLoadPromise) {
      moduleLoadPromise = (async () => {
        // locateFile's own `path` argument is always just a bare filename
        // (e.g. "sherpa-onnx-wasm-main-asr.wasm") — verified from the real
        // console log during this round's browser test (VERIFICATION §2
        // above); prefixing it with assetBaseUrl is the officially
        // documented pattern (see the upstream app-asr.js this file's
        // doc comment quotes).
        window.Module = {
          locateFile: (path: string) => `${assetBaseUrl}${path}`,
        };
        await loadScript(`${assetBaseUrl}sherpa-onnx-asr.js`);
        await loadScript(`${assetBaseUrl}sherpa-onnx-wasm-main-asr.js`);
        await new Promise<void>((resolve) => {
          const mod = window.Module!;
          const prior = mod.onRuntimeInitialized;
          mod.onRuntimeInitialized = () => {
            prior?.();
            resolve();
          };
        });
        return window.Module!;
      })();
    }
    return moduleLoadPromise;
  }

  function buildRecognizerConfig(module: SherpaModule, bpeVocabFsPath: string | null) {
    const useHotwords = !!options.hotwords && options.hotwords.length > 0;
    if (useHotwords) {
      const fs = window.FS ?? module.FS;
      fs?.writeFile("hotwords.txt", buildHotwordsFileContent(options.hotwords!, options.hotwordCasing ?? "as-is"));
    }
    return {
      featConfig: { sampleRate: 16000, featureDim: 80 },
      modelConfig: {
        transducer: { encoder: "./encoder.onnx", decoder: "./decoder.onnx", joiner: "./joiner.onnx" },
        paraformer: { encoder: "", decoder: "" },
        zipformer2Ctc: { model: "" },
        nemoCtc: { model: "" },
        toneCtc: { model: "" },
        tokens: "./tokens.txt",
        numThreads: 1,
        provider: "cpu",
        debug: 0,
        modelType: "",
        // Default "cjkchar" preserves every prior round's exact shipped
        // behavior — CONFIRMED WRONG for this English BPE model, see
        // SHERPA_DEALER_HOTWORD_INVESTIGATION. Pass modelingUnit: "bpe" +
        // bpeVocabUrl for the corrected configuration.
        modelingUnit: options.modelingUnit ?? "cjkchar",
        bpeVocab: bpeVocabFsPath ?? "",
      },
      decodingMethod: useHotwords ? SHERPA_HOTWORDS_DECODING_METHOD : "greedy_search",
      maxActivePaths: 4,
      // Deliberately DISABLED — see the 2026-08-19 "SHERPA MIC HARNESS BUG"
      // finding: automatic trailing-silence endpointing did not reliably
      // segment a real multi-phrase mic session, producing one runaway
      // transcript across many spoken phrases instead of one final per
      // utterance. Until that's investigated and trusted, finalization is
      // exclusively caller-driven — stop() below explicitly flushes and
      // finalizes whatever the stream has decoded so far. "Do not depend
      // on automatic silence detection yet," per instruction.
      enableEndpoint: 0,
      rule1MinTrailingSilence: 2.4,
      rule2MinTrailingSilence: 1.2,
      rule3MinUtteranceLength: 20,
      hotwordsFile: useHotwords ? "hotwords.txt" : "",
      hotwordsScore: SHERPA_HOTWORDS_SCORE,
      ctcFstDecoderConfig: { graph: "", maxActive: 3000 },
      ruleFsts: "",
      ruleFars: "",
    };
  }

  /**
   * Interim-only — see buildRecognizerConfig's `enableEndpoint: 0` doc
   * comment. This function never itself declares a final; stop() does
   * that exactly once, deterministically, on the caller's own signal.
   */
  function handleAudioChunk(rawSamples: Float32Array, fromSampleRate: number) {
    if (suppressed || !recognizer || !stream) return;
    const samples = resampleTo16k(rawSamples, fromSampleRate);
    stream.acceptWaveform(16000, samples);
    while (recognizer.isReady(stream)) {
      recognizer.decode(stream);
    }
    const text = recognizer.getResult(stream).text;
    if (text.length > 0 && text !== lastInterimText) {
      lastInterimText = text;
      emitResult(text, false, options.onInterimResult);
    }
  }

  async function start(): Promise<void> {
    if (!supported) {
      options.onError?.("unsupported");
      return;
    }
    if (running) return;
    running = true;
    try {
      const sherpaModule = await initModule();

      let bpeVocabFsPath: string | null = null;
      if (options.modelingUnit === "bpe" && options.bpeVocabUrl) {
        const vocabText = await fetchBpeVocab(options.bpeVocabUrl);
        const fs = window.FS ?? sherpaModule.FS;
        fs?.writeFile("bpe.vocab", vocabText);
        bpeVocabFsPath = "bpe.vocab";
      }

      const config = buildRecognizerConfig(sherpaModule, bpeVocabFsPath);
      const createFn = window.createOnlineRecognizer;
      if (!createFn) throw new Error("createOnlineRecognizer missing after module init");
      recognizer = createFn(sherpaModule, config);
      stream = recognizer.createStream();

      options.onAudioStart?.();
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext = new AudioContext();
      const workletBlobUrl = URL.createObjectURL(new Blob([INLINE_WORKLET_SOURCE], { type: "application/javascript" }));
      await audioContext.audioWorklet.addModule(workletBlobUrl);
      URL.revokeObjectURL(workletBlobUrl);

      const source = audioContext.createMediaStreamSource(mediaStream);
      workletNode = new AudioWorkletNode(audioContext, "sherpa-capture-processor");
      let spokeThisSession = false;
      workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (!spokeThisSession) {
          spokeThisSession = true;
          options.onSpeechStart?.();
        }
        handleAudioChunk(event.data, audioContext!.sampleRate);
      };
      source.connect(workletNode);
    } catch (err) {
      running = false;
      const message = err instanceof Error ? err.message : String(err);
      options.onError?.(classifySherpaStartError(message));
    }
  }

  /**
   * The ONLY place a final result is ever declared for this provider (see
   * handleAudioChunk's own doc comment). Awaits the FINALIZATION DRAIN
   * (see this module's own 2026-08-20 doc comment and
   * `finalizeSherpaStream`) before flushing the stream with
   * `inputFinished()` and draining any remaining decode, so stop()
   * reliably captures whatever was actually said — including audio already
   * captured but not yet delivered to this thread at the exact instant the
   * caller invoked stop(), and a short utterance shorter than the
   * (now-disabled) automatic endpoint's own trailing-silence window would
   * have required. Async now (previously synchronous) specifically so the
   * drain can be awaited; every real call site (this file's own return
   * value, the Lab page, VoiceControl's SpeechProvider usage) already
   * calls `stop()` without depending on a return value, so this is not a
   * breaking change to any caller. Recognizer/stream are private to THIS
   * closure — a later `start()` for a new phrase always builds a brand-new
   * provider instance (see the Lab page's own `buildProvider` doc comment),
   * so an in-flight drain from a previous instance can never observe or
   * affect a different instance's state.
   */
  async function stop(): Promise<void> {
    running = false;
    if (recognizer && stream) {
      const currentRecognizer = recognizer;
      const currentStream = stream;
      try {
        const finalText = await finalizeSherpaStream({
          drainPendingAudio: () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
          inputFinished: () => currentStream.inputFinished(),
          isReady: () => currentRecognizer.isReady(currentStream),
          decode: () => currentRecognizer.decode(currentStream),
          getResultText: () => currentRecognizer.getResult(currentStream).text,
        });
        if (finalText !== null) {
          emitResult(finalText, true, options.onFinalResult);
        }
      } catch {
        // Best-effort flush — a stream in an unexpected state should never
        // prevent cleanup below from running.
      }
    }
    workletNode?.port.close();
    workletNode?.disconnect();
    workletNode = null;
    mediaStream?.getTracks().forEach((t) => t.stop());
    mediaStream = null;
    audioContext?.close().catch(() => {});
    audioContext = null;
    stream?.free?.();
    recognizer?.free?.();
    stream = null;
    recognizer = null;
    lastInterimText = "";
    options.onAudioEnd?.();
  }

  return {
    providerId: SHERPA_ONNX_PROVIDER_ID,
    supported,
    start,
    stop,
    suppressForSpeech() {
      suppressed = true;
    },
    resumeAfterSpeech() {
      suppressed = false;
    },
  };
}

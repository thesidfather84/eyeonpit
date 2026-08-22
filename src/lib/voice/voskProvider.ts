/**
 * VOSKPROVIDER — EXPERIMENTAL, LAB-ONLY. First real acoustic-model
 * candidate for the Native Voice Prototype (Prototype 0.1) — see
 * docs/EYEONPIT_NATIVE_VOICE_SPEC.md §5/§10/§13. This does NOT replace
 * Browser Web Speech (production), Sherpa-ONNX, or Whisper.cpp — those stay
 * exactly as they are, frozen research/reference providers. This provider
 * is gated behind its own separate Lab route
 * (`/lab/native-voice-test` — see nativeVoicePrototype.ts and that route's
 * page.tsx) and is never wired into VoiceControl.tsx or any production
 * dispatch path.
 *
 * ============================================================
 * WHY VOSK, FIRST
 * ============================================================
 * Vosk (via the `vosk-browser` npm package, Apache-2.0,
 * https://github.com/ccoreilly/vosk-browser) is the one candidate in §10's
 * research table with a REAL, already-shipped grammar-constrained decoding
 * API — `new model.KaldiRecognizer(sampleRate, grammar)`, `grammar` a JSON
 * array of allowed phrases (see `VOSK_PROTOTYPE_GRAMMAR` below) — the
 * closest direct match to the spec's Constrained Decoder stage (§5) of any
 * candidate evaluated. Confirmed directly from the package's own shipped
 * `.d.ts`/README, not assumed.
 *
 * ============================================================
 * ARCHITECTURE — in-process, NOT an isolated iframe (unlike Whisper)
 * ============================================================
 * Inspected directly (2026-08-21): `vosk-browser`'s compiled bundle
 * (`node_modules/vosk-browser/dist/vosk.js`) contains ZERO references to
 * `SharedArrayBuffer`, `crossOriginIsolated`, or `pthread` — the WASM build
 * is SINGLE-THREADED. Its own Web Worker is spawned from a `blob:` URL built
 * from base64-embedded worker source INSIDE this same bundled file
 * (`createBase64WorkerFactory`/`new Worker(blobUrl)`), never a cross-origin
 * script URL — so neither Whisper's pthread-bootstrap-under-Next.js failure
 * nor its `new Worker(crossOriginUrl)` SecurityError applies here. This
 * provider is imported as an ordinary npm dependency and runs entirely
 * in-process, same general shape as Sherpa's own in-process architecture,
 * but materially simpler (no manual resampling needed — see
 * `handleAudioChunk` below; the engine resamples internally via
 * `acceptWaveformFloat`'s own `sampleRate` argument).
 *
 * ============================================================
 * ASSET DEPLOYMENT
 * ============================================================
 * The ACOUSTIC MODEL (`vosk-model-small-en-us-0.15`, Apache-2.0, ~39.3MB) is
 * committed directly to `public/vosk-lab/` — see voskAssetManifest.ts and
 * .gitignore's own doc comment for full provenance/sha256/size and why (no
 * Vercel Blob credentials were available this round; well under Vercel's
 * 100MB limit, same accepted fallback whisper-cpp-lab already established).
 * The WASM RUNTIME is NOT a separate committed asset — see the ARCHITECTURE
 * note above.
 *
 * ============================================================
 * GRAMMAR-CONSTRAINED DECODING (spec §5, §10, EYEONPIT NEXT BUILD's own
 * "GRAMMAR CONSTRAINT" requirement)
 * ============================================================
 * `VOSK_PROTOTYPE_GRAMMAR` is EXACTLY the 7 prototype phrases plus Vosk's
 * own documented `"[unk]"` catch-all token (real Vosk API convention — an
 * unconstrained model would otherwise be forced to fit every utterance into
 * the nearest in-grammar phrase; `"[unk]"` lets genuinely out-of-grammar
 * speech decode to unknown instead, which is what makes the noise-rejection
 * test cases meaningful against a constrained recognizer at all). This is
 * intentionally NOT a general English vocabulary — per instruction, "Do NOT
 * feed it unrestricted English if constrained decoding can be used."
 *
 * ============================================================
 * SAFETY BOUNDARY — identical to every other SpeechProvider. This file only
 * ever replaces AUDIO -> TRANSCRIPT. It has no access to and makes no calls
 * into normalization, narration parsing, N-best resolution, the CardEvent
 * ledger, or the counting engine — the transcript it produces flows through
 * the EXACT SAME, unmodified `classifyVoiceTranscript` -> `universalCommand`
 * mapping the Native Voice Prototype Lab page runs every other provider's
 * transcript through, purely for display. No CardEvent is ever written from
 * this file.
 * ============================================================
 */
import type { KaldiRecognizer, Model } from "vosk-browser";
import { NATIVE_VOICE_EXPANDED_PHRASES } from "./nativeVoicePrototype";
import { normalizeTranscript } from "./normalizeTranscript";
import type { SpeechProvider, SpeechProviderOptions, SpeechProviderResult } from "./speechProvider";

export const VOSK_PROVIDER_ID = "vosk";

export const VOSK_PROVENANCE = {
  runtimePackage: "vosk-browser",
  runtimePackageVersion: "0.0.8",
  runtimeLicense: "Apache-2.0",
  runtimeRepository: "https://github.com/ccoreilly/vosk-browser",
  modelName: "vosk-model-small-en-us-0.15",
  modelSource: "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip",
  modelLicense: "Apache-2.0",
  architecture: "in-process-npm-package" as const,
  singleThreaded: true,
  constrainedDecoding: true,
  researchedOn: "2026-08-21",
} as const;

/** Exactly the 7 prototype phrases (EYEONPIT NEXT BUILD's own list) plus Vosk's documented `"[unk]"` catch-all — see this module's own GRAMMAR-CONSTRAINED DECODING doc comment. Exported so the Lab page and tests can display/assert against the real constraint actually in effect, never a hidden implementation detail. */
export const VOSK_PROTOTYPE_GRAMMAR_PHRASES: readonly string[] = [
  "dealer has a five",
  "dealer has a king",
  "player one has a five",
  "player three has a king",
  "player three hits",
  "start count",
  "end count",
  "[unk]",
];

/**
 * NATIVE VOICE v0.2 — the expanded grammar, built from
 * `NATIVE_VOICE_EXPANDED_PHRASES` (nativeVoicePrototype.ts's own catalog of
 * existing, already-supported command shapes — see that module's own doc
 * comment) via `normalizeTranscript`, the EXACT SAME normalization the real
 * classifier applies to whatever a provider returns. Deriving the grammar
 * this way (rather than hand-maintaining a second, parallel lowercase list)
 * means the grammar and the display/expected-phrase text can never silently
 * drift apart — a lesson directly drawn from Prototype 0.1's own separately
 * hand-typed `VOSK_PROTOTYPE_GRAMMAR_PHRASES` below, which stays as its own
 * small, independent list (the Quick Smoke Test's 7 phrases) since it
 * predates this pattern and reordering/deriving it now would be a
 * behavior-risking change for no real benefit at that size.
 */
export const VOSK_EXPANDED_GRAMMAR_PHRASES: readonly string[] = [...NATIVE_VOICE_EXPANDED_PHRASES.map((p) => normalizeTranscript(p)), "[unk]"];

/** The exact `grammar` string passed to `new model.KaldiRecognizer(sampleRate, grammar)` — a JSON array, per Vosk's own documented grammar API. */
export function buildVoskGrammarString(phrases: readonly string[] = VOSK_PROTOTYPE_GRAMMAR_PHRASES): string {
  return JSON.stringify(phrases);
}

/** The model's own native sample rate — `vosk-model-small-en-us-0.15`, like every standard Vosk acoustic model, is trained at 16kHz. `acceptWaveformFloat`'s own second argument tells the engine what rate the CALLER's audio actually is at, so it can resample internally — the recognizer itself is always created for this fixed rate. */
export const VOSK_MODEL_SAMPLE_RATE = 16000;

export function resolveDefaultVoskModelUrl(env: Record<string, string | undefined>): string {
  return env.NEXT_PUBLIC_VOSK_MODEL_URL || "/vosk-lab/vosk-model-small-en-us-0.15.tar.gz";
}

const DEFAULT_VOSK_MODEL_URL = resolveDefaultVoskModelUrl({ NEXT_PUBLIC_VOSK_MODEL_URL: process.env.NEXT_PUBLIC_VOSK_MODEL_URL });

interface VoskFeatureDetection {
  webAssembly: boolean;
  audioWorklet: boolean;
  getUserMedia: boolean;
}

export function detectVoskSupport(env: { hasWebAssembly: boolean; hasAudioWorkletNode: boolean; hasGetUserMedia: boolean }): VoskFeatureDetection {
  return { webAssembly: env.hasWebAssembly, audioWorklet: env.hasAudioWorkletNode, getUserMedia: env.hasGetUserMedia };
}

function detectAmbientVoskSupport(): VoskFeatureDetection {
  if (typeof window === "undefined") return { webAssembly: false, audioWorklet: false, getUserMedia: false };
  return detectVoskSupport({
    hasWebAssembly: typeof WebAssembly !== "undefined",
    hasAudioWorkletNode: typeof window.AudioWorkletNode !== "undefined",
    hasGetUserMedia: typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function",
  });
}

/** Identical pattern to every other provider's start-error classification. */
export function classifyVoskStartError(message: string): string {
  if (/404|failed to load|NetworkError/i.test(message)) return `assets-not-found: ${message}`;
  if (/NotAllowedError|Permission denied/i.test(message)) return `mic-permission-denied: ${message}`;
  return message;
}

/**
 * AUDIO PIPELINE READINESS, 2026-08-22 (v0.2.1) — real iPhone field finding.
 * See this module's own createVoskProvider doc comment for the full
 * investigation. Bounds how long `start()` waits for a genuine first audio
 * chunk (from the AudioWorkletProcessor, which fires continuously — silence
 * included — the instant it's truly connected and the AudioContext is
 * running) before treating the pipeline as broken. Generous: real devices
 * (especially a cold first-ever `audioWorklet.addModule()` compile/register
 * on mobile Safari) can be meaningfully slower than desktop Chrome.
 */
export const VOSK_AUDIO_STARTUP_TIMEOUT_MS = 5000;

export const VOSK_AUDIO_PIPELINE_TIMEOUT_MESSAGE =
  "audio-pipeline-timeout: no microphone audio was received within the startup window — check microphone permissions/hardware, or try again";

/**
 * FINALIZATION DRAIN, 2026-08-22 (v0.2.1) — mirrors sherpaOnnxProvider.ts's
 * own already-fixed, identical-class defect ("SHERPA MIC HARNESS BUG" —
 * see docs/EYEONPIT_ROADMAP.md): audio already captured by the
 * AudioWorkletProcessor's own render thread but not yet delivered to the
 * main thread via `port.postMessage` at the exact instant End Phrase is
 * clicked would otherwise be silently dropped, because `stop()` used to
 * tear the whole pipeline down (worklet disconnect, tracks stopped,
 * AudioContext closed) in the SAME synchronous tick it asked the recognizer
 * for a final result. This bounds a short wait, giving one more worklet
 * message time to arrive and be forwarded to `acceptWaveformFloat()`
 * before finalization is requested.
 */
export const VOSK_AUDIO_DRAIN_MS = 80;

/** Bounds the wait for `retrieveFinalResult()`'s own asynchronous reply (see its own doc comment: it only POSTS a message) — never hangs stop() forever if the worker never replies. */
export const VOSK_FINAL_RESULT_TIMEOUT_MS = 1500;

const INLINE_WORKLET_SOURCE = `
class VoskCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      this.port.postMessage(input[0].slice(0));
    }
    return true;
  }
}
registerProcessor('vosk-capture-processor', VoskCaptureProcessor);
`;

// MODULE SCOPE — the ~39MB model is loaded once per page load and reused
// across every phrase/session, same discipline as Sherpa's moduleLoadPromise
// and Whisper's iframe session (see those files' own doc comments on why
// re-fetching a large model per phrase would be a real regression).
let modelLoadPromise: Promise<Model> | null = null;

async function loadModel(modelUrl: string): Promise<Model> {
  if (!modelLoadPromise) {
    modelLoadPromise = (async () => {
      // Dynamic import (not a static one) keeps this Worker/Blob-using
      // package out of any server-rendered code path — see this module's
      // own doc comment on why loadModel() is only ever invoked from
      // start(), which itself only ever runs client-side.
      const voskBrowser = await import("vosk-browser");
      const model = await voskBrowser.createModel(modelUrl);
      return model;
    })().catch((err) => {
      // A failed load must not be cached permanently — see
      // discardSessionOnFailure's counterpart in whisperCppProvider.ts: a
      // transient failure (network blip, cold CDN) would otherwise wedge
      // every later phrase in this page load behind the same dead promise.
      modelLoadPromise = null;
      throw err;
    });
  }
  return modelLoadPromise;
}

/** TEST-ONLY — mirrors __resetWhisperSessionForTests/module-scope resets in the other providers; never called from production code. */
export function __resetVoskModelForTests(): void {
  modelLoadPromise = null;
}

/**
 * Real, per-phrase instrumentation — see this module's own PHRASE
 * DIAGNOSTICS and AUDIO PIPELINE READINESS doc comments. Diagnostic-only:
 * never consulted by any parsing/dispatch/safety decision. Every `*Ms`
 * field is ELAPSED milliseconds since `start()` was invoked for this
 * phrase (a comparable relative number — not tied to any absolute clock),
 * `null` when that milestone never happened this phrase.
 */
export interface VoskPhraseDiagnostics {
  /** Count of real AudioWorklet chunks actually forwarded to `acceptWaveformFloat` this phrase — zero means the capture pipeline never fed the recognizer any audio at all (a mic/pipeline issue, not acoustic/grammar). */
  audioChunksReceived: number;
  /** How many "partialresult" events the recognizer emitted this phrase. Zero, with audioChunksReceived > 0, is real evidence the decoder never produced ANY hypothesis for what was spoken. */
  partialResultCount: number;
  /** The last (possibly empty) partial text seen before the final result — null if no partial ever arrived. */
  lastPartialText: string | null;
  /** "endpointer" — Vosk's own internal endpoint detector produced the final spontaneously, before End Phrase was clicked. "forced" — this provider's own `retrieveFinalResult()` call (on End Phrase) produced it. "never" — no final result arrived at all this phrase (should not happen in normal operation; recorded defensively). */
  finalizedBy: "endpointer" | "forced" | "never";
  /** Elapsed ms until `getUserMedia()` resolved. */
  micReadyMs: number | null;
  /** The AudioContext's `state` immediately after construction, BEFORE any `resume()` call — real evidence of the iOS Safari "starts suspended" behavior when it isn't `"running"`. */
  audioContextStateAtStart: AudioContextState | null;
  /** Elapsed ms until the AudioContext was confirmed `"running"` (immediately, or after an explicit `resume()`). */
  audioContextRunningMs: number | null;
  /** Elapsed ms until the AudioWorklet module was registered and the capture graph connected. */
  workletReadyMs: number | null;
  /** Elapsed ms until the KaldiRecognizer was constructed (independent of mic/audio setup — this happens first). */
  recognizerReadyMs: number | null;
  /** Elapsed ms until the FIRST real audio chunk arrived from the worklet — the actual "audio is flowing" confirmation this module's own readiness handshake waits for. */
  firstAudioChunkMs: number | null;
  /** Whether ANY received chunk this phrase contained a non-zero sample — distinguishes "real audio (even just room noise) reached the recognizer" from "chunks arrived but every sample was literal digital silence" (e.g. a muted/disconnected input). */
  nonZeroAudioObserved: boolean;
  /** Elapsed ms until the first chunk with a non-zero sample, when `nonZeroAudioObserved`. */
  firstNonZeroAudioChunkMs: number | null;
  /** Elapsed ms until the first "partialresult" event. */
  firstPartialMs: number | null;
  /** Elapsed ms until `stop()` (End Phrase) was called. */
  endPhrasePressedMs: number | null;
  /** Real measured duration of the post-End-Phrase finalization drain (see VOSK_AUDIO_DRAIN_MS) — null when no drain was needed (a result had already arrived before End Phrase). */
  drainDurationMs: number | null;
  /** True when the AUDIO PIPELINE READINESS timeout fired — zero audio ever arrived within VOSK_AUDIO_STARTUP_TIMEOUT_MS, surfaced as an explicit onError rather than a silent empty phrase. */
  startupTimedOut: boolean;
}

export interface VoskProviderOptions extends SpeechProviderOptions {
  /** Overrides the default same-origin model URL. Defaults to `resolveDefaultVoskModelUrl(process.env)`. */
  voskModelUrl?: string;
  /** Overrides the default 7-phrase-plus-`[unk]` grammar constraint. Defaults to `VOSK_PROTOTYPE_GRAMMAR_PHRASES`. Exposed for tests exercising an unconstrained/different-grammar comparison — production Lab usage always uses the default. */
  grammarPhrases?: readonly string[];
  /** Real per-phrase diagnostics — see VoskPhraseDiagnostics's own doc comment. Fires once, from inside the "result" handler, whenever a final result (spontaneous or forced) is actually produced. Optional; diagnostic-only. */
  onPhraseDiagnostics?: (diagnostics: VoskPhraseDiagnostics) => void;
}

/**
 * Real, working provider against `vosk-browser`'s real API. START PHRASE /
 * END PHRASE MAPPING: `start()` ensures the shared model is loaded (first
 * call only), creates a FRESH `KaldiRecognizer` for this phrase (cheap —
 * multiple recognizers may share one loaded model, per the package's own
 * doc comment), constrained to `VOSK_PROTOTYPE_GRAMMAR_PHRASES`, then begins
 * mic capture. `stop()` calls `retrieveFinalResult()`, which the engine
 * replies to with exactly one more "result" event carrying whatever was
 * decoded so far — mirrors this app's existing caller-driven-finalization
 * discipline (SHERPA MIC HARNESS BUG note: "Do not depend on automatic
 * silence detection yet").
 *
 * DISCLOSED LIMITATION: Vosk's own internal endpointer can ALSO fire a
 * spontaneous "result" event mid-phrase (e.g. on a natural pause between
 * "dealer has a five" spoken slowly) — `vosk-browser`'s exposed API has no
 * option to disable this (confirmed from its shipped `.d.ts`: `set`'s only
 * documented keys are `"words"` and `"logLevel"`, no endpoint/VAD toggle).
 * When that happens, this provider treats it as the phrase's real final
 * result (`resultReceivedThisPhrase`), exactly like whisperCppProvider.ts's
 * own VAD-may-fire-early handling — never silently dropped, never double-
 * counted as two results for one spoken phrase.
 *
 * ============================================================
 * PHRASE DIAGNOSTICS, 2026-08-21 (follow-up) — real-mic "Dealer has a
 * five" investigation
 * ============================================================
 * A real Sidney mic session found "Dealer has a king" recognized
 * correctly but "Dealer has a five" produced NO transcript at all (not a
 * misrecognition — genuinely empty). Investigated directly:
 *   - Both "five" and "king" ARE present in the committed model's compiled
 *     grammar FST (verified by scanning `public/vosk-lab/`'s extracted
 *     `graph/Gr.fst` for length-prefixed OpenFST symbol-table entries —
 *     each word appears twice, once per symbol table, identically) — a
 *     missing-vocabulary-word explanation is RULED OUT, not assumed.
 *   - Neither word occupies a different grammatical slot ("has a
 *     <rank>" — same position in both phrases) — sentence-position is
 *     RULED OUT too.
 *   - No prior EyeOnPit ASR round (Chrome, Sherpa, Whisper — see
 *     docs/EYEONPIT_NATIVE_VOICE_SPEC.md §1.3/§1.4) has ever flagged
 *     "five" as a problem word; every documented confusion is about
 *     "dealer" itself or connector words. This makes a genuinely small-
 *     model/one-session acoustic or endpointing issue (not a
 *     structurally hard word) the more likely explanation.
 *   - This environment has no live microphone and the Lab never retains
 *     raw audio (by design — see the OFFLINE/privacy requirements), so
 *     the exact original utterance cannot be replayed to confirm which of
 *     "the recognizer never even produced a partial hypothesis" vs "the
 *     endpointer cut the utterance off before 'five' was captured" is the
 *     real cause. Per explicit instruction, NO fuzzy-matching/guessing was
 *     added to paper over this — a missed phrase is an acceptable outcome
 *     (REPEAT/no-event) under this app's own hard safety gate.
 *
 * What WAS added: `onPhraseDiagnostics`, real per-phrase instrumentation
 * (audio chunks actually forwarded to the recognizer, partial-result count
 * and the last partial text seen, and whether the eventual final result
 * came from Vosk's own spontaneous endpointer or this provider's forced
 * `retrieveFinalResult()`) — reported from inside the "result" handler
 * itself (not synchronously after calling `retrieveFinalResult()`, which
 * only POSTS a message to the worker; the actual result arrives later,
 * asynchronously). This turns the NEXT occurrence of this failure from "no
 * transcript, no further evidence" into a real, inspectable trace: zero
 * partials + audio chunks received points to a genuine acoustic/decoding
 * miss; a non-empty `lastPartialText` with `finalizedBy: "endpointer"`
 * would instead point to premature endpoint cutoff. Exposed in the Lab's
 * Result panel and JSON export, never used to change dispatch/safety
 * behavior.
 *
 * ============================================================
 * AUDIO PIPELINE READINESS, 2026-08-22 (v0.2.1) — real iPhone Quick Test
 * ============================================================
 * Sidney's first real iPhone export showed "Dealer has a five" (the FIRST
 * phrase spoken in that session) with `audioChunksReceived: 0,
 * partialResultCount: 0, finalizedBy: "never"` — the recognizer never
 * received ANY audio at all, not a misrecognition. Sidney separately
 * confirmed Mic Check (which never uses AudioWorklet — see micCheck.ts,
 * untouched this round) works correctly on the same device, meaning
 * microphone hardware/permission is not the problem — something specific
 * to THIS provider's own audio pipeline is.
 *
 * PROVEN BY READING THIS FILE'S OWN PRIOR CONTROL FLOW (not a guess): the
 * previous version called `options.onAudioStart?.()` — which the Lab page
 * maps directly to the "listening" / SPEAK NOW status the operator sees —
 * BEFORE requesting microphone permission, constructing the AudioContext,
 * or registering the AudioWorklet processor. That is a structural race:
 * the operator could be told to speak while `getUserMedia()`,
 * `audioWorklet.addModule()` (a real async module compile/register step
 * Mic Check's simpler AnalyserNode-only pipeline never needs at all — the
 * one concrete architectural difference from the working Mic Check path),
 * and `source.connect()` were still in flight. On a real device, especially
 * a COLD first-ever worklet compile, this chain can plausibly take long
 * enough that a short phrase is spoken and finished before capture ever
 * truly begins — a full zero, not a partial capture, exactly matching the
 * real symptom. The EXACT reason the chain was slow enough to matter on
 * that specific device/session (cold JIT vs. worklet compile vs. an iOS-
 * specific quirk) is NOT independently provable from here; the race itself,
 * proven by this file's own prior code, is sufficient to cause exactly this
 * failure and is what this fix closes.
 *
 * THE FIX: `onAudioStart` now fires ONLY on the first real audio chunk
 * delivered by the worklet — never merely because setup promises resolved.
 * A bounded readiness timeout (`VOSK_AUDIO_STARTUP_TIMEOUT_MS`) surfaces an
 * explicit, diagnosable `onError` if zero audio ever arrives, instead of a
 * silent empty phrase with the operator having already been told to speak.
 * The AudioContext is also now explicitly checked/`resume()`d if it isn't
 * already `"running"` (a real, documented iOS Safari behavior — recorded in
 * `audioContextStateAtStart` for direct evidence on the next real session,
 * not assumed to be the cause here).
 *
 * ============================================================
 * FINALIZATION DRAIN, 2026-08-22 (v0.2.1) — real iPhone Quick Test, trailing
 * word loss
 * ============================================================
 * The same session found `"Player three hits."` transcribed as `"player
 * three"` — EyeOnPit safely resolved that to `SELECT_TARGET(seat 3)`,
 * `wouldProduceCardEvent: false` (correct, must remain — see
 * classifyNativeVoiceTranscript's own safety rule: an incomplete/uncertain
 * recognition must never be upgraded into a guessed action). Investigated:
 * "hits" IS present and reachable in the Quick grammar (confirmed directly
 * — `"player three hits"` is one of the seven literal grammar phrases).
 * The runtime-compiled FST graph Vosk builds internally from that grammar
 * array is not independently inspectable from here (compiled inside the
 * WASM engine) — disclosed, not glossed over.
 *
 * A REAL, PROVEN CODE DEFECT WAS FOUND: the previous `stop()` called
 * `recognizer.remove()` and tore down the entire audio pipeline
 * (`teardownAudio()` — worklet disconnected, mic tracks stopped,
 * AudioContext closed) SYNCHRONOUSLY, in the SAME tick as
 * `retrieveFinalResult()` — which itself only POSTS a message; it doesn't
 * wait for a reply. Any audio already captured by the
 * AudioWorkletProcessor's own render thread but not yet delivered to the
 * main thread via `port.postMessage` at the exact instant End Phrase was
 * clicked would be silently lost — the EXACT SAME defect class already
 * found and fixed for Sherpa in this codebase's own history (see
 * docs/EYEONPIT_ROADMAP.md's "SHERPA MIC HARNESS BUG" entry: "audio already
 * captured... but not yet delivered... was silently dropped before
 * finalization... fixed with a finalization DRAIN"). Whether this
 * mechanism is what dropped "hits" in Sidney's specific session, versus
 * Vosk's own internal endpointer finalizing early (a separate, already-
 * disclosed limitation — see DISCLOSED LIMITATION above — that a drain
 * cannot fix, since Vosk would have already committed to its own decision
 * internally), is NOT provable without that phrase's own diagnostics
 * (Sidney's report didn't include them for this specific utterance). Both
 * are now directly distinguishable on the next real session via
 * `drainDurationMs` (drain ran) and `finalizedBy` (which mechanism actually
 * produced the final).
 *
 * THE FIX: `stop()` now drains for `VOSK_AUDIO_DRAIN_MS` before forcing
 * finalization (skipped entirely when a result already arrived
 * spontaneously — nothing to drain for), re-checks for a spontaneous result
 * having arrived DURING the drain, and awaits the forced result's own
 * asynchronous reply (bounded by `VOSK_FINAL_RESULT_TIMEOUT_MS`) BEFORE
 * tearing down the recognizer/audio pipeline — never again in the same
 * synchronous tick as the request. Purely additive ordering, exactly like
 * Sherpa's own fix: never promotes a partial to final, never guesses a
 * missing word — see the hard SAFETY INVARIANT: "player three" alone must
 * remain `SELECT_TARGET`, never a manufactured hit, unless the recognizer
 * itself actually supplies "hits" — enforced entirely by the existing,
 * unmodified `classifyVoiceTranscript`/`parseNarration` INERT_ACTION_WORDS
 * design (§1.2 of the spec), not by anything in this file.
 */
export function createVoskProvider(options: VoskProviderOptions): SpeechProvider {
  const modelUrl = options.voskModelUrl ?? DEFAULT_VOSK_MODEL_URL;
  const grammarPhrases = options.grammarPhrases ?? VOSK_PROTOTYPE_GRAMMAR_PHRASES;
  const detection = detectAmbientVoskSupport();
  const supported = detection.webAssembly && detection.audioWorklet && detection.getUserMedia;

  let recognizer: KaldiRecognizer | null = null;
  let audioContext: AudioContext | null = null;
  let mediaStream: MediaStream | null = null;
  let workletNode: AudioWorkletNode | null = null;
  let running = false;
  let suppressed = false;
  let resultReceivedThisPhrase = false;
  // PHRASE DIAGNOSTICS state — see this module's own doc comment. Reset at
  // the top of every start(), reported exactly once (from the "result"
  // handler, the startup-timeout failure path, or after stop()'s own
  // bounded wait for a forced final result) per phrase.
  let audioChunksReceived = 0;
  let partialResultCount = 0;
  let lastPartialText: string | null = null;
  let finalizedBy: VoskPhraseDiagnostics["finalizedBy"] = "never";
  let forcingFinal = false;
  let diagnosticsReportedThisPhrase = false;
  let startPhrasePressedAtMs = 0; // performance.now() reference point — every *Ms diagnostic field below is elapsed time since this
  let micReadyMs: number | null = null;
  let audioContextStateAtStart: AudioContextState | null = null;
  let audioContextRunningMs: number | null = null;
  let workletReadyMs: number | null = null;
  let recognizerReadyMs: number | null = null;
  let firstAudioChunkMs: number | null = null;
  let nonZeroAudioObserved = false;
  let firstNonZeroAudioChunkMs: number | null = null;
  let firstPartialMs: number | null = null;
  let endPhrasePressedMs: number | null = null;
  let drainDurationMs: number | null = null;
  let startupTimedOut = false;
  let startupTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let audioStartFired = false;
  let pendingFinalResolve: (() => void) | null = null;

  const elapsedMs = () => performance.now() - startPhrasePressedAtMs;

  function clearStartupTimeout() {
    if (startupTimeoutHandle != null) {
      clearTimeout(startupTimeoutHandle);
      startupTimeoutHandle = null;
    }
  }

  function emitResult(text: string, isFinal: boolean, cb?: (r: SpeechProviderResult) => void) {
    if (!text) return;
    cb?.({ transcript: text, confidence: null, isFinal, alternatives: [{ transcript: text, confidence: null }] });
  }

  function reportDiagnosticsOnce() {
    if (diagnosticsReportedThisPhrase) return;
    diagnosticsReportedThisPhrase = true;
    options.onPhraseDiagnostics?.({
      audioChunksReceived,
      partialResultCount,
      lastPartialText,
      finalizedBy,
      micReadyMs,
      audioContextStateAtStart,
      audioContextRunningMs,
      workletReadyMs,
      recognizerReadyMs,
      firstAudioChunkMs,
      nonZeroAudioObserved,
      firstNonZeroAudioChunkMs,
      firstPartialMs,
      endPhrasePressedMs,
      drainDurationMs,
      startupTimedOut,
    });
  }

  function teardownAudio() {
    workletNode?.port.close();
    workletNode?.disconnect();
    workletNode = null;
    mediaStream?.getTracks().forEach((t) => t.stop());
    mediaStream = null;
    audioContext?.close().catch(() => {});
    audioContext = null;
  }

  async function start(): Promise<void> {
    if (!supported) {
      options.onError?.("unsupported");
      return;
    }
    if (running) return;
    running = true;
    startPhrasePressedAtMs = performance.now();
    resultReceivedThisPhrase = false;
    audioChunksReceived = 0;
    partialResultCount = 0;
    lastPartialText = null;
    finalizedBy = "never";
    forcingFinal = false;
    diagnosticsReportedThisPhrase = false;
    micReadyMs = null;
    audioContextStateAtStart = null;
    audioContextRunningMs = null;
    workletReadyMs = null;
    recognizerReadyMs = null;
    firstAudioChunkMs = null;
    nonZeroAudioObserved = false;
    firstNonZeroAudioChunkMs = null;
    firstPartialMs = null;
    endPhrasePressedMs = null;
    drainDurationMs = null;
    startupTimedOut = false;
    audioStartFired = false;
    clearStartupTimeout();
    try {
      const model = await loadModel(modelUrl);
      recognizer = new model.KaldiRecognizer(VOSK_MODEL_SAMPLE_RATE, buildVoskGrammarString(grammarPhrases));
      recognizerReadyMs = elapsedMs();
      recognizer.setWords(true);
      recognizer.on("result", (message) => {
        if (suppressed || message.event !== "result") return;
        if (!resultReceivedThisPhrase) finalizedBy = forcingFinal ? "forced" : "endpointer";
        resultReceivedThisPhrase = true;
        emitResult(message.result.text, true, options.onFinalResult);
        pendingFinalResolve?.();
        pendingFinalResolve = null;
        reportDiagnosticsOnce();
      });
      recognizer.on("partialresult", (message) => {
        if (suppressed || message.event !== "partialresult") return;
        partialResultCount++;
        lastPartialText = message.result.partial;
        if (firstPartialMs == null) firstPartialMs = elapsedMs();
        emitResult(message.result.partial, false, options.onInterimResult);
      });
      recognizer.on("error", (message) => {
        if (message.event !== "error") return;
        options.onError?.(message.error);
      });

      // NOTE: onAudioStart deliberately does NOT fire here anymore — see
      // this module's own AUDIO PIPELINE READINESS doc comment. It fires
      // below, only once a real audio chunk is confirmed delivered.
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micReadyMs = elapsedMs();

      audioContext = new AudioContext();
      audioContextStateAtStart = audioContext.state;
      if (audioContext.state !== "running") {
        // Real, documented iOS Safari behavior: a freshly constructed
        // AudioContext can start "suspended" until explicitly resumed —
        // see this module's own doc comment. Never assumed to be THE
        // cause without direct evidence; recorded either way.
        await audioContext.resume().catch(() => {});
      }
      audioContextRunningMs = elapsedMs();

      const workletBlobUrl = URL.createObjectURL(new Blob([INLINE_WORKLET_SOURCE], { type: "application/javascript" }));
      await audioContext.audioWorklet.addModule(workletBlobUrl);
      URL.revokeObjectURL(workletBlobUrl);

      const source = audioContext.createMediaStreamSource(mediaStream);
      workletNode = new AudioWorkletNode(audioContext, "vosk-capture-processor");
      workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (suppressed || !recognizer) return;
        const nowMs = elapsedMs();
        if (firstAudioChunkMs == null) {
          firstAudioChunkMs = nowMs;
          clearStartupTimeout();
          // THE READINESS HANDSHAKE: only now — with a real audio chunk
          // actually in hand — do we tell the caller (and, through it, the
          // operator-facing UI) that audio capture has begun. Never
          // earlier, regardless of how long setup took.
          if (!audioStartFired) {
            audioStartFired = true;
            options.onAudioStart?.();
          }
          options.onSpeechStart?.();
        }
        if (!nonZeroAudioObserved) {
          const data = event.data;
          for (let i = 0; i < data.length; i++) {
            if (data[i] !== 0) {
              nonZeroAudioObserved = true;
              firstNonZeroAudioChunkMs = nowMs;
              break;
            }
          }
        }
        audioChunksReceived++;
        recognizer.acceptWaveformFloat(event.data, audioContext!.sampleRate);
      };
      source.connect(workletNode);
      workletReadyMs = elapsedMs();

      // AUDIO PIPELINE READINESS timeout — see this module's own doc
      // comment. An AudioWorkletProcessor's process() fires continuously
      // (silence included) the instant it's truly connected and running;
      // zero chunks within this window is real evidence the pipeline never
      // came alive, not merely "the operator hasn't spoken yet."
      startupTimeoutHandle = setTimeout(() => {
        startupTimeoutHandle = null;
        if (audioChunksReceived > 0) return; // real audio already flowing
        startupTimedOut = true;
        reportDiagnosticsOnce();
        running = false;
        recognizer?.remove();
        recognizer = null;
        teardownAudio();
        options.onError?.(VOSK_AUDIO_PIPELINE_TIMEOUT_MESSAGE);
      }, VOSK_AUDIO_STARTUP_TIMEOUT_MS);
    } catch (err) {
      running = false;
      clearStartupTimeout();
      recognizer?.remove();
      recognizer = null;
      teardownAudio();
      const message = err instanceof Error ? err.message : String(err);
      options.onError?.(classifyVoskStartError(message));
    }
  }

  async function stop(): Promise<void> {
    if (!running) return;
    running = false;
    clearStartupTimeout();
    endPhrasePressedMs = elapsedMs();
    options.onSpeechEnd?.();

    if (recognizer && !resultReceivedThisPhrase) {
      // FINALIZATION DRAIN — see this module's own doc comment. Gives any
      // audio already captured by the AudioWorkletProcessor's render
      // thread, but not yet delivered to the main thread via
      // port.postMessage at the exact instant End Phrase was clicked, time
      // to arrive and be forwarded to acceptWaveformFloat() BEFORE
      // finalization is requested — never skipped when a result already
      // arrived spontaneously (nothing left to drain for).
      const drainStart = performance.now();
      await new Promise<void>((resolve) => setTimeout(resolve, VOSK_AUDIO_DRAIN_MS));
      drainDurationMs = performance.now() - drainStart;

      // A spontaneous endpointer result may have arrived DURING the drain
      // — re-check before forcing, never double-finalize.
      if (recognizer && !resultReceivedThisPhrase) {
        // A recognizer that received zero speech (e.g. a phrase skipped
        // without speaking) legitimately produces an empty-text "result",
        // which emitResult above never forwards to onFinalResult (matches
        // EMPTY_TRANSCRIPT handling everywhere else in this app — see
        // classifyVoiceTranscript). `retrieveFinalResult()` only POSTS a
        // message to the worker — awaited below (bounded) so the
        // recognizer is never torn down while that request is still in
        // flight, unlike the previous version.
        forcingFinal = true;
        const finalArrived = new Promise<void>((resolve) => {
          pendingFinalResolve = resolve;
        });
        recognizer.retrieveFinalResult();
        await Promise.race([finalArrived, new Promise<void>((resolve) => setTimeout(resolve, VOSK_FINAL_RESULT_TIMEOUT_MS))]);
        pendingFinalResolve = null;
      }
    }
    reportDiagnosticsOnce(); // no-op if the "result" handler already reported (guarded)
    recognizer?.remove();
    recognizer = null;
    teardownAudio();
    options.onAudioEnd?.();
  }

  return {
    providerId: VOSK_PROVIDER_ID,
    supported,
    start,
    stop,
    // Mirrors every other provider's self-hearing protection — EyeOnPit's
    // own spoken confirmations must never be re-transcribed as if the
    // operator said them. `suppressed` gates BOTH result callbacks above
    // AND the audio-forwarding callback, so audio captured while suppressed
    // is neither transcribed nor fed to the recognizer at all.
    suppressForSpeech() {
      suppressed = true;
    },
    resumeAfterSpeech() {
      suppressed = false;
    },
  };
}

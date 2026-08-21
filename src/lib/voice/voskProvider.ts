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

export interface VoskProviderOptions extends SpeechProviderOptions {
  /** Overrides the default same-origin model URL. Defaults to `resolveDefaultVoskModelUrl(process.env)`. */
  voskModelUrl?: string;
  /** Overrides the default 7-phrase-plus-`[unk]` grammar constraint. Defaults to `VOSK_PROTOTYPE_GRAMMAR_PHRASES`. Exposed for tests exercising an unconstrained/different-grammar comparison — production Lab usage always uses the default. */
  grammarPhrases?: readonly string[];
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

  function emitResult(text: string, isFinal: boolean, cb?: (r: SpeechProviderResult) => void) {
    if (!text) return;
    cb?.({ transcript: text, confidence: null, isFinal, alternatives: [{ transcript: text, confidence: null }] });
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
    resultReceivedThisPhrase = false;
    try {
      const model = await loadModel(modelUrl);
      recognizer = new model.KaldiRecognizer(VOSK_MODEL_SAMPLE_RATE, buildVoskGrammarString(grammarPhrases));
      recognizer.setWords(true);
      recognizer.on("result", (message) => {
        if (suppressed || message.event !== "result") return;
        resultReceivedThisPhrase = true;
        emitResult(message.result.text, true, options.onFinalResult);
      });
      recognizer.on("partialresult", (message) => {
        if (suppressed || message.event !== "partialresult") return;
        emitResult(message.result.partial, false, options.onInterimResult);
      });
      recognizer.on("error", (message) => {
        if (message.event !== "error") return;
        options.onError?.(message.error);
      });

      options.onAudioStart?.();
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext = new AudioContext();
      const workletBlobUrl = URL.createObjectURL(new Blob([INLINE_WORKLET_SOURCE], { type: "application/javascript" }));
      await audioContext.audioWorklet.addModule(workletBlobUrl);
      URL.revokeObjectURL(workletBlobUrl);

      const source = audioContext.createMediaStreamSource(mediaStream);
      workletNode = new AudioWorkletNode(audioContext, "vosk-capture-processor");
      let spokeThisSession = false;
      workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (suppressed || !recognizer) return;
        if (!spokeThisSession) {
          spokeThisSession = true;
          options.onSpeechStart?.();
        }
        recognizer.acceptWaveformFloat(event.data, audioContext!.sampleRate);
      };
      source.connect(workletNode);
    } catch (err) {
      running = false;
      recognizer?.remove();
      recognizer = null;
      teardownAudio();
      const message = err instanceof Error ? err.message : String(err);
      options.onError?.(classifyVoskStartError(message));
    }
  }

  function stop(): void {
    if (!running) return;
    running = false;
    options.onSpeechEnd?.();
    if (recognizer && !resultReceivedThisPhrase) {
      // Force a final result from whatever was decoded so far — see this
      // module's own DISCLOSED LIMITATION doc comment. A recognizer that
      // received zero speech (e.g. a phrase skipped without speaking)
      // legitimately produces an empty-text "result", which emitResult
      // above never forwards to onFinalResult (matches EMPTY_TRANSCRIPT
      // handling everywhere else in this app — see classifyVoiceTranscript).
      recognizer.retrieveFinalResult();
    }
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

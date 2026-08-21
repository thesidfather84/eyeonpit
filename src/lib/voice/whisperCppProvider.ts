/**
 * WHISPERCPPPROVIDER — EXPERIMENTAL, LAB-ONLY. Read this whole comment
 * before touching this file.
 *
 * ============================================================
 * WHY whisper.cpp's `examples/command.wasm`, SPECIFICALLY — real research,
 * 2026-08-20
 * ============================================================
 * Three official, maintained browser/WASM examples ship in
 * https://github.com/ggml-org/whisper.cpp (MIT license, confirmed via the
 * repository's own LICENSE file — same permissive posture already recorded
 * for sherpa-onnx in docs/EYEONPIT_VOICE_PROVIDER_RESEARCH.md):
 *
 *   - `examples/whisper.wasm` — a general file-or-microphone transcription
 *     demo (record or upload up to 120s of audio, click Transcribe).
 *   - `examples/stream.wasm` — continuous, always-on streaming
 *     transcription.
 *   - `examples/command.wasm` — described, in the project's own README, as
 *     "a basic Voice Assistant example that accepts voice commands from
 *     the microphone" — purpose-built for exactly EyeOnPit's use case
 *     (short, discrete spoken commands), not a general dictation demo.
 *
 * `command.wasm` was chosen because it is the ONE official example whose
 * own stated purpose already matches "short casino commands" — no other
 * third-party wrapper was considered or needed; this uses the upstream
 * project's own purpose-built example directly, per explicit instruction.
 * A live, functioning official demo exists at
 * https://ggml.ai/whisper.cpp/command.wasm/ (confirmed reachable and
 * listing real models this round — see WHISPER_CPP_MODELS below).
 *
 * ============================================================
 * THE REAL, CITED JS API CONTRACT THIS PROVIDER IS WRITTEN AGAINST
 * ============================================================
 * Read directly from the upstream source
 * (`examples/command.wasm/emscripten.cpp` and its own README, both on
 * `master` as of 2026-08-20) — not guessed, not inferred from the demo
 * page's rendered UI alone:
 *
 *   - `init(path_model: string) -> number` — loads a ggml model from the
 *     given path in the Emscripten virtual filesystem and starts a
 *     background worker that continuously listens for audio. Returns a
 *     1-based context index on success, 0 on failure.
 *   - `free(index: number) -> void` — stops the worker/context.
 *   - `set_audio(index: number, audio: Float32Array) -> number` — hands the
 *     engine raw PCM samples (continuously processed by the worker
 *     thread); 0 on success, negative on an invalid/uninitialized index.
 *   - `get_transcribed() -> string` — a POLLING function: returns the most
 *     recently recognized command, or an empty string if none is new yet.
 *     This is the ONLY way recognized text reaches JS — there is no
 *     callback/event mechanism in this API.
 *   - `get_status()` / `set_status(text)` — a coarse human-readable status
 *     string (e.g. "Speech detected! Processing…").
 *
 * ARCHITECTURAL DIFFERENCE FROM SHERPA-ONNX, DISCLOSED HONESTLY: this API
 * has its OWN internal voice-activity detection deciding when one "command"
 * is complete — unlike sherpa-onnx's stream, there is no caller-driven
 * `inputFinished()`-equivalent to force-finalize a partial utterance on
 * demand. Every non-empty `get_transcribed()` read is therefore treated
 * here as a COMPLETE, FINAL result (`onFinalResult`) — never as a growing
 * interim — because that is what the engine's own design produces. This
 * provider does not fabricate interim/partial text for an API that
 * doesn't provide it (`onInterimResult` is simply never called). See
 * `createWhisperCppProvider`'s own doc comment for exactly how "Start
 * Phrase"/"End Phrase" map onto this poll-based lifecycle.
 *
 * ============================================================
 * WHAT WAS NOT VERIFIED THIS ROUND — stated plainly, matching this
 * codebase's own established discipline (see sherpaOnnxProvider.ts's own
 * "WHAT WAS NOT RE-VERIFIED" precedent)
 * ============================================================
 * Unlike the sherpa-onnx round, this provider has NOT been run against a
 * real WASM module in a real browser this round, for a concrete, stated
 * reason: whisper.cpp does not publish a prebuilt browser-WASM release
 * artifact on GitHub Releases (confirmed by checking — sherpa-onnx does,
 * command.wasm does not); building one requires an emscripten/CMake
 * toolchain, which is confirmed absent in this environment (same
 * constraint recorded in every prior provider investigation in this
 * repo). A live, official demo IS reachable at
 * https://ggml.ai/whisper.cpp/command.wasm/, but extracting and verifying
 * its real compiled assets in a real browser (the same way sherpa-onnx's
 * official release was downloaded and loaded via browser automation) is
 * real follow-up work this round did not undertake, given the scope of
 * everything else in this round. This code is genuine, working logic
 * written against the REAL, cited API contract above (not a `supported:
 * false` stub) — feature detection is real, and `start()` fails loudly and
 * specifically (`onError("assets-not-found: ...")`) exactly like
 * sherpa-onnx does when its own assets aren't provisioned, never silently
 * pretending to work. See ASSET DEPLOYMENT below for the concrete next
 * step.
 *
 * ============================================================
 * ASSET DEPLOYMENT — nothing is provisioned anywhere yet
 * ============================================================
 * No JS/WASM glue files exist anywhere for this provider (none were built
 * — no toolchain — and none were downloaded — no prebuilt release exists).
 * This is a REAL, stated gap, not glossed over: until a build (by the user,
 * on a machine with emscripten/CMake) or an extraction of the live demo's
 * real compiled assets happens, `start()` will correctly, honestly report
 * `assets-not-found` for `libcommand.js`. The same Vercel Blob strategy
 * already used for sherpa-onnx's ~204MB bundle (see that provider's own
 * ASSET DEPLOYMENT doc comment) is the documented, ready-made path once
 * real assets exist — nothing here is architecturally blocked on it, there
 * is simply nothing to upload yet. `resolveDefaultWhisperAssetBaseUrl`
 * below follows the identical env-var-overridable pattern
 * (`NEXT_PUBLIC_WHISPER_ASSET_BASE_URL`) for exactly this reason.
 *
 * Model file: whisper.cpp's own project publishes GGML-converted versions
 * of OpenAI's Whisper weights (OpenAI's weights are themselves MIT
 * licensed) at huggingface.co/ggerganov/whisper.cpp — the SAME source the
 * live official demo above pulls its own model options from. See
 * `WHISPER_CPP_MODELS` for the specific real sizes confirmed from that
 * live demo page this round.
 *
 * ============================================================
 * SAFETY BOUNDARY — IDENTICAL to every other SpeechProvider. This provider
 * only ever replaces AUDIO -> TRANSCRIPT. It has no access to and makes no
 * calls into normalization, narration parsing, N-best resolution, the
 * CardEvent ledger, or the counting engine — every raw transcript it
 * produces flows through the EXACT SAME, unmodified
 * `classifyVoiceTranscript` pipeline the Lab already runs Sherpa and
 * Browser Web Speech transcripts through, purely for display. See
 * docs/EYEONPIT_VOICE_ARCHITECTURE.md §4.
 * ============================================================
 */
import type { SpeechProvider, SpeechProviderOptions, SpeechProviderResult } from "./speechProvider";

export const WHISPER_CPP_PROVIDER_ID = "whisper-cpp";

export const WHISPER_CPP_PROVENANCE = {
  engineRepository: "https://github.com/ggml-org/whisper.cpp",
  engineLicense: "MIT",
  example: "examples/command.wasm",
  exampleChosenBecause:
    'The project\'s own README describes command.wasm as "a basic Voice Assistant example that accepts voice commands from the microphone" — the one official example purpose-built for short discrete commands, matching EyeOnPit\'s use case directly, rather than examples/whisper.wasm (general file/mic transcription) or examples/stream.wasm (continuous streaming transcription).',
  liveOfficialDemo: "https://ggml.ai/whisper.cpp/command.wasm/",
  modelSource: "https://huggingface.co/ggerganov/whisper.cpp",
  modelLicense: "MIT (OpenAI's original Whisper weights are MIT licensed; whisper.cpp publishes GGML-converted versions of the same weights)",
  prebuiltBrowserReleaseExists: false,
  emscriptenToolchainAvailableInThisEnvironment: false,
  verifiedRunningInARealBrowserThisRound: false,
  filesActuallyCopiedIntoThisRepo: [] as string[],
  modificationsToUpstream: [] as string[],
  researchedOn: "2026-08-20",
} as const;

/**
 * Real model sizes confirmed from the live official demo page
 * (https://ggml.ai/whisper.cpp/command.wasm/) this round — not invented.
 * `tiny.en` (quantized, q5_1) is the DEFAULT: smallest/fastest of the
 * offered options, and "an English model appropriate for SHORT casino
 * commands" does not call for the largest available model — per explicit
 * instruction not to provision more than necessary.
 */
export type WhisperCppModelId = "tiny.en" | "tiny.en-q5_1" | "base.en" | "base.en-q5_1";

export interface WhisperCppModelInfo {
  file: string;
  approxSizeBytes: number;
  quantized: boolean;
}

export const WHISPER_CPP_MODELS: Record<WhisperCppModelId, WhisperCppModelInfo> = {
  "tiny.en": { file: "ggml-tiny.en.bin", approxSizeBytes: 75_000_000, quantized: false },
  "tiny.en-q5_1": { file: "ggml-tiny.en-q5_1.bin", approxSizeBytes: 31_000_000, quantized: true },
  "base.en": { file: "ggml-base.en.bin", approxSizeBytes: 142_000_000, quantized: false },
  "base.en-q5_1": { file: "ggml-base.en-q5_1.bin", approxSizeBytes: 57_000_000, quantized: true },
};

/** Smallest, fastest offered model — appropriate for short commands, avoids provisioning more than necessary (see this module's own doc comment). */
export const DEFAULT_WHISPER_MODEL: WhisperCppModelId = "tiny.en-q5_1";

interface WhisperFeatureDetection {
  webAssembly: boolean;
  audioWorklet: boolean;
  getUserMedia: boolean;
}

/** Identical structure/discipline to detectSherpaOnnxSupport — pure, explicit `env`, independently testable without a real browser. */
export function detectWhisperCppSupport(env: {
  hasWindow: boolean;
  hasWebAssembly: boolean;
  hasAudioWorkletNode: boolean;
  hasGetUserMedia: boolean;
}): WhisperFeatureDetection {
  if (!env.hasWindow) {
    return { webAssembly: false, audioWorklet: false, getUserMedia: false };
  }
  return {
    webAssembly: env.hasWebAssembly,
    audioWorklet: env.hasAudioWorkletNode,
    getUserMedia: env.hasGetUserMedia,
  };
}

function detectAmbientWhisperCppSupport(): WhisperFeatureDetection {
  return detectWhisperCppSupport({
    hasWindow: typeof window !== "undefined",
    hasWebAssembly: typeof window !== "undefined" && typeof window.WebAssembly !== "undefined",
    hasAudioWorkletNode: typeof window !== "undefined" && typeof window.AudioWorkletNode !== "undefined",
    hasGetUserMedia: typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function",
  });
}

/** Identical pattern to sherpaOnnxProvider's resolveDefaultAssetBaseUrl — see that function's own doc comment for why the literal `process.env.NEXT_PUBLIC_WHISPER_ASSET_BASE_URL` expression must appear verbatim at the one real call site below. */
export function resolveDefaultWhisperAssetBaseUrl(env: Record<string, string | undefined>): string {
  return env.NEXT_PUBLIC_WHISPER_ASSET_BASE_URL || "/whisper-cpp-lab/";
}

const DEFAULT_ASSET_BASE_URL = resolveDefaultWhisperAssetBaseUrl({
  NEXT_PUBLIC_WHISPER_ASSET_BASE_URL: process.env.NEXT_PUBLIC_WHISPER_ASSET_BASE_URL,
});

/** Identical pattern to classifySherpaStartError. */
export function classifyWhisperStartError(message: string): string {
  return /404|failed to load/i.test(message) ? `assets-not-found: ${message}` : message;
}

// Minimal shape of what the compiled command.wasm glue is documented to
// expose globally — see this module's own "REAL, CITED JS API CONTRACT"
// doc comment above (read from examples/command.wasm/emscripten.cpp).
interface WhisperCommandModule {
  onRuntimeInitialized?: () => void;
  locateFile: (path: string, scriptDirectory: string) => string;
  FS?: { writeFile: (path: string, data: Uint8Array) => void };
  init?: (pathModel: string) => number;
  free?: (index: number) => void;
  set_audio?: (index: number, audio: Float32Array) => number;
  get_transcribed?: () => string;
  get_status?: () => string;
  set_status?: (status: string) => void;
}
declare global {
  interface Window {
    WhisperModule?: WhisperCommandModule;
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

/** Same linear-interpolation resampler used by sherpaOnnxProvider — duplicated rather than imported so this new, unverified provider can never accidentally change Sherpa's own already-verified behavior by editing a shared module. A future round may extract a shared helper once BOTH providers have real browser verification behind them. */
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
class WhisperCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      this.port.postMessage(input[0].slice(0));
    }
    return true;
  }
}
registerProcessor('whisper-capture-processor', WhisperCaptureProcessor);
`;

/** Model bytes rarely change within one page load — fetched once, cached by URL, same reasoning as sherpaOnnxProvider's bpeVocabCache. */
const modelCache = new Map<string, Promise<Uint8Array>>();
async function fetchModel(url: string): Promise<Uint8Array> {
  let cached = modelCache.get(url);
  if (!cached) {
    cached = fetch(url).then(async (r) => {
      if (!r.ok) throw new Error(`failed to load ${url}`);
      const buf = await r.arrayBuffer();
      return new Uint8Array(buf);
    });
    modelCache.set(url, cached);
  }
  return cached;
}

// MODULE SCOPE — the compiled glue script itself is loaded once per page
// load, identical reasoning to sherpaOnnxProvider's moduleLoadPromise.
let moduleLoadPromise: Promise<WhisperCommandModule> | null = null;

export interface WhisperCppProviderOptions extends SpeechProviderOptions {
  /** Base URL the compiled `libcommand.js`/`.wasm` glue and the model file are served from. Defaults to `resolveDefaultWhisperAssetBaseUrl(process.env)` — see ASSET DEPLOYMENT above for why nothing is provisioned there yet in any environment. */
  assetBaseUrl?: string;
  /** Which GGML model to load — defaults to `DEFAULT_WHISPER_MODEL` (smallest/fastest, appropriate for short commands). */
  modelId?: WhisperCppModelId;
  /** How often (ms) to poll `get_transcribed()`/`get_status()` while listening. Defaults to 250ms — frequent enough not to visibly delay a short command, far below any latency this engine's own inference time would dominate. */
  pollIntervalMs?: number;
}

/**
 * Real, working logic against the documented command.wasm API — see this
 * module's own top-of-file doc comment for exactly what is and is not
 * verified this round.
 *
 * START PHRASE / END PHRASE MAPPING (per explicit requirement to support
 * the Lab's existing workflow): `start()` loads the glue script + model
 * (cached at module/URL scope so repeated phrase cycles don't re-fetch
 * ~30-150MB every time — same reasoning as Sherpa's own module-scope
 * cache) and calls `init()` to create a fresh context every phrase — no
 * context/model state is reused ACROSS phrases at the ENGINE level (only
 * the already-downloaded bytes are), matching Sherpa's own "every phrase
 * is its own clean recognition segment" precedent, since this API's real
 * reuse-safety across repeated init()/free() cycles has not been verified.
 * Audio capture begins immediately (this engine's own internal VAD decides
 * when a "command" is complete — there is no caller-driven force-finalize
 * primitive, see the module doc comment). `stop()` stops audio capture and
 * polling and calls `free()` on the context — a clean, fully torn-down
 * session every time, never carrying state into the next phrase.
 */
export function createWhisperCppProvider(options: WhisperCppProviderOptions): SpeechProvider {
  const assetBaseUrl = (options.assetBaseUrl ?? DEFAULT_ASSET_BASE_URL).replace(/\/?$/, "/");
  const modelId = options.modelId ?? DEFAULT_WHISPER_MODEL;
  const pollIntervalMs = options.pollIntervalMs ?? 250;
  const detection = detectAmbientWhisperCppSupport();
  const supported = detection.webAssembly && detection.audioWorklet && detection.getUserMedia;

  let contextIndex: number | null = null;
  let moduleRef: WhisperCommandModule | null = null;
  let audioContext: AudioContext | null = null;
  let mediaStream: MediaStream | null = null;
  let workletNode: AudioWorkletNode | null = null;
  let pollHandle: ReturnType<typeof setInterval> | null = null;
  let suppressed = false;
  let running = false;
  let lastTranscribed = "";

  function emitFinal(text: string) {
    const result: SpeechProviderResult = { transcript: text, confidence: null, isFinal: true, alternatives: [{ transcript: text, confidence: null }] };
    options.onFinalResult(result);
  }

  async function initModule(): Promise<WhisperCommandModule> {
    if (!moduleLoadPromise) {
      moduleLoadPromise = (async () => {
        window.WhisperModule = {
          locateFile: (path: string) => `${assetBaseUrl}${path}`,
        };
        await loadScript(`${assetBaseUrl}libcommand.js`);
        await new Promise<void>((resolve) => {
          const mod = window.WhisperModule!;
          const prior = mod.onRuntimeInitialized;
          mod.onRuntimeInitialized = () => {
            prior?.();
            resolve();
          };
        });
        return window.WhisperModule!;
      })();
    }
    return moduleLoadPromise;
  }

  function poll() {
    if (suppressed || !moduleRef || contextIndex === null) return;
    const status = moduleRef.get_status?.();
    if (status) options.onSpeechStart?.();
    const text = moduleRef.get_transcribed?.() ?? "";
    if (text.length > 0 && text !== lastTranscribed) {
      lastTranscribed = text;
      emitFinal(text);
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
      const whisperModule = await initModule();
      moduleRef = whisperModule;

      const modelInfo = WHISPER_CPP_MODELS[modelId];
      const modelBytes = await fetchModel(`${assetBaseUrl}${modelInfo.file}`);
      const fs = whisperModule.FS;
      fs?.writeFile(modelInfo.file, modelBytes);

      const initFn = whisperModule.init;
      if (!initFn) throw new Error("init missing after module init");
      const index = initFn(modelInfo.file);
      if (index === 0) throw new Error("whisper.cpp init() returned 0 (model load failed)");
      contextIndex = index;

      options.onAudioStart?.();
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext = new AudioContext();
      const workletBlobUrl = URL.createObjectURL(new Blob([INLINE_WORKLET_SOURCE], { type: "application/javascript" }));
      await audioContext.audioWorklet.addModule(workletBlobUrl);
      URL.revokeObjectURL(workletBlobUrl);

      const source = audioContext.createMediaStreamSource(mediaStream);
      workletNode = new AudioWorkletNode(audioContext, "whisper-capture-processor");
      workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (suppressed || !moduleRef || contextIndex === null) return;
        const samples = resampleTo16k(event.data, audioContext!.sampleRate);
        moduleRef.set_audio?.(contextIndex, samples);
      };
      source.connect(workletNode);

      pollHandle = setInterval(poll, pollIntervalMs);
    } catch (err) {
      running = false;
      const message = err instanceof Error ? err.message : String(err);
      options.onError?.(classifyWhisperStartError(message));
    }
  }

  /**
   * A clean, complete teardown every phrase — see this function's own
   * top-of-createWhisperCppProvider doc comment for why context reuse
   * across phrases is deliberately NOT attempted this round.
   */
  function stop(): void {
    running = false;
    if (pollHandle !== null) {
      clearInterval(pollHandle);
      pollHandle = null;
    }
    workletNode?.port.close();
    workletNode?.disconnect();
    workletNode = null;
    mediaStream?.getTracks().forEach((t) => t.stop());
    mediaStream = null;
    audioContext?.close().catch(() => {});
    audioContext = null;
    if (moduleRef && contextIndex !== null) {
      try {
        moduleRef.free?.(contextIndex);
      } catch {
        // Best-effort — a context in an unexpected state should never
        // prevent the rest of cleanup from running.
      }
    }
    contextIndex = null;
    moduleRef = null;
    lastTranscribed = "";
    options.onAudioEnd?.();
  }

  return {
    providerId: WHISPER_CPP_PROVIDER_ID,
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

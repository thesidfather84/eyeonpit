/**
 * WHISPERCPPPROVIDER — EXPERIMENTAL, LAB-ONLY. Read this whole comment
 * before touching this file.
 *
 * ============================================================
 * ARCHITECTURE, 2026-08-21 — isolated-origin iframe + postMessage, NOT
 * in-process WASM. This REPLACES an earlier version of this file that
 * loaded whisper.cpp's compiled `command.js`/`command.wasm` directly into
 * EyeOnPit's own page. That approach is CONFIRMED BROKEN, not merely
 * unverified: `command.js`'s own internal pthread worker-pool bootstrap
 * (`PThread.allocateUnusedWorker` -> `new Worker(command.js)`) fails
 * immediately, every time, with a content-free `ErrorEvent`, when served
 * through EyeOnPit's Next.js stack — reproduced in a real production build
 * (`next build && next start`), with cross-origin isolation, asset hosting,
 * and dev-vs-prod all ruled out directly as causes. The SAME compiled
 * assets, served from a trivial static origin with no Next.js in the
 * request path, work correctly and reliably — confirmed via real
 * transcription (see WHISPER_CPP_PROVENANCE.staticLabVerification below).
 *
 * The fix is architectural, not a header tweak: the actual whisper.cpp
 * WASM runtime lives ENTIRELY on its own isolated static origin
 * (`whisper-static-lab.vercel.app` by default — see
 * `resolveDefaultWhisperOrigin`), loaded here as a hidden `<iframe>`. This
 * provider never touches WebAssembly, AudioWorklet, or getUserMedia
 * itself — every one of those happens INSIDE the iframe's own origin. This
 * file's entire job is the narrow postMessage protocol below: tell the
 * iframe when to start/stop listening, and receive back status/timing/
 * transcript/error — nothing else ever crosses the origin boundary.
 *
 * RAW MICROPHONE AUDIO NEVER CROSSES postMessage. Not samples, not a
 * waveform, not an audio Blob — only the inbound message shapes in
 * `parseWhisperInboundMessage` below (status strings, a timing number, and
 * transcribed TEXT) are ever received from the iframe, and the only
 * outbound messages this file ever sends are the two zero-payload control
 * messages `whisper:start-phrase` / `whisper:end-phrase`. Audio capture,
 * resampling, buffering, and inference all happen inside the iframe's own
 * JS heap and are never serialized out of it.
 *
 * ============================================================
 * SECURITY — explicit origin allowlisting on BOTH sides
 * ============================================================
 * This file (`isTrustedWhisperMessageOrigin`) accepts an inbound
 * `message` event ONLY when the browser's own `event.origin` — never
 * anything from the message payload itself — is an EXACT match for the
 * one configured Whisper static origin (`whisperOrigin`, resolved via
 * `resolveDefaultWhisperOrigin`). Every outbound `postMessage` call also
 * targets that exact origin string, never `"*"`. The mirror-image check
 * lives on the OTHER side, in the isolated Whisper origin's own
 * `index.html` (`ALLOWED_PARENT_ORIGINS`) — that page independently
 * accepts control messages only from EyeOnPit's production origins plus
 * approved local-dev origins, also never `"*"`. Neither side trusts the
 * other's identity claims from message content; both rely solely on the
 * browser-verified `event.origin`.
 *
 * ============================================================
 * WHY whisper.cpp's `examples/command.wasm`, SPECIFICALLY
 * ============================================================
 * Three official, maintained browser/WASM examples ship in
 * https://github.com/ggml-org/whisper.cpp (MIT license):
 *   - `examples/whisper.wasm` — general file-or-microphone transcription.
 *   - `examples/stream.wasm` — continuous, always-on streaming.
 *   - `examples/command.wasm` — the project's own README: "a basic Voice
 *     Assistant example that accepts voice commands from the microphone."
 * `command.wasm` was chosen because its own stated purpose already matches
 * "short casino commands." No third-party wrapper was considered.
 *
 * ============================================================
 * NO-WAKE-PHRASE PATCH, 2026-08-21 — EyeOnPit Lab patch against pinned
 * upstream commit 339f2b4e, rebuilt from source (Emscripten SDK 6.0.8,
 * CMake 4.4.2, Ninja 1.13.0, WHISPER_WASM_SINGLE_FILE=OFF)
 * ============================================================
 * The official `command.wasm` example hardcodes a wake-phrase enrollment
 * gate ("Ok Whisper, start listening for commands.") that every operator
 * would otherwise have to speak before every real command — inappropriate
 * here, since EyeOnPit already has its own explicit Start Phrase / End
 * Phrase workflow. The gate lives in `command_main()` in
 * `examples/command.wasm/emscripten.cpp`, driven by three C++ globals:
 * `have_prompt` (has the wake phrase been heard yet), `ask_prompt` (should
 * the "say the phrase" status be shown), and `pcmf32_prompt` (the captured
 * enrollment audio, later prepended to every command before transcribing
 * so the prompt can be found and stripped back out).
 *
 * The patch changes two things, both isolated to that one file, preserved
 * byte-for-byte in `eyeonpit-no-wake-phrase.patch` (kept alongside the
 * whisper-static-lab deployment, NOT in this repo — the C++ source and its
 * own build live entirely outside EyeOnPit, matching the isolated-origin
 * architecture above):
 *   1. `have_prompt` starts `true` (was `false`) and `ask_prompt` starts
 *      `false` (was `true`) — skips enrollment entirely and moves straight
 *      to the "waiting for voice commands" branch. `pcmf32_prompt` is left
 *      at its natural empty default rather than fabricated. This means the
 *      CALLER's own set_audio()/no-set_audio() cadence — driven by
 *      EyeOnPit's real Start Phrase / End Phrase buttons, via this
 *      provider's `whisper:start-phrase`/`whisper:end-phrase` messages —
 *      is what actually controls when transcription is active, not any
 *      spoken phrase.
 *   2. The command-transcript's prompt-stripping logic (upstream
 *      unconditionally searches every transcript for a best-matching
 *      prefix to strip, assuming the enrollment prompt was re-spoken) is
 *      guarded on `!pcmf32_prompt.empty()`. Without this guard, `have_prompt
 *      = true` alone is a REAL correctness bug: `best_sim` starts at 0, so
 *      the unconditional search always finds *some* "best" prefix length
 *      to strip even when nothing resembling the enrollment phrase was
 *      ever said — for a short real command, this can truncate or fully
 *      erase the correctly transcribed text. Guarding on the existing,
 *      already-populated-only-by-enrollment `pcmf32_prompt` signal (not a
 *      new flag) makes the no-wake-phrase path take the full decoded text
 *      as the command, deterministically, with zero corruption risk.
 *
 * PROVEN 2026-08-21 on the isolated static origin, known audio
 * (whisper.cpp's own bundled `jfk.wav`, fed via the harness's
 * `whisper:test-with-sample` debug-only message — never used by this
 * production provider, which always drives real microphone capture via
 * `whisper:start-phrase`): module init, pthread worker-pool init, model
 * load, and `init()` all succeeded; audio was accepted and transcribed
 * with ZERO wake phrase spoken; `get_transcribed()` returned a real,
 * correct transcript fragment of the actual spoken audio ("You can do for
 * your country." — the tail of the famous "ask not..." line, matching
 * `command.wasm`'s own 4-second rolling command window exactly).
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
  /** Read from the live official demo page's own footer at the time the pinned commit was chosen — real, verifiable, not guessed. */
  pinnedCommit: "339f2b4e",
  pinnedCommitSubject: "bindings-javascript : remove package.json from git (#4001)",
  modelSource: "https://huggingface.co/ggerganov/whisper.cpp",
  modelLicense: "MIT (OpenAI's original Whisper weights are MIT licensed; whisper.cpp publishes GGML-converted versions of the same weights)",
  architecture: "isolated-static-origin-iframe" as const,
  inProcessWasmConfirmedBroken:
    "command.js's pthread worker-pool bootstrap fails immediately under EyeOnPit's Next.js serving stack (reproduced in a real production build) — the isolated static origin exists specifically to route around this, not as a preference.",
  noWakePhrasePatch: {
    file: "examples/command.wasm/emscripten.cpp",
    patchFile: "eyeonpit-no-wake-phrase.patch (kept with the whisper-static-lab deployment, not in this repo)",
    against: "pinned commit 339f2b4e",
    verifiedRealTranscription: 'jfk.wav sample, zero wake phrase spoken, get_transcribed() returned "You can do for your country."',
    verifiedOn: "2026-08-21",
  },
  filesActuallyCopiedIntoThisRepo: [] as string[],
  researchedOn: "2026-08-20",
} as const;

/**
 * Same env-var-overridable pattern as every other provider's asset base
 * URL resolution — falls back to the real, already-deployed
 * whisper-static-lab production origin so a Lab session works out of the
 * box with no env var required, in every environment including local dev
 * (the isolated origin is reachable from anywhere, unlike the old
 * same-origin-only asset path).
 */
export function resolveDefaultWhisperOrigin(env: Record<string, string | undefined>): string {
  const raw = env.NEXT_PUBLIC_WHISPER_STATIC_ORIGIN || "https://whisper-static-lab.vercel.app";
  return raw.replace(/\/+$/, "");
}

const DEFAULT_WHISPER_ORIGIN = resolveDefaultWhisperOrigin({
  NEXT_PUBLIC_WHISPER_STATIC_ORIGIN: process.env.NEXT_PUBLIC_WHISPER_STATIC_ORIGIN,
});

/**
 * The ONE real security check gating every inbound message this provider
 * ever acts on — see this module's own SECURITY doc comment above.
 * `eventOrigin` must be the browser-verified `MessageEvent.origin`, never
 * anything read out of the message payload.
 */
export function isTrustedWhisperMessageOrigin(eventOrigin: string, configuredOrigin: string): boolean {
  return eventOrigin === configuredOrigin;
}

/** Every shape this provider will ever act on from the iframe — see the module doc comment: no audio, no waveform, ever. */
export type WhisperInboundMessage =
  | { type: "whisper:ready"; moduleReadyMs: number }
  | { type: "whisper:error"; message: string }
  | { type: "whisper:final"; text: string }
  | { type: "whisper:status"; status: string };

/**
 * Pure, independently testable — validates an untrusted `event.data`
 * against the exact narrow protocol shapes above. Anything that doesn't
 * match a known type, or is missing/mis-typed a required field, is
 * treated as not-a-Whisper-message and ignored (returns null) rather than
 * guessed at.
 */
export function parseWhisperInboundMessage(data: unknown): WhisperInboundMessage | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.type !== "string") return null;
  switch (d.type) {
    case "whisper:ready":
      return typeof d.moduleReadyMs === "number" ? { type: "whisper:ready", moduleReadyMs: d.moduleReadyMs } : null;
    case "whisper:error":
      return typeof d.message === "string" ? { type: "whisper:error", message: d.message } : null;
    case "whisper:final":
      return typeof d.text === "string" ? { type: "whisper:final", text: d.text } : null;
    case "whisper:status":
      return typeof d.status === "string" ? { type: "whisper:status", status: d.status } : null;
    default:
      return null;
  }
}

/** Identical pattern to every other provider's start-error classification. */
export function classifyWhisperStartError(message: string): string {
  if (message === WHISPER_IFRAME_READY_TIMEOUT_MESSAGE) return message;
  return /404|failed to load|NetworkError/i.test(message) ? `iframe-unreachable: ${message}` : message;
}

export const WHISPER_IFRAME_READY_TIMEOUT_MESSAGE =
  "whisper iframe did not send whisper:ready in time — the isolated Whisper origin may be unreachable, blocked, or its own module init failed";

/** Generous default — the isolated origin's own model download + WASM/pthread init took ~1.2s in real verified testing, but a slow connection or cold Vercel edge could legitimately take longer; this only bounds an otherwise-infinite hang. */
export const DEFAULT_WHISPER_READY_TIMEOUT_MS = 20000;

/**
 * Bounds `readyPromise` with a real timeout, rejecting with
 * `WHISPER_IFRAME_READY_TIMEOUT_MESSAGE` if it neither resolves nor
 * rejects in time. Never resolves/rejects twice.
 */
export function withWhisperReadyTimeout<T>(readyPromise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(WHISPER_IFRAME_READY_TIMEOUT_MESSAGE)), timeoutMs);
    readyPromise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

interface WhisperFeatureDetection {
  /** Every real browser supports `<iframe>` + `postMessage` — this only ever reads `false` in a non-browser environment (SSR/Node), identical in spirit to every other provider's `hasWindow` guard. Audio capture itself (getUserMedia/AudioWorklet) happens INSIDE the iframe's own origin and is this provider's problem to detect, not this one's. */
  iframeEmbedding: boolean;
}

export function detectWhisperCppSupport(env: { hasWindow: boolean; hasDocument: boolean }): WhisperFeatureDetection {
  return { iframeEmbedding: env.hasWindow && env.hasDocument };
}

function detectAmbientWhisperCppSupport(): WhisperFeatureDetection {
  return detectWhisperCppSupport({
    hasWindow: typeof window !== "undefined",
    hasDocument: typeof document !== "undefined",
  });
}

type WhisperMessageListener = (msg: WhisperInboundMessage) => void;

interface WhisperIframeSession {
  origin: string;
  iframeEl: HTMLIFrameElement;
  readyPromise: Promise<number>;
  listeners: Set<WhisperMessageListener>;
  postToIframe: (message: { type: "whisper:start-phrase" } | { type: "whisper:end-phrase" }) => void;
}

// MODULE SCOPE — the iframe (and therefore the isolated origin's own
// model load) is created once and reused across an entire Lab session's
// worth of phrases, not torn down and rebuilt every Start/End Phrase
// cycle. This is a deliberate change from the old in-process provider's
// "fresh context every phrase" design: that constraint no longer applies
// (the isolated origin's own command_main loop already clears its audio
// buffer after producing each transcript — see the no-wake-phrase patch
// doc comment above), and reusing one iframe avoids re-fetching the
// ~31MB model on every phrase.
let session: WhisperIframeSession | null = null;

function ensureSession(origin: string, readyTimeoutMs: number): WhisperIframeSession {
  if (session && session.origin === origin) return session;
  session?.iframeEl.remove();

  const iframeEl = document.createElement("iframe");
  iframeEl.src = `${origin}/`;
  // Grants the cross-origin iframe real getUserMedia access — required
  // because a cross-origin frame's own microphone permission request is
  // denied by the browser unless the embedder explicitly allows it here.
  iframeEl.allow = "microphone";
  iframeEl.setAttribute("aria-hidden", "true");
  iframeEl.setAttribute("title", "EyeOnPit Whisper research runtime (isolated origin)");
  // Deliberately NOT display:none — some browsers deprioritize/throttle
  // work inside display:none iframes. Zero-sized and non-interactive
  // instead, which keeps real-time audio processing unthrottled.
  Object.assign(iframeEl.style, { position: "fixed", width: "0", height: "0", border: "0", opacity: "0", pointerEvents: "none" });
  document.body.appendChild(iframeEl);

  const listeners = new Set<WhisperMessageListener>();

  function handleWindowMessage(event: MessageEvent) {
    if (session !== newSession) return; // a later ensureSession() call superseded this one
    if (!isTrustedWhisperMessageOrigin(event.origin, origin)) return;
    const msg = parseWhisperInboundMessage(event.data);
    if (!msg) return;
    for (const listener of listeners) listener(msg);
  }
  window.addEventListener("message", handleWindowMessage);

  const readyPromise = withWhisperReadyTimeout(
    new Promise<number>((resolve, reject) => {
      const onReadyOrError: WhisperMessageListener = (msg) => {
        if (msg.type === "whisper:ready") {
          listeners.delete(onReadyOrError);
          resolve(msg.moduleReadyMs);
        } else if (msg.type === "whisper:error") {
          listeners.delete(onReadyOrError);
          reject(new Error(msg.message));
        }
      };
      listeners.add(onReadyOrError);
    }),
    readyTimeoutMs
  );

  const newSession: WhisperIframeSession = {
    origin,
    iframeEl,
    readyPromise,
    listeners,
    postToIframe(message) {
      iframeEl.contentWindow?.postMessage(message, origin);
    },
  };
  session = newSession;
  return newSession;
}

export interface WhisperCppProviderOptions extends SpeechProviderOptions {
  /** Origin (scheme + host, no path/trailing slash) of the isolated Whisper runtime. Defaults to `resolveDefaultWhisperOrigin(process.env)`. */
  whisperOrigin?: string;
  /** Bounds the wait for the iframe's own `whisper:ready` message. Defaults to `DEFAULT_WHISPER_READY_TIMEOUT_MS`. */
  readyTimeoutMs?: number;
}

/**
 * Real, working provider against the isolated-origin iframe architecture
 * described in this module's own top-of-file doc comment.
 *
 * START PHRASE / END PHRASE MAPPING: `start()` ensures the shared iframe
 * session exists (creating + waiting for `whisper:ready` on first use,
 * reused thereafter), then sends `whisper:start-phrase` — the isolated
 * origin's own `startPhrase()` begins real getUserMedia capture and feeds
 * the whisper.cpp WASM runtime. `stop()` sends `whisper:end-phrase`,
 * which tears down that capture session on the iframe side. Every
 * `whisper:final` message received while this provider instance is active
 * is treated as a COMPLETE, FINAL result — this engine has its own
 * internal VAD deciding when a command is complete, not a caller-driven
 * force-finalize primitive, so `onInterimResult` is never called (same
 * disclosed limitation the prior in-process version had).
 */
export function createWhisperCppProvider(options: WhisperCppProviderOptions): SpeechProvider {
  const whisperOrigin = (options.whisperOrigin ?? DEFAULT_WHISPER_ORIGIN).replace(/\/+$/, "");
  const readyTimeoutMs = options.readyTimeoutMs ?? DEFAULT_WHISPER_READY_TIMEOUT_MS;
  const detection = detectAmbientWhisperCppSupport();
  const supported = detection.iframeEmbedding;

  let running = false;
  let suppressed = false;
  let audioStartFired = false;
  let activeSession: WhisperIframeSession | null = null;
  let activeListener: WhisperMessageListener | null = null;

  function emitFinal(text: string) {
    const result: SpeechProviderResult = { transcript: text, confidence: null, isFinal: true, alternatives: [{ transcript: text, confidence: null }] };
    options.onFinalResult(result);
  }

  function onSessionMessage(msg: WhisperInboundMessage) {
    if (suppressed) return;
    if (msg.type === "whisper:status") {
      if (msg.status === "listening" && !audioStartFired) {
        audioStartFired = true;
        options.onAudioStart?.();
        options.onSpeechStart?.();
      }
    } else if (msg.type === "whisper:final") {
      emitFinal(msg.text);
    } else if (msg.type === "whisper:error") {
      options.onError?.(msg.message);
    }
  }

  async function start(): Promise<void> {
    if (!supported) {
      options.onError?.("unsupported");
      return;
    }
    if (running) return;
    running = true;
    audioStartFired = false;
    try {
      const sess = ensureSession(whisperOrigin, readyTimeoutMs);
      await sess.readyPromise;
      sess.listeners.add(onSessionMessage);
      activeSession = sess;
      activeListener = onSessionMessage;
      sess.postToIframe({ type: "whisper:start-phrase" });
    } catch (err) {
      running = false;
      const message = err instanceof Error ? err.message : String(err);
      options.onError?.(classifyWhisperStartError(message));
    }
  }

  function stop(): void {
    running = false;
    if (activeSession) {
      activeSession.postToIframe({ type: "whisper:end-phrase" });
      if (activeListener) activeSession.listeners.delete(activeListener);
    }
    activeSession = null;
    activeListener = null;
    audioStartFired = false;
    options.onAudioEnd?.();
  }

  return {
    providerId: WHISPER_CPP_PROVIDER_ID,
    supported,
    start,
    stop,
    // Reuses the same two protocol messages rather than adding new ones —
    // see this module's own SECURITY/architecture doc comment: the narrow
    // postMessage protocol allows only start/end/ready/status/final/error,
    // nothing else. Sending whisper:end-phrase genuinely stops mic capture
    // on the iframe side (not just a local flag), so EyeOnPit's own
    // spoken confirmations cannot be captured/transcribed during
    // suppression — the same self-hearing guarantee every other provider
    // makes. Resuming re-sends whisper:start-phrase, which begins a fresh
    // capture (discarding whatever was buffered before suppression).
    suppressForSpeech() {
      suppressed = true;
      activeSession?.postToIframe({ type: "whisper:end-phrase" });
    },
    resumeAfterSpeech() {
      suppressed = false;
      if (running) activeSession?.postToIframe({ type: "whisper:start-phrase" });
    },
  };
}

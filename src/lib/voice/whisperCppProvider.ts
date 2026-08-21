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

/**
 * Every shape this provider will ever act on from the iframe — see the
 * module doc comment: no audio, no waveform, ever. Deliberately no
 * separate "ready"/handshake message type — see MESSAGE ORDERING below:
 * `whisper:status` with `status: "listening"` doubles as the real
 * readiness signal, sent only as a reply to a `whisper:start-phrase` this
 * provider already sent.
 */
export type WhisperInboundMessage =
  | { type: "whisper:error"; message: string; diag?: string }
  | { type: "whisper:final"; text: string; diag?: string }
  | { type: "whisper:status"; status: string };

/**
 * Pure, independently testable — validates an untrusted `event.data`
 * against the exact narrow protocol shapes above. Anything that doesn't
 * match a known type, or is missing/mis-typed a required field, is
 * treated as not-a-Whisper-message and ignored (returns null) rather than
 * guessed at.
 *
 * `diag`, on whisper:final/whisper:error, is a TEMPORARY diagnostic
 * addition (2026-08-21) — real production report: 29/29 consecutive
 * real-speech phrases returned "no speech detected". It carries the
 * isolated origin's own audio-path instrumentation (mic/track/
 * AudioContext state, sample counts, peak/RMS amplitude on both the JS
 * and WASM sides — see index.html's own endPhrase() and
 * emscripten.cpp's own command_get_diagnostics()) so the failure can be
 * diagnosed from the Lab record/error text directly, without DevTools.
 * Still just a plain string field within the existing narrow protocol —
 * no new message type, no audio/waveform data.
 */
export function parseWhisperInboundMessage(data: unknown): WhisperInboundMessage | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.type !== "string") return null;
  const diag = typeof d.diag === "string" ? d.diag : undefined;
  switch (d.type) {
    case "whisper:error":
      return typeof d.message === "string" ? { type: "whisper:error", message: d.message, ...(diag ? { diag } : {}) } : null;
    case "whisper:final":
      return typeof d.text === "string" ? { type: "whisper:final", text: d.text, ...(diag ? { diag } : {}) } : null;
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

/**
 * MESSAGE ORDERING, 2026-08-21 (real production fix): this provider
 * ALWAYS speaks first, never waits for an unsolicited announcement from
 * the iframe. An earlier version waited for the iframe to proactively
 * send a "whisper:ready" ping as soon as its own module finished loading
 * — that produced a real, reproducible bug in a live browser test: the
 * iframe's own reply-target resolution depended on `document.referrer`,
 * which is not guaranteed to survive every Referrer-Policy configuration,
 * and even when it does, there was no reliable signal for THIS side to
 * know the iframe's message listener was actually attached yet (a message
 * sent before that happens is simply lost, not queued). This timeout now
 * bounds the FULL real sequence — iframe navigation, module+model load,
 * mic permission, audio pipeline setup — ending only when the iframe
 * replies to a `whisper:start-phrase` THIS provider sent, with either
 * `whisper:status: "listening"` or `whisper:error`.
 */
export const WHISPER_IFRAME_READY_TIMEOUT_MESSAGE =
  "whisper iframe did not confirm it started listening in time — the isolated Whisper origin may be unreachable, blocked, or its own module/model init failed";

/** Generous default — covers real end-to-end setup (iframe load, WASM/model init, a mic permission prompt, audio pipeline setup), not just module load; a slow connection, cold Vercel edge, or a operator taking a moment to grant mic permission could legitimately take a while. Only bounds an otherwise-infinite hang. */
export const DEFAULT_WHISPER_READY_TIMEOUT_MS = 20000;

/**
 * REGRESSION, 2026-08-21 — real production bug: End Phrase must always
 * resolve to a definitive outcome (a transcript, or an explicit
 * "no speech"/error) rather than silently producing nothing. The isolated
 * origin's own End Phrase handling (see index.html) always replies with
 * exactly one whisper:final or whisper:error when no result was already
 * sent during listening; this bounds the wait for that reply so a
 * genuinely unreachable/crashed iframe still surfaces a real, disclosed
 * error (and therefore a real captured record) instead of hanging
 * End Phrase forever.
 */
export const END_PHRASE_NO_REPLY_MESSAGE =
  "whisper iframe did not confirm End Phrase (no whisper:final or whisper:error reply) — the isolated Whisper origin may have become unreachable mid-session";

/** A forced end-of-phrase transcription (up to 4s of audio, single-threaded) is real work, not instant — this only bounds an otherwise-infinite wait if the reply never arrives at all. */
export const STOP_REPLY_TIMEOUT_MS = 8000;

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
  /** Resolves once the iframe's own `load` event fires — confirms its script has run and its message listener is attached, so a message sent any earlier would simply be lost (see this module's own MESSAGE ORDERING doc comment). Never rejects; a dead/unreachable origin just never resolves, which is why every caller wraps this in `withWhisperReadyTimeout`. */
  loadPromise: Promise<void>;
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

/**
 * TEST-ONLY. This session is deliberately module-scope (see the doc
 * comment above) so it survives across phrases within one real page
 * load — but that means it ALSO survives across tests within one test
 * file, which real testing found causes cross-test contamination (a
 * later test's `start()` silently reusing an earlier test's already-
 * "loaded" iframe/session, short-circuiting the very message sequence
 * the test meant to exercise). Never called from production code.
 */
export function __resetWhisperSessionForTests(): void {
  session?.iframeEl.remove();
  session = null;
}

function ensureSession(origin: string): WhisperIframeSession {
  if (session && session.origin === origin) return session;
  session?.iframeEl.remove();

  const iframeEl = document.createElement("iframe");
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

  const loadPromise = new Promise<void>((resolve) => {
    iframeEl.addEventListener("load", () => resolve(), { once: true });
  });
  // Set src and attach to the DOM only AFTER the load listener above —
  // navigation cannot begin (and therefore `load` cannot fire) until this
  // element is actually in the document, but ordering it this way avoids
  // any dependency on exactly when the browser starts navigating.
  iframeEl.src = `${origin}/`;
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

  const newSession: WhisperIframeSession = {
    origin,
    iframeEl,
    loadPromise,
    listeners,
    postToIframe(message) {
      iframeEl.contentWindow?.postMessage(message, origin);
    },
  };
  session = newSession;
  return newSession;
}

/** A session that failed to become ready must never be cached permanently — a transient failure (slow Vercel cold start, a momentary network blip, a denied mic prompt) would otherwise wedge EVERY later phrase in the same Lab session behind the same dead iframe, with no way to recover short of a full page reload. Called from `start()`'s own catch handler. */
function discardSessionOnFailure(sess: WhisperIframeSession) {
  if (session === sess) {
    session.iframeEl.remove();
    session = null;
  }
}

export interface WhisperCppProviderOptions extends SpeechProviderOptions {
  /** Origin (scheme + host, no path/trailing slash) of the isolated Whisper runtime. Defaults to `resolveDefaultWhisperOrigin(process.env)`. */
  whisperOrigin?: string;
  /** Bounds the wait for the iframe to confirm it started listening (or report an error) after `whisper:start-phrase` is sent. Defaults to `DEFAULT_WHISPER_READY_TIMEOUT_MS`. */
  readyTimeoutMs?: number;
}

/**
 * Real, working provider against the isolated-origin iframe architecture
 * described in this module's own top-of-file doc comment.
 *
 * START PHRASE / END PHRASE MAPPING: `start()` ensures the shared iframe
 * session exists (creating it and waiting for its `load` event on first
 * use, reused thereafter), sends `whisper:start-phrase`, and waits for the
 * iframe's reply — `whisper:status: "listening"` (real getUserMedia
 * capture began and is feeding the whisper.cpp WASM runtime) or
 * `whisper:error`. See MESSAGE ORDERING above for why this provider always
 * sends first rather than waiting for an unsolicited announcement. `stop()`
 * sends `whisper:end-phrase`, which tears down that capture session on the
 * iframe side. Every `whisper:final` message received while this provider
 * instance is active is treated as a COMPLETE, FINAL result — this engine
 * has its own internal VAD deciding when a command is complete, not a
 * caller-driven force-finalize primitive, so `onInterimResult` is never
 * called (same disclosed limitation the prior in-process version had).
 */
export function createWhisperCppProvider(options: WhisperCppProviderOptions): SpeechProvider {
  const whisperOrigin = (options.whisperOrigin ?? DEFAULT_WHISPER_ORIGIN).replace(/\/+$/, "");
  const readyTimeoutMs = options.readyTimeoutMs ?? DEFAULT_WHISPER_READY_TIMEOUT_MS;
  const detection = detectAmbientWhisperCppSupport();
  const supported = detection.iframeEmbedding;

  // REGRESSION, 2026-08-21 — real production bug: End Phrase used to send
  // whisper:end-phrase and remove this provider's message listener in the
  // SAME synchronous call. Any whisper:final/whisper:error the isolated
  // origin sent in response to that end-phrase — which, before the
  // matching harness fix (see index.html's own endPhrase() doc comment),
  // was the ONLY way a result could arrive if whisper.cpp's own VAD never
  // fired during listening — arrived asynchronously, after the listener
  // was already gone. The transcript (or even an explicit failure) was
  // silently discarded: no record, nothing in the export, no error
  // surfaced anywhere. `phase` tracks this explicitly so stop() knows
  // whether to wait for a definitive reply before detaching, instead of
  // detaching unconditionally.
  type Phase = "idle" | "starting" | "listening" | "stopping";
  let phase: Phase = "idle";
  let running = false;
  let suppressed = false;
  // Whether a real whisper:final/whisper:error has already been received
  // THIS phrase (VAD fired during listening, before End Phrase was even
  // clicked). The harness's own endPhrase() checks the equivalent state
  // on its side (`lastTranscribed`) and does NOT send a second
  // final/error when one was already sent — so when this is already
  // true, stop() must not wait for another one (none is coming).
  let resultReceivedThisPhrase = false;
  let activeSession: WhisperIframeSession | null = null;
  let activeListener: WhisperMessageListener | null = null;

  function emitFinal(text: string) {
    const result: SpeechProviderResult = { transcript: text, confidence: null, isFinal: true, alternatives: [{ transcript: text, confidence: null }] };
    options.onFinalResult(result);
  }

  function onSessionMessage(msg: WhisperInboundMessage) {
    if (suppressed) return;
    if (msg.type === "whisper:status") {
      if (msg.status === "listening" && phase === "starting") {
        phase = "listening";
        options.onAudioStart?.();
        options.onSpeechStart?.();
      }
      return;
    }
    // A whisper:error while phase is "starting" is handled exclusively by
    // start()'s own temporary readiness-wait listener below (which
    // rejects and drives a single onError via the catch block) — handling
    // it here too would double-fire onError (and, per this round's
    // record-per-failure requirement, create two records for one
    // failure).
    if (phase !== "listening" && phase !== "stopping") return;
    if (msg.type === "whisper:final") {
      resultReceivedThisPhrase = true;
      // TEMPORARY DIAGNOSTIC (2026-08-21) — see WhisperInboundMessage's
      // own doc comment on `diag`. Logged rather than appended to the
      // transcript itself, which stays clean for real display/
      // classification; a successful final has no "error" field to
      // surface it in the way a failure does.
      if (msg.diag) console.log("[whisper diag]", msg.diag);
      emitFinal(msg.text);
    } else if (msg.type === "whisper:error") {
      resultReceivedThisPhrase = true;
      // TEMPORARY DIAGNOSTIC — appended to the surfaced error text itself
      // so it lands directly in the Lab record's own `error` field
      // (visible in the export/UI without DevTools), per this round's
      // explicit instrumentation requirement.
      options.onError?.(msg.diag ? `${msg.message} | ${msg.diag}` : msg.message);
    }
  }

  async function start(): Promise<void> {
    if (!supported) {
      options.onError?.("unsupported");
      return;
    }
    if (running) return;
    running = true;
    phase = "starting";
    resultReceivedThisPhrase = false;
    const sess = ensureSession(whisperOrigin);
    sess.listeners.add(onSessionMessage);
    activeSession = sess;
    activeListener = onSessionMessage;
    try {
      await withWhisperReadyTimeout(
        (async () => {
          await sess.loadPromise;
          await new Promise<void>((resolve, reject) => {
            const onFirstReply: WhisperMessageListener = (msg) => {
              if (msg.type === "whisper:status" && msg.status === "listening") {
                sess.listeners.delete(onFirstReply);
                resolve();
              } else if (msg.type === "whisper:error") {
                sess.listeners.delete(onFirstReply);
                reject(new Error(msg.message));
              }
            };
            sess.listeners.add(onFirstReply);
            sess.postToIframe({ type: "whisper:start-phrase" });
          });
        })(),
        readyTimeoutMs
      );
    } catch (err) {
      running = false;
      phase = "idle";
      discardSessionOnFailure(sess);
      sess.listeners.delete(onSessionMessage);
      activeSession = null;
      activeListener = null;
      const message = err instanceof Error ? err.message : String(err);
      options.onError?.(classifyWhisperStartError(message));
    }
  }

  function stop(): void {
    running = false;
    const sess = activeSession;
    const listener = activeListener;
    activeSession = null;
    activeListener = null;

    if (!sess || !listener) {
      phase = "idle";
      options.onAudioEnd?.();
      return;
    }

    if (resultReceivedThisPhrase) {
      // VAD already produced a real result during listening, and this
      // provider already emitted it — the harness will NOT send a second
      // final/error for this End Phrase (see index.html's own
      // endPhrase()), so there is nothing further to wait for.
      phase = "idle";
      sess.listeners.delete(listener);
      sess.postToIframe({ type: "whisper:end-phrase" });
      options.onAudioEnd?.();
      return;
    }

    // No result yet — the harness is guaranteed to force-finalize and
    // reply with exactly one whisper:final or whisper:error (see
    // index.html's own endPhrase() doc comment). Keep listening (phase
    // stays a value onSessionMessage still acts on) until that reply
    // arrives, or until a bounded timeout — which itself surfaces a real,
    // disclosed onError rather than a silent nothing — before detaching.
    phase = "stopping";
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      phase = "idle";
      sess.listeners.delete(listener);
      sess.listeners.delete(onEndReply);
      options.onAudioEnd?.();
    };
    const timer = setTimeout(() => {
      if (settled) return;
      options.onError?.(END_PHRASE_NO_REPLY_MESSAGE);
      finish();
    }, STOP_REPLY_TIMEOUT_MS);
    const onEndReply: WhisperMessageListener = (msg) => {
      if (settled) return;
      if (msg.type === "whisper:final" || msg.type === "whisper:error") {
        clearTimeout(timer);
        finish();
      }
    };
    sess.listeners.add(onEndReply);
    sess.postToIframe({ type: "whisper:end-phrase" });
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

/**
 * SPEECHPROVIDER — the seam that lets EyeOnPit stop depending permanently
 * on any one browser's built-in speech engine. See
 * docs/EYEONPIT_VOICE_ARCHITECTURE.md for the full architecture and the
 * explicit safety boundary this interface draws.
 *
 * A SpeechProvider's ONLY job is AUDIO -> TRANSCRIPT (plus the lifecycle
 * events around that). It never sees investigation state, never touches
 * normalization/narration/N-best resolution, and never writes a
 * CardEvent — every one of those stays exactly where it already is,
 * downstream of whichever provider is active. Swapping providers changes
 * nothing about EyeOnPit's own safety guarantees; it only changes where
 * the transcript text originally came from.
 *
 * Deliberately modeled closely on `useVoiceRecognition.ts`'s own existing,
 * already-correct option/result shapes (`VoiceResult`/
 * `UseVoiceRecognitionOptions`) rather than inventing a new vocabulary —
 * `BrowserWebSpeechProvider` (browserWebSpeechProvider.ts) is a faithful
 * re-expression of that hook's proven logic behind this interface, not a
 * redesign.
 */

/** One alternative reading the provider offered for the current result — identical shape to `VoiceAlternative` in useVoiceRecognition.ts. */
export interface SpeechProviderAlternative {
  transcript: string;
  confidence: number | null;
}

/** One recognition result (interim or final) — identical shape to `VoiceResult` in useVoiceRecognition.ts, so nothing downstream (normalizeTranscript, classifyVoiceTranscript, nBestResolver) needs to change no matter which provider produced it. */
export interface SpeechProviderResult {
  /** The top-ranked alternative's transcript — convenience shortcut, same convention as VoiceResult. */
  transcript: string;
  confidence: number | null;
  isFinal: boolean;
  /** Every alternative the provider returned, in its own ranked order. A provider that cannot produce more than one alternative (some on-device engines don't) returns an array of length 1 — never fabricates additional alternatives. */
  alternatives: SpeechProviderAlternative[];
}

/**
 * Configuration + event handlers a caller supplies when creating a
 * provider instance. `onFinalResult` is the only required handler — every
 * other callback is optional, exactly like `UseVoiceRecognitionOptions`
 * today.
 */
export interface SpeechProviderOptions {
  onFinalResult: (result: SpeechProviderResult) => void;
  onInterimResult?: (result: SpeechProviderResult) => void;
  /**
   * `"unsupported"` (this provider is unavailable in the current
   * environment), a provider-specific error string, or one of the
   * cross-provider synthetic codes documented on each concrete provider.
   * Never translated or dropped here — display is the caller's job either
   * way, matching useVoiceRecognition's own `onError` doc comment.
   */
  onError?: (error: string) => void;
  onAudioStart?: () => void;
  onAudioEnd?: () => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  /** Auto-stop (and, in continuous mode, auto-restart) a single recognition session if nothing final is recognized within this long. Optional per-provider — a provider with no such concept may ignore it. */
  timeoutMs?: number;
  /** Alternatives requested per result, when the provider supports more than one. A provider that only ever produces one alternative may ignore this. */
  maxAlternatives?: number;
}

/**
 * A running (or startable) speech recognition session. Every method here
 * already exists on useVoiceRecognition's own returned object today —
 * this is that same shape, generalized to not assume a specific engine.
 */
export interface SpeechProvider {
  /** A short, stable, greppable identifier — e.g. "browser-web-speech", "sherpa-onnx". Included in voice diagnostics so a field-test export always shows which engine produced a given session, never ambiguous. */
  readonly providerId: string;
  /** Whether this provider is usable in the CURRENT environment (feature-detected at creation time, never assumed from a browser/UA name check) — mirrors useSpeechRecognitionSupport's own existing discipline. */
  readonly supported: boolean;
  start(): void;
  stop(): void;
  /**
   * Stops the current session and — unlike a fatal error or a deliberate
   * `stop()` — prevents the normal auto-restart from firing while
   * suppressed, WITHOUT flipping "listening" intent off. For TTS
   * self-hearing protection — see useVoiceRecognition.ts's own doc
   * comment on this exact mechanism, which every provider must preserve
   * identically: EyeOnPit's own spoken confirmations must never be
   * re-transcribed as if the operator said them, regardless of which
   * engine is listening.
   */
  suppressForSpeech(): void;
  /** Clears the suppression and, if still in listening intent, resumes immediately. */
  resumeAfterSpeech(): void;
}

/** A provider is created via a factory function taking its options — never a class the caller must `new` directly, so a provider can freely be a closure over engine-specific state (WASM module handles, model references, ...) without leaking that shape into the interface. */
export type SpeechProviderFactory = (options: SpeechProviderOptions) => SpeechProvider;

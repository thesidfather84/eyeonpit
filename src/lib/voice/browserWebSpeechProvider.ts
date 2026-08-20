/**
 * BROWSERWEBSPEECHPROVIDER — the current, production Web Speech engine
 * (`window.SpeechRecognition`/`window.webkitSpeechRecognition`), wrapped
 * behind the SpeechProvider interface (speechProvider.ts).
 *
 * This is a faithful re-expression of `src/hooks/useVoiceRecognition.ts`'s
 * own proven session/restart/backoff logic as a plain, non-hook factory —
 * the exact same behavior (continuous-listening-via-restart, the
 * network-error cap, TTS self-hearing suppression, the one-final-per-
 * session guard), not a redesign. Per explicit instruction, this round
 * does NOT touch `useVoiceRecognition.ts` or wire VoiceControl.tsx to
 * this file — the hook remains the sole thing actually running in
 * production. This file exists so the SpeechProvider interface has one
 * real, working, independently-testable implementation to prove the
 * abstraction against, ahead of a future round that unifies the two (see
 * docs/EYEONPIT_VOICE_ARCHITECTURE.md's own "not done this round" list).
 *
 * Some logical duplication with useVoiceRecognition.ts is the deliberate,
 * lower-risk trade-off here: touching the hook that's actually live in
 * production, without any way to verify the change against real
 * microphone audio in this environment, was explicitly out of scope.
 */
import { getSpeechRecognitionCtor, type SpeechRecognitionLike } from "./speechRecognitionTypes";
import type { SpeechProvider, SpeechProviderOptions, SpeechProviderResult } from "./speechProvider";

export const BROWSER_WEB_SPEECH_PROVIDER_ID = "browser-web-speech";

/** Identical value and rationale to useVoiceRecognition.ts's own FATAL_ERRORS — see that file's doc comment. */
const FATAL_ERRORS = new Set([
  "not-allowed",
  "service-not-allowed",
  "audio-capture",
  "language-not-supported",
  "unsupported",
  "start-failed",
]);

/** Identical value and rationale to useVoiceRecognition.ts's own RESTART_DELAY_MS. */
const RESTART_DELAY_MS = 50;

/** Identical value and rationale to useVoiceRecognition.ts's own MAX_CONSECUTIVE_NETWORK_ERRORS. */
const MAX_CONSECUTIVE_NETWORK_ERRORS = 3;

/**
 * Creates a BrowserWebSpeechProvider instance. `supported` is determined
 * once, at creation time, via the same feature-detection
 * `getSpeechRecognitionCtor()` already uses — never a browser/UA name
 * check.
 */
export function createBrowserWebSpeechProvider(options: SpeechProviderOptions): SpeechProvider {
  const { onFinalResult, onInterimResult, onError, onAudioStart, onAudioEnd, onSpeechStart, onSpeechEnd } = options;
  const timeoutMs = options.timeoutMs ?? 8000;
  const maxAlternatives = options.maxAlternatives ?? 5;

  const supported = getSpeechRecognitionCtor() != null;

  let recognition: SpeechRecognitionLike | null = null;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let restartTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let consumed = false;
  let voiceMode = false;
  let lastError: string | null = null;
  let consecutiveNetworkErrors = 0;
  let suppressed = false;

  function clearTimer() {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
  }

  function clearRestartTimer() {
    if (restartTimeoutHandle) {
      clearTimeout(restartTimeoutHandle);
      restartTimeoutHandle = null;
    }
  }

  function beginSession() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      voiceMode = false;
      onError?.("unsupported");
      return;
    }

    consumed = false;
    lastError = null;
    const session = new Ctor();
    session.continuous = false;
    session.interimResults = true;
    session.maxAlternatives = maxAlternatives;
    session.lang = "en-US";

    session.onstart = () => onAudioStart?.(); // Web Speech has no separate "session started" event distinct from audio capture beginning
    session.onaudiostart = () => onAudioStart?.();
    session.onsoundstart = () => {};
    session.onspeechstart = () => onSpeechStart?.();
    session.onspeechend = () => onSpeechEnd?.();
    session.onsoundend = () => {};
    session.onaudioend = () => onAudioEnd?.();

    session.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      if (!result) return;
      const alternatives: SpeechProviderResult["alternatives"] = [];
      for (let i = 0; i < result.length; i++) {
        const alt = result[i];
        if (!alt) continue;
        alternatives.push({
          transcript: alt.transcript,
          confidence: typeof alt.confidence === "number" && !Number.isNaN(alt.confidence) ? alt.confidence : null,
        });
      }
      const top = alternatives[0];
      if (!top) return;
      const payload: SpeechProviderResult = {
        transcript: top.transcript,
        confidence: top.confidence,
        isFinal: result.isFinal,
        alternatives,
      };
      if (result.isFinal) {
        if (consumed) return; // one command max per native session — see useVoiceRecognition.ts's own doc comment
        consumed = true;
        onFinalResult(payload);
        session.stop();
      } else {
        onInterimResult?.(payload);
      }
    };

    session.onerror = (event) => {
      lastError = event.error;
      onError?.(event.error);
    };

    session.onend = () => {
      clearTimer();
      const error = lastError;
      const wasOn = voiceMode;

      if (error === "network") {
        consecutiveNetworkErrors += 1;
      } else {
        consecutiveNetworkErrors = 0;
      }
      const networkExhausted = consecutiveNetworkErrors >= MAX_CONSECUTIVE_NETWORK_ERRORS;

      if (suppressed) {
        return; // deliberately suppressed for TTS playback — see suppressForSpeech/resumeAfterSpeech below
      }

      const canRestart = wasOn && !(error && FATAL_ERRORS.has(error)) && !networkExhausted;
      if (canRestart) {
        clearRestartTimer();
        restartTimeoutHandle = setTimeout(() => {
          if (voiceMode) beginSession();
        }, RESTART_DELAY_MS);
      } else {
        voiceMode = false;
        if (wasOn && networkExhausted) onError?.("network-unavailable");
      }
    };

    recognition = session;
    try {
      session.start();
      clearTimer();
      timeoutHandle = setTimeout(() => {
        session.stop();
      }, timeoutMs);
    } catch {
      voiceMode = false;
      onError?.("start-failed");
    }
  }

  return {
    providerId: BROWSER_WEB_SPEECH_PROVIDER_ID,
    supported,
    start() {
      voiceMode = true;
      consecutiveNetworkErrors = 0;
      beginSession();
    },
    stop() {
      voiceMode = false;
      clearRestartTimer();
      clearTimer();
      recognition?.stop();
    },
    suppressForSpeech() {
      if (!voiceMode || suppressed) return;
      suppressed = true;
      clearRestartTimer();
      clearTimer();
      recognition?.stop(); // triggers onend, which sees `suppressed` and skips both restart and turning voice mode off
    },
    resumeAfterSpeech() {
      if (!suppressed) return;
      suppressed = false;
      if (voiceMode) beginSession();
    },
  };
}

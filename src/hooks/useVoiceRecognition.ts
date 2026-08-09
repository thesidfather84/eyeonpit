"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSpeechRecognitionCtor, type SpeechRecognitionLike } from "@/lib/voice/speechRecognitionTypes";

export interface VoiceAlternative {
  transcript: string;
  confidence: number | null;
}

export interface VoiceResult {
  /** The top-ranked alternative's transcript — the only one ever checked against the parser. */
  transcript: string;
  /** The top-ranked alternative's confidence — same convenience shortcut as `transcript`. */
  confidence: number | null;
  isFinal: boolean;
  /** Every alternative the engine returned, in its own ranked order — diagnostic-only; dispatch never looks past index 0. */
  alternatives: VoiceAlternative[];
}

/** A lifecycle event with no transcript/error payload of its own — purely "this stage of recognition happened," for the visible diagnostics log. */
export type VoiceLifecycleEvent = "started" | "audio-start" | "sound-start" | "speech-start" | "speech-end" | "sound-end" | "audio-end" | "ended";

export interface UseVoiceRecognitionOptions {
  onFinalResult: (result: VoiceResult) => void;
  onInterimResult?: (result: VoiceResult) => void;
  /**
   * `"unsupported"` (no constructor available), `"start-failed"`
   * (constructor threw on start(), e.g. called twice), verbatim whatever
   * string the browser's own SpeechRecognitionErrorEvent.error carries
   * ("not-allowed", "no-speech", "audio-capture", "network", "aborted",
   * "service-not-allowed", "language-not-supported", or any other value
   * the engine returns), or the one synthetic code this hook itself
   * raises: `"network-unavailable"`, fired instead of (not alongside) a
   * further plain "network" once several consecutive native sessions have
   * all failed the same way — see MAX_CONSECUTIVE_NETWORK_ERRORS. Many
   * Web Speech implementations recognize speech via a remote service, so a
   * genuinely offline device fails with "network" on every single
   * attempt; without this cap, continuous mode would restart into that
   * same wall forever. EyeOnPit is offline-first — the caller's job on
   * seeing this code is to clearly surface "voice unavailable" and let the
   * rest of the investigation carry on through manual controls untouched,
   * never to keep retrying silently. Never translated or dropped here —
   * that's the caller's job for display either way.
   */
  onError?: (error: string) => void;
  onLifecycleEvent?: (event: VoiceLifecycleEvent) => void;
  /** Auto-stop (and, in continuous mode, auto-restart) a single native session if nothing final is recognized within this long. */
  timeoutMs?: number;
  /** Alternatives requested per result — all of them are surfaced via VoiceResult.alternatives for diagnostics, but only alternatives[0] is ever dispatched to a handler. */
  maxAlternatives?: number;
}

export interface UseVoiceRecognitionResult {
  /** True from `start()` until `stop()` or a fatal error — this is "voice mode," not "a native recognition session is literally running this instant." A brief native end-of-utterance between commands is invisible here; the hook transparently begins a fresh session underneath. */
  listening: boolean;
  start: () => void;
  stop: () => void;
}

/**
 * Error codes that must never trigger an automatic restart: a permission
 * refusal, an unsupported browser/language, or a constructor call that
 * itself failed synchronously. Restarting into the same wall repeatedly
 * would do nothing but spam the log (or, for `start-failed`, risk a tight
 * call loop) — these turn continuous listening off and require an explicit
 * new tap. Every other error (`no-speech`, `network`, `aborted`, or no
 * error at all — just an ordinary end of utterance) is treated as
 * transient and safe to restart from while voice mode is still on.
 */
const FATAL_ERRORS = new Set([
  "not-allowed",
  "service-not-allowed",
  "audio-capture",
  "language-not-supported",
  "unsupported",
  "start-failed",
]);

/** Real (non-zero) delay before restarting a fresh native session — never restart synchronously inside onend/onerror. Even a short delay is enough to guarantee this always defers to a later macrotask rather than ever recursing on the same call stack, which is what actually prevents a tight, stack-growing loop if the native engine fails instantly and repeatedly; it doesn't need to be long to do that. */
const RESTART_DELAY_MS = 50;

/**
 * How many *consecutive* "network" failures are tolerated before giving up
 * and firing "network-unavailable" instead of restarting again. A single
 * network error is treated as an ordinary transient blip (worth one retry
 * — a brief connectivity gap can resolve itself), but a genuinely offline
 * device fails the exact same way every time, and this is what turns that
 * into a bounded, fast, clearly-surfaced failure instead of a silent
 * infinite loop. Counts only *consecutive* network errors — any other
 * outcome (a successful result, a different error, or just an ordinary
 * end of utterance) resets it back to zero, so a one-off blip during
 * otherwise-working sessions never accumulates toward this cap.
 */
const MAX_CONSECUTIVE_NETWORK_ERRORS = 3;

/**
 * Continuous-listening wrapper around SpeechRecognition / webkitSpeechRecognition
 * — feature-detected at call time via getSpeechRecognitionCtor(), never
 * assumed from browser/UA sniffing. `continuous: true` is deliberately NOT
 * used: it's notoriously unreliable across Chrome/Safari in practice. Instead,
 * each native session stays `continuous: false` (one utterance, reliable),
 * and this hook restarts a brand-new session immediately after every
 * `onend` for as long as voice mode (`voiceModeRef`) is still on — the
 * standard, safe workaround for the Web Speech API's limitations here. The
 * *only* place that decides "restart or stop for good" is `onend`, never
 * `onerror` — `onend` always fires after an error too, so putting the
 * restart decision in both would risk starting two overlapping sessions
 * for the same error.
 *
 * At most one final result is ever forwarded per native session:
 * `consumedRef` resets at the top of every `beginSession()` call (each
 * restart included), so a spoken command can never be dispatched twice
 * even across a restart.
 */
export function useVoiceRecognition({
  onFinalResult,
  onInterimResult,
  onError,
  onLifecycleEvent,
  timeoutMs = 8000,
  maxAlternatives = 5,
}: UseVoiceRecognitionOptions): UseVoiceRecognitionResult {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consumedRef = useRef(false);
  /** The durable "voice mode" on/off intent — distinct from any single native session's lifecycle. Read inside onend (which fires well after this render) via ref, never React state, so the decision always sees the latest value. */
  const voiceModeRef = useRef(false);
  const lastErrorRef = useRef<string | null>(null);
  /** Consecutive "network" failures across restarts — see MAX_CONSECUTIVE_NETWORK_ERRORS. Reset to 0 by any non-"network" outcome, and explicitly on every deliberate start(). */
  const consecutiveNetworkErrorsRef = useRef(0);
  // Latest callbacks in a ref so `start`/`stop` stay referentially stable
  // across renders regardless of inline arrow functions passed by the
  // caller — avoids recreating (and re-subscribing) the recognition
  // instance's handlers on every VoiceControl render. Written in an effect,
  // not during render, so this is a plain post-render sync rather than a
  // ref mutation the render body itself depends on.
  const callbacksRef = useRef({ onFinalResult, onInterimResult, onError, onLifecycleEvent });
  useEffect(() => {
    callbacksRef.current = { onFinalResult, onInterimResult, onError, onLifecycleEvent };
  });

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const clearRestartTimer = useCallback(() => {
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
  }, []);

  // beginSession needs to call itself (a restart is just another session),
  // but referencing a useCallback's own const binding from inside its own
  // body is flagged by the linter as an uninitialized-at-call-time
  // dependency it can't verify — even though it's actually safe here (the
  // restart only ever fires later, asynchronously, well after this render
  // has assigned the binding). Routing the self-call through a ref sidesteps
  // that without losing anything: same pattern as callbacksRef above, one
  // more indirection purely to satisfy static analysis.
  const beginSessionRef = useRef<() => void>(() => {});

  const beginSession = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      voiceModeRef.current = false;
      setListening(false);
      callbacksRef.current.onError?.("unsupported");
      return;
    }

    consumedRef.current = false;
    lastErrorRef.current = null;
    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = maxAlternatives;
    recognition.lang = "en-US";

    recognition.onstart = () => callbacksRef.current.onLifecycleEvent?.("started");
    recognition.onaudiostart = () => callbacksRef.current.onLifecycleEvent?.("audio-start");
    recognition.onsoundstart = () => callbacksRef.current.onLifecycleEvent?.("sound-start");
    recognition.onspeechstart = () => callbacksRef.current.onLifecycleEvent?.("speech-start");
    recognition.onspeechend = () => callbacksRef.current.onLifecycleEvent?.("speech-end");
    recognition.onsoundend = () => callbacksRef.current.onLifecycleEvent?.("sound-end");
    recognition.onaudioend = () => callbacksRef.current.onLifecycleEvent?.("audio-end");

    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      if (!result) return;
      const alternatives: VoiceAlternative[] = [];
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
      const payload: VoiceResult = {
        transcript: top.transcript,
        confidence: top.confidence,
        isFinal: result.isFinal,
        alternatives,
      };
      if (result.isFinal) {
        if (consumedRef.current) return; // one command max per native session
        consumedRef.current = true;
        callbacksRef.current.onFinalResult(payload);
        // Ends this session promptly once a command's been captured;
        // onend below immediately begins a fresh one while voice mode is
        // still on, ready for the next command with no tap in between.
        recognition.stop();
      } else {
        callbacksRef.current.onInterimResult?.(payload);
      }
    };
    recognition.onerror = (event) => {
      // Recorded for onend to consult, not acted on here — see the
      // function doc comment for why the restart-or-stop decision lives
      // exclusively in onend.
      lastErrorRef.current = event.error;
      callbacksRef.current.onError?.(event.error);
    };
    recognition.onend = () => {
      callbacksRef.current.onLifecycleEvent?.("ended");
      clearTimer();
      const error = lastErrorRef.current;
      // Whether voice mode was actually still on *before* this onend
      // decides anything — guards against firing "network-unavailable"
      // more than once if onend is ever invoked again after voice mode has
      // already been turned off (this specific instance is done either
      // way; nothing should re-decide on its behalf).
      const wasOn = voiceModeRef.current;

      if (error === "network") {
        consecutiveNetworkErrorsRef.current += 1;
      } else {
        consecutiveNetworkErrorsRef.current = 0;
      }
      const networkExhausted = consecutiveNetworkErrorsRef.current >= MAX_CONSECUTIVE_NETWORK_ERRORS;

      const canRestart = wasOn && !(error && FATAL_ERRORS.has(error)) && !networkExhausted;
      if (canRestart) {
        clearRestartTimer();
        restartTimeoutRef.current = setTimeout(() => {
          if (voiceModeRef.current) beginSessionRef.current();
        }, RESTART_DELAY_MS);
      } else {
        voiceModeRef.current = false;
        setListening(false);
        // A distinct, non-looping signal — offline/no network for the
        // speech service, not a permission or browser-support problem —
        // fired exactly once (only on the transition into "given up"),
        // instead of yet another "network" that would just read as "still
        // trying." The investigation itself is completely unaffected: this
        // hook never touches card entry or the ledger.
        if (wasOn && networkExhausted) callbacksRef.current.onError?.("network-unavailable");
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      clearTimer();
      timeoutRef.current = setTimeout(() => {
        recognition.stop();
      }, timeoutMs);
    } catch {
      voiceModeRef.current = false;
      setListening(false);
      callbacksRef.current.onError?.("start-failed");
    }
  }, [clearTimer, clearRestartTimer, timeoutMs, maxAlternatives]);

  useEffect(() => {
    beginSessionRef.current = beginSession;
  }, [beginSession]);

  const start = useCallback(() => {
    voiceModeRef.current = true;
    consecutiveNetworkErrorsRef.current = 0;
    setListening(true);
    beginSession();
  }, [beginSession]);

  const stop = useCallback(() => {
    // Flipped before the native stop() call so the onend it triggers
    // (asynchronously, shortly after) sees voice mode already off and
    // never restarts — this is what makes a deliberate tap-to-stop final.
    voiceModeRef.current = false;
    clearRestartTimer();
    clearTimer();
    recognitionRef.current?.stop();
    setListening(false);
  }, [clearTimer, clearRestartTimer]);

  // Unmount safety: a listening session must never keep running (or keep
  // the microphone open, or schedule a restart) after VoiceControl itself
  // is gone — e.g. the privacy lock engaging, which unmounts the whole
  // live screen.
  useEffect(() => {
    return () => {
      voiceModeRef.current = false;
      clearTimer();
      clearRestartTimer();
      recognitionRef.current?.stop();
    };
  }, [clearTimer, clearRestartTimer]);

  return { listening, start, stop };
}

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
  /** `"unsupported"` (no constructor available), `"start-failed"` (constructor threw on start(), e.g. called twice), or verbatim whatever string the browser's own SpeechRecognitionErrorEvent.error carries ("not-allowed", "no-speech", "audio-capture", "network", "aborted", "service-not-allowed", "language-not-supported", or any other value the engine returns). Never translated or dropped here — that's the caller's job for display. */
  onError?: (error: string) => void;
  onLifecycleEvent?: (event: VoiceLifecycleEvent) => void;
  /** Auto-stop if nothing final is recognized within this long. */
  timeoutMs?: number;
  /** Alternatives requested per result — all of them are surfaced via VoiceResult.alternatives for diagnostics, but only alternatives[0] is ever dispatched to a handler. */
  maxAlternatives?: number;
}

export interface UseVoiceRecognitionResult {
  listening: boolean;
  start: () => void;
  stop: () => void;
}

/**
 * Tap-to-start / tap-to-stop wrapper around SpeechRecognition /
 * webkitSpeechRecognition — feature-detected at call time via
 * getSpeechRecognitionCtor(), never assumed from browser/UA sniffing (some
 * Safari/iOS versions support the prefixed constructor, some don't; this
 * hook doesn't care which — it just checks whether the constructor exists
 * right now). At most one final result is ever forwarded per start() call:
 * some engines fire more than one final SpeechRecognitionResult for a
 * single utterance (or on an internal restart), and consumedRef is the one
 * place that's collapsed down to "one command per listening session," per
 * the beta's safety requirement.
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
  const consumedRef = useRef(false);
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

  const stop = useCallback(() => {
    clearTimer();
    recognitionRef.current?.stop();
  }, [clearTimer]);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      callbacksRef.current.onError?.("unsupported");
      return;
    }

    consumedRef.current = false;
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
        if (consumedRef.current) return; // one command max per listening session
        consumedRef.current = true;
        callbacksRef.current.onFinalResult(payload);
        recognition.stop();
      } else {
        callbacksRef.current.onInterimResult?.(payload);
      }
    };
    recognition.onerror = (event) => {
      callbacksRef.current.onError?.(event.error);
    };
    recognition.onend = () => {
      callbacksRef.current.onLifecycleEvent?.("ended");
      setListening(false);
      clearTimer();
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
      clearTimer();
      timeoutRef.current = setTimeout(() => {
        recognition.stop();
      }, timeoutMs);
    } catch {
      callbacksRef.current.onError?.("start-failed");
    }
  }, [clearTimer, timeoutMs, maxAlternatives]);

  // Unmount safety: a listening session must never keep running (or keep
  // the microphone open) after VoiceControl itself is gone — e.g. the
  // privacy lock engaging, which unmounts the whole live screen.
  useEffect(() => {
    return () => {
      clearTimer();
      recognitionRef.current?.stop();
    };
  }, [clearTimer]);

  return { listening, start, stop };
}

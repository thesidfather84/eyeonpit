"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSpeechRecognitionCtor, type SpeechRecognitionLike } from "@/lib/voice/speechRecognitionTypes";

export interface VoiceResult {
  transcript: string;
  isFinal: boolean;
  confidence: number | null;
}

export interface UseVoiceRecognitionOptions {
  onFinalResult: (result: VoiceResult) => void;
  onInterimResult?: (result: VoiceResult) => void;
  /** `"unsupported"` (no constructor available), `"start-failed"` (constructor threw on start(), e.g. called twice), or whatever string the browser's own SpeechRecognitionErrorEvent.error carries ("not-allowed", "no-speech", "audio-capture", "network", ...). */
  onError?: (error: string) => void;
  /** Auto-stop if nothing final is recognized within this long. */
  timeoutMs?: number;
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
  timeoutMs = 6000,
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
  const callbacksRef = useRef({ onFinalResult, onInterimResult, onError });
  useEffect(() => {
    callbacksRef.current = { onFinalResult, onInterimResult, onError };
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
    recognition.maxAlternatives = 1;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      if (!result) return;
      const alt = result[0];
      if (!alt) return;
      const payload: VoiceResult = {
        transcript: alt.transcript,
        isFinal: result.isFinal,
        confidence: typeof alt.confidence === "number" && !Number.isNaN(alt.confidence) ? alt.confidence : null,
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
  }, [clearTimer, timeoutMs]);

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

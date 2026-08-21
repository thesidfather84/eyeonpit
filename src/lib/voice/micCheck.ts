/**
 * MIC CHECK — pure, provider-independent helpers for the Lab's raw
 * microphone diagnostic tool (src/app/lab/(protected)/mic-check/page.tsx).
 * Deliberately has ZERO dependency on any SpeechProvider (Vosk/Whisper/
 * Sherpa/Browser Web Speech) — this tests the browser's own microphone
 * directly, nothing else. See mic-check page's own doc comment for the
 * full privacy boundary (no upload, no persistence, no export).
 */

/** RMS (root-mean-square) — the standard "average loudness" measure for a chunk of PCM samples in [-1, 1]. */
export function computeRms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) sumSquares += samples[i] * samples[i];
  return Math.sqrt(sumSquares / samples.length);
}

/** Peak absolute amplitude — the loudest single sample in the chunk. */
export function computePeak(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }
  return peak;
}

/**
 * Fixed, documented threshold — not tunable via UI, not a per-device guess.
 * Digital silence/room noise floor on a normalized [-1, 1] float PCM signal
 * typically sits well under 0.01 peak amplitude; ordinary speech at a
 * normal conversational level and mic distance peaks far above this. Used
 * only to distinguish "some real signal reached the mic" from "silence" —
 * never consulted by any parsing/dispatch/safety decision (this tool never
 * produces a CardEvent or a transcript).
 */
export const MIC_CHECK_SIGNAL_PEAK_THRESHOLD = 0.02;

export function isSignalDetected(peak: number): boolean {
  return peak >= MIC_CHECK_SIGNAL_PEAK_THRESHOLD;
}

export type MicPermissionErrorKind = "permission-denied" | "no-device" | "other";

/** Classifies a real getUserMedia() rejection into one of three operator-facing categories — see MIC_CHECK_PERMISSION_DENIED_INSTRUCTIONS/MIC_CHECK_NO_DEVICE_INSTRUCTIONS below for the plain-English text shown for each, never a raw technical error string. */
export function classifyMicPermissionError(message: string): MicPermissionErrorKind {
  if (/NotAllowedError|permission denied|permission dismissed|SecurityError/i.test(message)) return "permission-denied";
  if (/NotFoundError|no microphone|DevicesNotFoundError|OverconstrainedError/i.test(message)) return "no-device";
  return "other";
}

export const MIC_CHECK_PERMISSION_DENIED_INSTRUCTIONS =
  "Microphone access was blocked. Click the camera/microphone icon in your browser's address bar (or your device's Settings > Privacy > Microphone) and allow access for this site, then try again.";

export const MIC_CHECK_NO_DEVICE_INSTRUCTIONS =
  "No microphone was found. Check that a microphone is connected (or the built-in mic is enabled) and try again.";

export const MIC_CHECK_OTHER_ERROR_INSTRUCTIONS = "Could not access the microphone. Try again, or check your device's microphone settings.";

/** The single, simple operator-facing verdict this tool exists to produce — see the page's own "MICROPHONE WORKING ✓ / NO AUDIO DETECTED ✕" requirement. */
export type MicCheckVerdict = "working" | "no-audio" | "permission-denied" | "no-device" | "unsupported" | "checking";

/** Real recording duration for the local playback test — "approximately 2-3 seconds" per instruction. */
export const MIC_CHECK_RECORDING_DURATION_MS = 3000;

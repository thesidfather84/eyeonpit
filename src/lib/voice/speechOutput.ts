/**
 * Minimal abstraction over the Web Speech Synthesis API
 * (`window.speechSynthesis`/`SpeechSynthesisUtterance`) for the one thing
 * EyeOnPit uses it for: a short, read-only spoken confirmation ("Count",
 * "Status" — see lib/voice/spokenSummary.ts) suitable for headset/AirPods
 * use in Floor Mode. This is output only — it has no bearing on speech
 * *recognition* (see useVoiceRecognition/speechRecognitionTypes.ts), and
 * never mutates investigation state; callers build the text from an
 * existing, already-computed CountSnapshot and pass it here purely to be
 * spoken.
 *
 * Feature detection is runtime-only, exactly like
 * getSpeechRecognitionCtor — never a browser/UA name check. Platform
 * reality, documented rather than papered over: browser/PWA speech
 * synthesis support and voice quality vary meaningfully across iOS Safari,
 * Android Chrome, and installed-PWA contexts (iOS in particular has a
 * history of requiring synthesis to be triggered from a direct user
 * gesture, and of inconsistent voice availability shortly after a cold
 * launch). This module does not attempt to work around any of that — it
 * detects support, speaks if available, and reports back via the return
 * value if it could not, so the caller can fail safely (show the same text
 * visually, never block on audio) rather than assume universal support.
 */

interface SpeechSynthesisWindow {
  speechSynthesis?: SpeechSynthesis;
  SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance;
}

export function isSpeechOutputSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as SpeechSynthesisWindow;
  return typeof w.speechSynthesis !== "undefined" && typeof w.SpeechSynthesisUtterance === "function";
}

/**
 * Speaks `text` if speech synthesis is available, returning whether it
 * actually attempted to. Cancels any utterance already queued/speaking
 * first — a second "Count" must never queue up behind a stale one and play
 * both back to back; the newest request always wins. Never throws: a
 * synthesis failure is exactly as safe to ignore as the feature being
 * absent entirely, since this is a convenience readback, never the primary
 * record of anything.
 */
export function speak(text: string): boolean {
  if (!isSpeechOutputSupported()) return false;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

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
 *
 * SELF-HEARING: on a phone with no headset (speaker output + built-in mic),
 * or even with a headset's own mic sometimes picking up its own earpiece
 * bleed, TTS output is otherwise indistinguishable from the operator's own
 * speech to `useVoiceRecognition` — "Hi-Lo minus three" spoken back could
 * be re-transcribed as if the operator had said it. This module doesn't
 * own the recognition session (VoiceControl does, via useVoiceRecognition),
 * so it exposes a tiny pub/sub instead of reaching into that hook directly:
 * `onSpeechStart`/`onSpeechEnd` fire around every utterance this module
 * ever speaks, and VoiceControl subscribes once to suppress/resume its own
 * recognition session accordingly (see VoiceControl.tsx). Every caller of
 * `speak()` — Count, Status, Done's completion summary, Undo, narration
 * confirmations, the new lifecycle commands — is protected by this same
 * one subscription; nothing needs to remember to suppress the mic itself.
 */

type SpeechLifecycleListener = () => void;

const startListeners = new Set<SpeechLifecycleListener>();
const endListeners = new Set<SpeechLifecycleListener>();

/** Subscribes to "an utterance just started playing." Returns an unsubscribe function. */
export function onSpeechStart(listener: SpeechLifecycleListener): () => void {
  startListeners.add(listener);
  return () => startListeners.delete(listener);
}

/** Subscribes to "the utterance finished (or failed) — safe to resume listening." Returns an unsubscribe function. */
export function onSpeechEnd(listener: SpeechLifecycleListener): () => void {
  endListeners.add(listener);
  return () => endListeners.delete(listener);
}

/**
 * "the last thing EyeOnPit actually said" — module-level so it captures
 * every `speak()` call from every caller (VoiceControl's own Count/Status/
 * New Shoe/End Investigation announcements AND useRoundControls' handleDone/
 * handleUndo, which live in a different hook entirely) through the ONE
 * funnel every spoken utterance already passes through. This is what
 * "Repeat" (see parseReadOnlyQuery.ts / VoiceControl.tsx) replays — never a
 * re-execution of whatever command produced the text, just the audio.
 */
let lastSpokenText: string | null = null;

export function getLastSpokenText(): string | null {
  return lastSpokenText;
}

/** Test-only: `lastSpokenText` is module-level (deliberately, see its own doc comment) so it survives across component remounts within a real session — but that same persistence would leak "Repeat" state across unrelated tests sharing this module unless explicitly cleared. Call from a test file's `beforeEach`, never from application code. */
export function resetLastSpokenText(): void {
  lastSpokenText = null;
}

/**
 * Diagnostic instrumentation for speech OUTPUT — real-device field reports
 * showed the (separate) recognition diagnostics log didn't make it obvious
 * whether a promised announcement (e.g. after Done) was actually spoken.
 * Fires around every `speak()` call, PLUS `logSpeechSkipped` for callers
 * that deliberately decide not to call `speak()` at all (voiceAudioFeedback
 * off, floorSpokenCountContent "off") — the skip is just as much a fact
 * worth logging as the speech itself. VoiceControl subscribes once (same
 * pattern as onSpeechStart/onSpeechEnd) and funnels these into its own
 * Debug log; nothing here touches the ordinary, non-debug UI.
 */
export type SpeechDiagnosticEvent =
  | { kind: "speak"; text: string }
  | { kind: "speak-end"; text: string }
  | { kind: "speak-error"; text: string }
  | { kind: "speak-unsupported"; text: string }
  | { kind: "speak-skipped"; reason: string };
type SpeechDiagnosticListener = (event: SpeechDiagnosticEvent) => void;
const diagnosticListeners = new Set<SpeechDiagnosticListener>();

/** Subscribes to speech-output diagnostic events. Returns an unsubscribe function. */
export function onSpeechDiagnostic(listener: SpeechDiagnosticListener): () => void {
  diagnosticListeners.add(listener);
  return () => diagnosticListeners.delete(listener);
}

function emitDiagnostic(event: SpeechDiagnosticEvent): void {
  diagnosticListeners.forEach((listener) => listener(event));
}

/** For a caller that decided NOT to speak (setting-gated) — logs why, without ever calling into speechSynthesis. */
export function logSpeechSkipped(reason: string): void {
  emitDiagnostic({ kind: "speak-skipped", reason });
}

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
 *
 * `onstart`/`onend`/`onerror` always fire the module-level listeners
 * (see the file doc comment) — `onerror` included, so a synthesis failure
 * can never leave a subscriber permanently believing speech is still in
 * progress and the mic permanently suppressed.
 */
export function speak(text: string): boolean {
  lastSpokenText = text;
  if (!isSpeechOutputSupported()) {
    emitDiagnostic({ kind: "speak-unsupported", text });
    return false;
  }
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    emitDiagnostic({ kind: "speak", text });
    utterance.onstart = () => startListeners.forEach((listener) => listener());
    utterance.onend = () => {
      endListeners.forEach((listener) => listener());
      emitDiagnostic({ kind: "speak-end", text });
    };
    utterance.onerror = () => {
      endListeners.forEach((listener) => listener());
      emitDiagnostic({ kind: "speak-error", text });
    };
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    emitDiagnostic({ kind: "speak-error", text });
    return false;
  }
}

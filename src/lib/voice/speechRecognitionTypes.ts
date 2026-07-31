/**
 * Minimal ambient typing for the Web Speech API's SpeechRecognition
 * interface — just the surface useVoiceRecognition actually touches, not
 * the full spec. No `lib.dom` speech types are installed in this project,
 * so this is self-contained rather than pulling in a new dependency for a
 * handful of fields.
 *
 * Feature detection is runtime-only (`window.SpeechRecognition` or
 * `window.webkitSpeechRecognition`), never a browser/UA name check —
 * support varies by engine and version (desktop/Android Chrome and Edge
 * ship the prefixed constructor; some Safari/iOS versions do too, others
 * don't), so the only reliable signal is whether the constructor actually
 * exists on `window` right now.
 */

export interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

export interface SpeechRecognitionResultLike {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}

export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}

export interface SpeechRecognitionErrorEventLike {
  error: string;
}

export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechRecognitionWindow {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
}

/** The one place either global is read. Returns undefined server-side and in any environment (including jsdom by default) where neither constructor exists. */
export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as SpeechRecognitionWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

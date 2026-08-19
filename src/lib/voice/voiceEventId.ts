/**
 * Every spoken utterance (in practice: every native Web Speech recognition
 * session — see useVoiceRecognition's doc comment on why one session is at
 * most one command) gets a single Voice Event ID that every diagnostic line
 * about that utterance carries: ASR lifecycle, every alternative, every
 * normalization/parse/resolve decision, the committed action (or rejection
 * code), active-target before/after, and any TTS spoken back in response.
 * Purely a debugging aid — never read by parsing/dispatch logic itself, and
 * never persisted past the current tab session.
 *
 * Module-level, monotonic, and NEVER reset for the lifetime of the tab —
 * mirrors VoiceControl's own logIdRef counter (see its doc comment): a
 * per-component ref would restart at V-000001 on every remount (e.g. the
 * privacy lock unmounting/remounting the live screen), which would make two
 * genuinely different utterances share an ID within the same field session.
 */
let counter = 0;

/** e.g. "V-000001", "V-000042", "V-123456" — zero-padded to 6 digits, uncapped beyond that width (a field session will never approach 7 digits). */
export function nextVoiceEventId(): string {
  counter += 1;
  return `V-${String(counter).padStart(6, "0")}`;
}

/** Test-only: counter is module-level (deliberately, see above) so it survives across component remounts within a real session — but that same persistence would leak numbering across unrelated tests sharing this module unless explicitly cleared. Call from a test file's `beforeEach`, never from application code. */
export function resetVoiceEventIdCounterForTests(): void {
  counter = 0;
}

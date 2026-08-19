/**
 * Exact-phrase investigation-lifecycle and note-dictation trigger words —
 * extracted from VoiceControl.tsx so classifyVoiceTranscript.ts (the N-best
 * resolver's per-alternative classifier) can recognize exactly the same
 * vocabulary VoiceControl itself dispatches on, from one shared source
 * instead of two copies that could silently drift apart. VoiceControl.tsx
 * still owns all the STATEFUL behavior around these phrases (pending
 * confirmation, note-mode capture) — this file is just the phrase table.
 */

/** Deliberately as strict/exact as every other command word in this file, no fuzzy matching. */
export const NOTE_START_PHRASES = new Set(["start note", "note"]);
export const NOTE_END_PHRASE = "end note";
export const NOTE_CANCEL_PHRASE = "cancel note";
/** Matched on the raw transcript (not normalized) so the captured remainder keeps original wording/casing. */
export const NOTE_START_WITH_CONTENT_RE = /^\s*start\s+note[.,!?]?\s+(.+)$/i;

export const PAUSE_PHRASE = "pause investigation";
export const RESUME_PHRASE = "resume investigation";
export const START_COUNT_PHRASE = "start count";
export const END_COUNT_PHRASE = "end count";
export const NEW_SHOE_PHRASE = "new shoe";
export const CONFIRM_NEW_SHOE_PHRASE = "confirm new shoe";
export const END_INVESTIGATION_PHRASE = "end investigation";
export const CONFIRM_END_INVESTIGATION_PHRASE = "confirm end investigation";
export const FULL_STATUS_PHRASE = "full status";

import { normalizeTranscript } from "./normalizeTranscript";

export type VoiceRank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10";
export type VoiceSeat = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type VoiceCommandKind =
  | { kind: "select-seat"; seat: VoiceSeat }
  | { kind: "select-dealer" }
  | { kind: "card"; rank: VoiceRank }
  | { kind: "done" }
  | { kind: "next" }
  | { kind: "undo" };

export interface ParsedVoiceCommand {
  raw: string;
  normalized: string;
  /** null means "no action" — every caller must treat an unrecognized or ambiguous transcript identically: do nothing. */
  command: VoiceCommandKind | null;
}

const SEAT_PHRASES: Record<string, VoiceSeat> = {
  "seat one": 1,
  "seat two": 2,
  "seat three": 3,
  "seat four": 4,
  "seat five": 5,
  "seat six": 6,
  "seat seven": 7,
  "seat 1": 1,
  "seat 2": 2,
  "seat 3": 3,
  "seat 4": 4,
  "seat 5": 5,
  "seat 6": 6,
  "seat 7": 7,
};

/** jack/queen/king all resolve to the same "10" CardEntryPad itself produces for any ten-value card — see CardEntryPad's own RANKS list, which never offers J/Q/K as separate buttons. */
const RANK_WORDS: Record<string, VoiceRank> = {
  ace: "A",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  jack: "10",
  queen: "10",
  king: "10",
};

const WORKFLOW_WORDS: Record<string, "done" | "next" | "undo"> = {
  done: "done",
  next: "next",
  undo: "undo",
};

/**
 * Strict, deterministic, exact-phrase lookup — no fuzzy matching, no
 * partial credit, no free-form/NLP parsing. A normalized transcript either
 * equals exactly one lexicon entry or `command` comes back null; there is
 * no third outcome. Because every seat phrase starts with the literal word
 * "seat" and every card/workflow word is looked up as a whole normalized
 * string (not tokenized), "seat two" and "two" can never collide even
 * though "two" alone is a valid card word — the full phrase is the key.
 */
export function parseVoiceCommand(rawTranscript: string): ParsedVoiceCommand {
  const normalized = normalizeTranscript(rawTranscript);

  if (normalized === "dealer") {
    return { raw: rawTranscript, normalized, command: { kind: "select-dealer" } };
  }
  if (normalized in SEAT_PHRASES) {
    return { raw: rawTranscript, normalized, command: { kind: "select-seat", seat: SEAT_PHRASES[normalized] } };
  }
  if (normalized in RANK_WORDS) {
    return { raw: rawTranscript, normalized, command: { kind: "card", rank: RANK_WORDS[normalized] } };
  }
  if (normalized in WORKFLOW_WORDS) {
    return { raw: rawTranscript, normalized, command: { kind: WORKFLOW_WORDS[normalized] } };
  }
  return { raw: rawTranscript, normalized, command: null };
}

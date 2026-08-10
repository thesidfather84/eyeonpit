import type { CountingSystem } from "@/types/investigation";

/**
 * A bounded, deterministic recognizer for NATURAL read-only questions —
 * "What is the count?", "What's the KO?", "How many aces?" — that sits
 * ahead of narration/mutation parsing (see VoiceControl.tsx's
 * handleFinalResult): speech -> normalize -> THIS -> narration/mutation ->
 * otherwise reject. Every phrase here is matched as an exact, whole-
 * transcript string against the already-normalized (lowercased, trimmed,
 * trailing-punctuation-stripped) input — the identical exact-match
 * discipline WORKFLOW_WORDS/SEAT_PHRASES already use in
 * parseVoiceCommand.ts, not fuzzy/semantic matching and not an LLM. Being
 * read-only is what earns this layer more natural flexibility than the
 * mutation parser is allowed: a wrong match here can only ever answer a
 * question incorrectly, never write a CardEvent, so a broader phrase set
 * is safe here in a way it explicitly is NOT for card/target words (see
 * parseNarration.ts's own doc comments on why that parser stays strict).
 *
 * A transcript that isn't in one of these tables returns null — the
 * caller falls through to narration/legacy dispatch exactly as before.
 * This module makes no defaults-based guesses ("sounds like a question, so
 * treat it as one"): every recognized phrase is an explicit table entry.
 */
export type ReadOnlyQuery =
  | { kind: "status" }
  | { kind: "system"; system: CountingSystem }
  | { kind: "rc" }
  | { kind: "tc" }
  | { kind: "aces" }
  | { kind: "decks" }
  | { kind: "repeat" };

/** Real captured-log phrase ("what is the count") plus its natural siblings — see the operator-loop correction's own list. */
const STATUS_PHRASES = new Set([
  "status",
  "count",
  "what is the count",
  "whats the count",
  "what's the count",
  "give me the count",
  "tell me the count",
  "current count",
  "where is the count",
]);

/** Bare and lightly-prefixed system-name words. Combined with QUESTION_PREFIXES below into the full SYSTEM_PHRASES table — never hand-duplicated per phrasing. */
const SYSTEM_NAME_WORDS: Record<string, CountingSystem> = {
  "hi lo": "Hi-Lo",
  "hi-lo": "Hi-Lo",
  "high low": "Hi-Lo",
  ko: "KO",
  "k o": "KO",
  zen: "Zen",
  omega: "Omega II",
  "omega two": "Omega II",
  "omega ii": "Omega II",
  "omega 2": "Omega II",
};

/** "", "what is the ", "what's the ", ... — prepended to every system-name word (and to "count"/aces/decks phrasing elsewhere) so one phrasing list covers "KO?", "What is the KO?", "What's the KO?" etc. without hand-listing every combination. */
const QUESTION_PREFIXES = ["", "what is the ", "what's the ", "whats the ", "what is ", "what's ", "whats ", "where is the "];

const SYSTEM_PHRASES: Record<string, CountingSystem> = {};
for (const prefix of QUESTION_PREFIXES) {
  for (const [word, system] of Object.entries(SYSTEM_NAME_WORDS)) {
    SYSTEM_PHRASES[`${prefix}${word}`] = system;
  }
}

const RC_PHRASES = new Set([
  "rc",
  "running count",
  "what is the running count",
  "what's the running count",
  "whats the running count",
  "current running count",
]);

const TC_PHRASES = new Set([
  "tc",
  "true count",
  "what is the true count",
  "what's the true count",
  "whats the true count",
  "current true count",
]);

const ACES_PHRASES = new Set([
  "aces",
  "how many aces",
  "aces seen",
  "how many aces did i see",
  "how many aces have i seen",
]);

const DECKS_PHRASES = new Set([
  "decks",
  "decks remaining",
  "decks left",
  "how many decks left",
  "how many decks are left",
  "how many decks remaining",
]);

const REPEAT_PHRASES = new Set(["repeat", "repeat that", "say that again"]);

export function parseReadOnlyQuery(normalized: string): ReadOnlyQuery | null {
  if (STATUS_PHRASES.has(normalized)) return { kind: "status" };
  if (normalized in SYSTEM_PHRASES) return { kind: "system", system: SYSTEM_PHRASES[normalized] };
  if (RC_PHRASES.has(normalized)) return { kind: "rc" };
  if (TC_PHRASES.has(normalized)) return { kind: "tc" };
  if (ACES_PHRASES.has(normalized)) return { kind: "aces" };
  if (DECKS_PHRASES.has(normalized)) return { kind: "decks" };
  if (REPEAT_PHRASES.has(normalized)) return { kind: "repeat" };
  return null;
}

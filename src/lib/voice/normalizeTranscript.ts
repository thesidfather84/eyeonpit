/**
 * Lowercase, collapse internal whitespace, and turn any run of sentence
 * punctuation into a single space — trailing ("seat one." / "dealer!") AND
 * mid-utterance (a comma between clauses: "player one has a seven, player
 * three has a five"). A comma left attached to the word before it ("seven,")
 * would otherwise fail every exact-word lookup downstream (RANK_WORDS,
 * SEAT_NUMBER_BY_WORD, ...), silently turning a real card into an
 * unrecognized noise token — this is what makes multi-clause narration
 * ("X has a seven, Y has a five") tokenize correctly. Nothing fuzzier: the
 * parser that consumes this is exact-match only.
 */
export function normalizeTranscript(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.,!?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

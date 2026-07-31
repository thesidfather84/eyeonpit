/** Lowercase, trim, collapse internal whitespace, drop a single trailing sentence-ending punctuation mark — some engines append one ("seat one." / "dealer!"). Nothing fuzzier: the parser that consumes this is exact-match only. */
export function normalizeTranscript(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[.,!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

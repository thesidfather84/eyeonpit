// EyeOnPit 1.13a — Active Pack / Deck Configuration Accuracy (AGENTS.md),
// CASE L: legacy/corrupted persisted configuration must never fabricate an
// active-pack size unrelated to the record's own format. Before this fix,
// a record missing `shoeTotalDecks` always recovered as `DEFAULT_GAME_CONFIG
// .deckCount` (6) regardless of `blackjackFormat` — a damaged single/double
// -deck record would silently become a 6-deck shoe. The fallback must be
// derived from the record's own (already-normalized) format instead.
import { describe, expect, it } from "vitest";
import { normalizeInvestigation } from "./normalizeInvestigation";

describe("normalizeInvestigation — shoeTotalDecks fallback is format-aware, never a blanket shoe default", () => {
  it("a single-deck record missing shoeTotalDecks recovers to 1 active deck, not 6", () => {
    const { investigation } = normalizeInvestigation({ blackjackFormat: "single-deck" });
    expect(investigation.blackjackFormat).toBe("single-deck");
    expect(investigation.shoeTotalDecks).toBe(1);
  });

  it("a double-deck record missing shoeTotalDecks recovers to 2 active decks, not 6", () => {
    const { investigation } = normalizeInvestigation({ blackjackFormat: "double-deck" });
    expect(investigation.blackjackFormat).toBe("double-deck");
    expect(investigation.shoeTotalDecks).toBe(2);
  });

  it("a shoe-format record missing shoeTotalDecks still recovers to the sensible 6-deck default (unchanged behavior — no way to know the operator's real choice)", () => {
    const { investigation } = normalizeInvestigation({ blackjackFormat: "shoe" });
    expect(investigation.shoeTotalDecks).toBe(6);
  });

  it("a record missing BOTH blackjackFormat and shoeTotalDecks recovers to the shoe default (DEFAULT_GAME_CONFIG), never an arbitrary unrelated number", () => {
    const { investigation } = normalizeInvestigation({});
    expect(investigation.blackjackFormat).toBe("shoe");
    expect(investigation.shoeTotalDecks).toBe(6);
    expect(investigation.shoeTotalDecks).not.toBe(5);
  });

  it("an explicit, well-formed shoeTotalDecks is always preserved exactly, regardless of format", () => {
    const { investigation } = normalizeInvestigation({ blackjackFormat: "single-deck", shoeTotalDecks: 1 });
    expect(investigation.shoeTotalDecks).toBe(1);

    const { investigation: shoeInv } = normalizeInvestigation({ blackjackFormat: "shoe", shoeTotalDecks: 8 });
    expect(shoeInv.shoeTotalDecks).toBe(8);
  });

  it("a malformed (non-numeric) shoeTotalDecks on a single-deck record still recovers to 1, not 6", () => {
    const { investigation } = normalizeInvestigation({ blackjackFormat: "single-deck", shoeTotalDecks: "two" });
    expect(investigation.shoeTotalDecks).toBe(1);
  });
});

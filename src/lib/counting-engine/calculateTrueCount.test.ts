import { describe, expect, it } from "vitest";
import {
  MIN_DECKS_REMAINING,
  calculateTrueCount,
  computeCardsRemaining,
  computeDecksRemaining,
  roundTrueCountForDisplay,
} from "./calculateTrueCount";

describe("computeDecksRemaining", () => {
  it("equals shoeTotalDecks exactly at zero cards exposed", () => {
    expect(computeDecksRemaining(6, 0)).toBe(6);
  });

  it("is an exact continuous fraction, not rounded to a half-deck grid", () => {
    expect(computeDecksRemaining(6, 26)).toBeCloseTo(5.5, 10);
    expect(computeDecksRemaining(6, 13)).toBeCloseTo(5.75, 10);
  });

  it("never goes below the documented minimum divisor near the end of a shoe", () => {
    expect(computeDecksRemaining(6, 6 * 52)).toBe(MIN_DECKS_REMAINING);
    expect(computeDecksRemaining(6, 6 * 52 + 40)).toBe(MIN_DECKS_REMAINING);
    expect(computeDecksRemaining(1, 51)).toBeGreaterThan(0);
  });
});

describe("computeCardsRemaining", () => {
  it("equals totalDecks*52 exactly at zero cards exposed", () => {
    expect(computeCardsRemaining(1, 0)).toBe(52);
    expect(computeCardsRemaining(6, 0)).toBe(312);
    expect(computeCardsRemaining(8, 0)).toBe(416);
  });

  it("the alternating-pitch acceptance case: 1 active deck, 26 observed -> 26 remaining, never 78", () => {
    expect(computeCardsRemaining(1, 26)).toBe(26);
    expect(computeCardsRemaining(1, 26)).not.toBe(78);
  });

  it("is never distorted by computeDecksRemaining's MIN_DECKS_REMAINING floor", () => {
    // 51 of 52 cards exposed: 1 card physically remains, even though
    // computeDecksRemaining floors the TC divisor at 0.25 decks (13 cards).
    expect(computeCardsRemaining(1, 51)).toBe(1);
    expect(computeDecksRemaining(1, 51)).toBe(MIN_DECKS_REMAINING);
  });

  it("floors at 0, never goes negative", () => {
    expect(computeCardsRemaining(1, 60)).toBe(0);
  });
});

describe("calculateTrueCount", () => {
  it("returns null for KO (unbalanced) regardless of running count or decks remaining", () => {
    expect(calculateTrueCount("KO", 12, 3)).toBeNull();
    expect(calculateTrueCount("KO", 0, 6)).toBeNull();
    expect(calculateTrueCount("KO", -20, 0.25)).toBeNull();
  });

  it("returns the exact, unrounded division for balanced systems", () => {
    expect(calculateTrueCount("Hi-Lo", 3, 5)).toBeCloseTo(0.6, 10);
    expect(calculateTrueCount("Hi-Lo", 1, 3)).toBeCloseTo(1 / 3, 10);
    expect(calculateTrueCount("Zen", 6, 4)).toBeCloseTo(1.5, 10);
    expect(calculateTrueCount("Omega II", -5, 2)).toBeCloseTo(-2.5, 10);
  });

  it("never returns NaN even at the minimum-divisor floor", () => {
    const tc = calculateTrueCount("Hi-Lo", 4, MIN_DECKS_REMAINING);
    expect(Number.isNaN(tc)).toBe(false);
    expect(Number.isFinite(tc as number)).toBe(true);
  });
});

describe("roundTrueCountForDisplay — the one rounding policy, applied only at display time", () => {
  it("passes null through unchanged", () => {
    expect(roundTrueCountForDisplay(null)).toBeNull();
  });

  it("rounds to one decimal place", () => {
    expect(roundTrueCountForDisplay(0.6)).toBe(0.6);
    expect(roundTrueCountForDisplay(1 / 3)).toBe(0.3);
    expect(roundTrueCountForDisplay(2.449)).toBe(2.4);
  });

  it("rounds half away from zero, symmetrically for positive and negative", () => {
    expect(roundTrueCountForDisplay(0.25)).toBe(0.3);
    expect(roundTrueCountForDisplay(-0.25)).toBe(-0.3);
    expect(roundTrueCountForDisplay(1.05)).toBe(1.1);
    expect(roundTrueCountForDisplay(-1.05)).toBe(-1.1);
  });

  it("zero remains numeric zero, not null or a string", () => {
    expect(roundTrueCountForDisplay(0)).toBe(0);
  });
});

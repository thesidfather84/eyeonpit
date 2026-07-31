import { describe, expect, it } from "vitest";
import { COUNT_TAGS, initialRunningCount, isBalancedSystem, tagValue } from "./countTags";
import type { CountingSystem, Rank } from "./types";

const TEN_RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

describe("tag tables — every rank, every system, exact mandated values", () => {
  it("Hi-Lo", () => {
    const expected: Record<Rank, number> = {
      A: -1, "2": 1, "3": 1, "4": 1, "5": 1, "6": 1, "7": 0, "8": 0, "9": 0, "10": -1,
      J: -1, Q: -1, K: -1,
    };
    for (const rank of TEN_RANKS) expect(tagValue("Hi-Lo", rank)).toBe(expected[rank]);
  });

  it("KO", () => {
    const expected: Record<Rank, number> = {
      A: -1, "2": 1, "3": 1, "4": 1, "5": 1, "6": 1, "7": 1, "8": 0, "9": 0, "10": -1,
      J: -1, Q: -1, K: -1,
    };
    for (const rank of TEN_RANKS) expect(tagValue("KO", rank)).toBe(expected[rank]);
  });

  it("Zen", () => {
    const expected: Record<Rank, number> = {
      A: -1, "2": 1, "3": 1, "4": 2, "5": 2, "6": 2, "7": 1, "8": 0, "9": 0, "10": -2,
      J: -2, Q: -2, K: -2,
    };
    for (const rank of TEN_RANKS) expect(tagValue("Zen", rank)).toBe(expected[rank]);
  });

  it("Omega II", () => {
    const expected: Record<Rank, number> = {
      A: 0, "2": 1, "3": 1, "4": 2, "5": 2, "6": 2, "7": 1, "8": 0, "9": -1, "10": -2,
      J: -2, Q: -2, K: -2,
    };
    for (const rank of TEN_RANKS) expect(tagValue("Omega II", rank)).toBe(expected[rank]);
  });

  it("J, Q, K always carry the exact same tag as 10, every system", () => {
    const systems: CountingSystem[] = ["Hi-Lo", "KO", "Zen", "Omega II"];
    for (const system of systems) {
      const tenTag = tagValue(system, "10");
      expect(tagValue(system, "J")).toBe(tenTag);
      expect(tagValue(system, "Q")).toBe(tenTag);
      expect(tagValue(system, "K")).toBe(tenTag);
    }
  });
});

const RANK_COUNTS_PER_DECK: Record<Rank, number> = {
  A: 4, "2": 4, "3": 4, "4": 4, "5": 4, "6": 4, "7": 4, "8": 4, "9": 4, "10": 16,
  J: 0, Q: 0, K: 0, // "10" already represents every ten-value card, per the app's entry convention
};

function sumOverFullDeck(system: CountingSystem): number {
  let sum = 0;
  for (const rank of TEN_RANKS) sum += tagValue(system, rank) * RANK_COUNTS_PER_DECK[rank];
  return sum;
}

describe("full-deck balance", () => {
  it("Hi-Lo returns 0 after a complete standard deck", () => {
    expect(sumOverFullDeck("Hi-Lo")).toBe(0);
  });

  it("Zen returns 0 after a complete standard deck", () => {
    expect(sumOverFullDeck("Zen")).toBe(0);
  });

  it("Omega II returns 0 after a complete standard deck", () => {
    expect(sumOverFullDeck("Omega II")).toBe(0);
  });

  it("KO demonstrates its documented unbalanced result (+4 per deck)", () => {
    expect(sumOverFullDeck("KO")).toBe(4);
  });
});

describe("isBalancedSystem / initialRunningCount", () => {
  it("only KO is unbalanced", () => {
    expect(isBalancedSystem("Hi-Lo")).toBe(true);
    expect(isBalancedSystem("KO")).toBe(false);
    expect(isBalancedSystem("Zen")).toBe(true);
    expect(isBalancedSystem("Omega II")).toBe(true);
  });

  it("balanced systems always start at 0 regardless of decks in play", () => {
    expect(initialRunningCount("Hi-Lo", 1)).toBe(0);
    expect(initialRunningCount("Hi-Lo", 8)).toBe(0);
    expect(initialRunningCount("Zen", 6)).toBe(0);
    expect(initialRunningCount("Omega II", 6)).toBe(0);
  });

  it("KO seeds -4 x (decksInPlay - 1)", () => {
    expect(initialRunningCount("KO", 1)).toBe(0);
    expect(initialRunningCount("KO", 6)).toBe(-20);
    expect(initialRunningCount("KO", 8)).toBe(-28);
  });
});

it("COUNT_TAGS is exhaustive over every Rank for every CountingSystem (no accidental gaps)", () => {
  const systems: CountingSystem[] = ["Hi-Lo", "KO", "Zen", "Omega II"];
  const allRanks: Rank[] = [...TEN_RANKS, "J", "Q", "K"];
  for (const system of systems) {
    for (const rank of allRanks) {
      expect(typeof COUNT_TAGS[system][rank]).toBe("number");
      expect(Number.isFinite(COUNT_TAGS[system][rank])).toBe(true);
    }
  }
});

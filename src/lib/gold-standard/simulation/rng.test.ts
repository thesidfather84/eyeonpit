import { describe, expect, it } from "vitest";
import { SeededRng, buildShuffledShoe, mulberry32 } from "./rng";

describe("mulberry32 / SeededRng determinism", () => {
  it("the same seed produces the exact same sequence every time", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("different seeds produce different sequences", () => {
    const a = new SeededRng(1);
    const b = new SeededRng(2);
    expect(a.float()).not.toBe(b.float());
  });

  it("float() stays within [0, 1)", () => {
    const rng = new SeededRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.float();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("buildShuffledShoe", () => {
  it("produces exactly deckCount * 52 cards, 4 of each of the 13 ranks per deck", () => {
    const shoe = buildShuffledShoe(6, new SeededRng(1));
    expect(shoe).toHaveLength(6 * 52);
    const counts: Record<string, number> = {};
    for (const rank of shoe) counts[rank] = (counts[rank] ?? 0) + 1;
    for (const rank of ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]) {
      expect(counts[rank]).toBe(24); // 4 * 6 decks
    }
  });

  it("the same seed produces the exact same shoe order every time", () => {
    const a = buildShuffledShoe(2, new SeededRng(99));
    const b = buildShuffledShoe(2, new SeededRng(99));
    expect(a).toEqual(b);
  });

  it("different seeds produce different shoe orders", () => {
    const a = buildShuffledShoe(2, new SeededRng(1));
    const b = buildShuffledShoe(2, new SeededRng(2));
    expect(a).not.toEqual(b);
  });
});

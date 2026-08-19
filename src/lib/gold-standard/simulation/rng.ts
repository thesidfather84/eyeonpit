import type { Rank } from "@/lib/counting-engine/types";

/**
 * Deterministic seeded randomness for the Simulation Engine (Priority B7).
 * Uses mulberry32, the same small, well-known, public-domain PRNG (Tommy
 * Ettinger) already relied on by lib/counting-engine/validation/rng.ts —
 * NOT imported from there (that module is explicitly test-only and never
 * imported by production code, per its own doc comment) but reproduced
 * here as its own independent, equally hand-reviewable copy, since the
 * algorithm itself is a well-known public-domain reference, not something
 * this file invents. Given the same 32-bit integer seed, `mulberry32(seed)`
 * produces the exact same infinite sequence every time — the entire basis
 * for Priority B6's "same seed + same scenario + same simulator version =>
 * same result" reproducibility requirement.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function nextFloat(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SeededRng {
  private readonly next: () => number;

  constructor(seed: number) {
    this.next = mulberry32(seed);
  }

  float(): number {
    return this.next();
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  /** Fisher-Yates, in place — the standard unbiased shuffle. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }
}

const ALL_RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

/**
 * Builds one shuffled shoe's worth of ranks with the REAL physical
 * composition of `deckCount` standard 52-card decks: 4 copies per deck of
 * each of the 13 ranks (J/Q/K kept distinct from "10", matching
 * exactComposition.ts's own model of a real shoe) — not a uniform pick
 * among fewer labels, which would misrepresent the true relative frequency
 * of ten-value cards.
 */
export function buildShuffledShoe(deckCount: number, rng: SeededRng): Rank[] {
  const pool: Rank[] = [];
  for (let d = 0; d < deckCount; d++) {
    for (const rank of ALL_RANKS) {
      for (let i = 0; i < 4; i++) pool.push(rank);
    }
  }
  return rng.shuffle(pool);
}

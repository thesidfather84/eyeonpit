/**
 * TEST-ONLY. Deterministic seeded randomness for the mass-validation
 * harness (see simulator.ts) — never imported by production code.
 *
 * Uses mulberry32, a small, well-known, public-domain PRNG (Tommy Ettinger)
 * chosen specifically because its entire body is a few lines of bit
 * arithmetic that can be read and verified by eye — there is no dependency
 * on Node's crypto/random APIs, and no external package. Given the same
 * 32-bit integer seed, `mulberry32(seed)` produces the exact same infinite
 * sequence of floats in [0, 1) every time, on every machine, forever — that
 * determinism is the entire point: a failing simulation must be exactly
 * reproducible from nothing but its seed.
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

/** Thin, deliberately small helper surface over a raw `() => number` generator — every method here is a direct, obvious transformation of that one primitive, nothing more. */
export class SeededRng {
  private readonly next: () => number;

  constructor(seed: number) {
    this.next = mulberry32(seed);
  }

  /** Float in [0, 1). */
  float(): number {
    return this.next();
  }

  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  /** Integer in [min, max] inclusive. */
  intBetween(min: number, max: number): number {
    return min + this.int(max - min + 1);
  }

  /** One uniformly-random element of a non-empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("SeededRng.pick: items must be non-empty.");
    return items[this.int(items.length)];
  }

  /** True with the given probability (0..1). */
  chance(probability: number): boolean {
    return this.next() < probability;
  }

  /** Fisher-Yates, in place, driven entirely by this generator — the standard unbiased shuffle, written out in full rather than imported, so it stays inside the "small and hand-reviewable" boundary this whole module holds itself to. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }
}

/** The 10 rank labels EyeOnPit's own card entry ever actually produces — J/Q/K always normalize to "10" before a card reaches the ledger (see CardEntryPad / lib/voice/parseVoiceCommand.ts's RANK_WORDS) — so the harness only ever generates what the real app could ever really record. */
export const ENTRY_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"] as const;
export type EntryRank = (typeof ENTRY_RANKS)[number];

/**
 * Builds one shuffled shoe's worth of ranks with the real physical
 * composition of `deckCount` standard 52-card decks: 4 copies per deck of
 * each of A/2/3/4/5/6/7/8/9, and 16 copies per deck of "10" (10, J, Q, K —
 * four ten-value ranks x 4 suits — collapsed to the single "10" label the
 * app itself always records). A 6-deck shoe therefore yields exactly 312
 * cards (6 x 52), of which 96 are "10" (6 x 16) — real deck math, not a
 * uniform pick among 10 labels, which would over-represent low/ace cards
 * relative to a real shoe.
 */
export function buildShuffledShoePool(deckCount: number, rng: SeededRng): EntryRank[] {
  const pool: EntryRank[] = [];
  for (let d = 0; d < deckCount; d++) {
    for (const rank of ["A", "2", "3", "4", "5", "6", "7", "8", "9"] as const) {
      for (let i = 0; i < 4; i++) pool.push(rank);
    }
    for (let i = 0; i < 16; i++) pool.push("10");
  }
  return rng.shuffle(pool);
}

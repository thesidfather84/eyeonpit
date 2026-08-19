import type { CardEvent } from "@/lib/counting-engine/types";
import { activeEventsInOrder } from "@/lib/counting-engine/calculateCounts";
import type { Rank } from "@/lib/counting-engine/types";

/**
 * PRIORITY B5 — a pure, deterministic exact-composition model: the exact
 * remaining count of every one of the 13 ranks in the shoe, derived from a
 * configured shoe size and the real CardEvent ledger. This is RESEARCH
 * INFRASTRUCTURE for the Simulation Lab (Priority B6/B7 — e.g. computing a
 * true expected-value shift late in a shoe from the ACTUAL remaining
 * composition rather than a count-implied approximation) — it is explicitly
 * NOT a replacement for, alternative to, or input into the trusted running
 * count/true-count ledger in lib/counting-engine, which this file only
 * ever READS (via `activeEventsInOrder`, the exact same dedup/ordering
 * helper the engine's own `calculateCountSnapshot` uses, so this can never
 * disagree with the engine about which events are actually active).
 */

export type RankComposition = Record<Rank, number>;

const ALL_RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

/** How many of each rank a full N-deck shoe starts with — 4 per rank per deck, matching the standard 52-card deck (4 suits x 13 ranks). */
export function freshShoeComposition(deckCount: number): RankComposition {
  const composition = {} as RankComposition;
  for (const rank of ALL_RANKS) composition[rank] = 4 * deckCount;
  return composition;
}

/**
 * The exact remaining composition after every ACTIVE (non-undone, non-void)
 * card in `cardEvents` for the given shoe has been removed from a fresh
 * `deckCount`-deck shoe. Deterministic and pure — same inputs, same output,
 * always; never reads live app state beyond what's passed in.
 */
export function computeExactComposition(cardEvents: CardEvent[], shoeNumber: number, deckCount: number): RankComposition {
  const composition = freshShoeComposition(deckCount);
  const active = activeEventsInOrder(cardEvents).filter((e) => e.shoeNumber === shoeNumber);
  for (const event of active) {
    composition[event.rank] = Math.max(0, composition[event.rank] - 1);
  }
  return composition;
}

export function totalCardsRemaining(composition: RankComposition): number {
  return ALL_RANKS.reduce((sum, rank) => sum + composition[rank], 0);
}

/**
 * Card-conservation check — every rank's remaining count must be between 0
 * and its fresh-shoe count, and the total remaining must never exceed the
 * fresh-shoe total. Returns a list of human-readable violations (empty if
 * none) rather than a boolean, so a caller (tests, the Simulation Engine's
 * own validation — Priority B7) gets an actionable diagnosis, not just a
 * failed assertion.
 */
export function validateCardConservation(composition: RankComposition, deckCount: number): string[] {
  const violations: string[] = [];
  const maxPerRank = 4 * deckCount;
  for (const rank of ALL_RANKS) {
    const count = composition[rank];
    if (count < 0) violations.push(`${rank}: negative remaining count (${count}).`);
    if (count > maxPerRank) violations.push(`${rank}: remaining count (${count}) exceeds fresh-shoe maximum (${maxPerRank}).`);
  }
  return violations;
}

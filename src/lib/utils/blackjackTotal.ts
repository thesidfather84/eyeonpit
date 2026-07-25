import type { CardCode } from "@/types/investigation";

export interface HandTotal {
  value: number;
  /** True when an ace is currently counted as 11. */
  soft: boolean;
  bust: boolean;
}

const RANK_VALUES: Record<CardCode["rank"], number> = {
  A: 11,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 10,
  Q: 10,
  K: 10,
};

/**
 * Computes the best blackjack total for a set of cards, preferring a soft
 * total (ace = 11) whenever it doesn't bust. Never stored — always derived
 * from whichever cards are currently visible, so it can't drift out of sync
 * with the actual card entries.
 */
export function computeHandTotal(cards: CardCode[]): HandTotal {
  let total = 0;
  let aces = 0;

  for (const card of cards) {
    total += RANK_VALUES[card.rank];
    if (card.rank === "A") aces += 1;
  }

  let acesAsEleven = aces;
  while (total > 21 && acesAsEleven > 0) {
    total -= 10;
    acesAsEleven -= 1;
  }

  return {
    value: total,
    soft: acesAsEleven > 0 && total <= 21,
    bust: total > 21,
  };
}

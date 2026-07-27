import type { CardCode, DealerHand, DealerResult } from "@/types/investigation";

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

/** Every card in a dealer hand is observed and visible the moment it's entered — no hidden/hole-card concept. Kept as its own function so call sites don't need to know the field name. */
export function dealerVisibleCards(dealerHand: DealerHand): CardCode[] {
  return dealerHand.cards;
}

/** Blackjack auto-detected from exactly two observed cards totaling 21 — the same rule for a dealer hand or a player hand. An operator override belongs in a "Manual Blackjack correction" label, not a stored flag here. */
export function isAutoDetectedBlackjack(cards: CardCode[]): boolean {
  return cards.length === 2 && computeHandTotal(cards).value === 21;
}

/** Bust/blackjack purely derived from the cards themselves — never stored, never an operator action. */
export function deriveDealerResult(cards: CardCode[]): DealerResult {
  const total = computeHandTotal(cards);
  if (total.bust) return "bust";
  if (isAutoDetectedBlackjack(cards)) return "blackjack";
  return null;
}

import type { CardCode, DealerHand } from "@/types/investigation";

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

/** Cards actually visible for a dealer hand right now — the hole card only counts once revealed. */
export function dealerVisibleCards(dealerHand: DealerHand): CardCode[] {
  return [
    ...(dealerHand.upcard ? [dealerHand.upcard] : []),
    ...(dealerHand.holeCardRevealed && dealerHand.holeCard ? [dealerHand.holeCard] : []),
    ...dealerHand.drawCards,
  ];
}

/** Recomputes bust/blackjack from the hand's current cards. "stand" is left to the operator — only the dealer's actual play (not a card count) tells you they're done drawing. */
export function deriveDealerResult(dealerHand: DealerHand): DealerHand["result"] {
  const visible = dealerVisibleCards(dealerHand);
  const total = computeHandTotal(visible);
  if (total.bust) return "bust";
  if (dealerHand.holeCardRevealed && visible.length === 2 && total.value === 21) return "blackjack";
  return dealerHand.result;
}

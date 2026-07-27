import type { Investigation, Round, SeatRoundRecord } from "@/types/investigation";

export interface RoundCompletionCheck {
  canComplete: boolean;
  /** Human-readable blockers, most specific first — shown to the operator when Complete Round is disabled. */
  reasons: string[];
}

function checkHand(hand: SeatRoundRecord | undefined, label: string, reasons: string[]): void {
  if (!hand) return;
  const hasActiveWager = hand.betAmount != null && hand.betAmount > 0;
  if (!hasActiveWager) return;

  if (hand.outcome == null) {
    reasons.push(`${label} has no result`);
  }
}

/**
 * Complete Round stays disabled until every occupied wager this round has
 * an outcome and the dealer's cards are recorded — a completeness check on
 * the observation record, not a gameplay rule. There's no "dealer result
 * resolved" requirement anymore: the dealer hand is just a card list, and
 * its bust/blackjack/total status is always derived live from whatever
 * cards exist (lib/utils/blackjackTotal.ts), never a separate thing to
 * declare. Split hands are checked exactly like their seat's primary hand.
 */
export function canCompleteRound(investigation: Investigation, round: Round): RoundCompletionCheck {
  const reasons: string[] = [];

  if (round.dealerHand.cards.length === 0) {
    reasons.push("Dealer cards not recorded");
  }

  for (const seatNumber of investigation.occupiedSeats) {
    checkHand(round.seats[seatNumber], `Seat ${seatNumber}`, reasons);
    const splitHand = round.splitHands[seatNumber];
    if (splitHand) checkHand(splitHand, `Seat ${seatNumber} split hand`, reasons);
  }

  return { canComplete: reasons.length === 0, reasons };
}

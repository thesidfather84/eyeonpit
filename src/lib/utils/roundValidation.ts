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

  // Win/Loss/Push/Blackjack are never a manual result to wait for — they're
  // derived automatically from the final cards the instant the round
  // completes (see completeRound() in the investigations repository). What
  // Complete Round still needs is something to derive an outcome FROM: a
  // wagered hand with zero cards recorded has nothing to compare against
  // the dealer's hand, so that's the one thing that still blocks here.
  // Surrender/Void/Manual-Blackjack already set `outcome` immediately when
  // tapped and are unaffected by this check either way.
  if (hand.playerCards.length === 0 && hand.outcome == null) {
    reasons.push(`${label} has no cards recorded`);
  }
}

/**
 * Complete Round stays disabled until the dealer's cards are recorded and
 * every occupied wager this round has cards to derive a result from — a
 * completeness check on the observation record, not a gameplay rule.
 * Dealer entry pending is the one blocker the operator can't resolve by
 * simply continuing: it requires either entering the dealer's cards, or
 * explicitly declaring a round exception (Misdeal / Incomplete Observation
 * / Dealer Error), which bypasses this check entirely (see
 * misdealAndAdvance in InvestigationContext). Split hands are checked
 * exactly like their seat's primary hand.
 */
export function canCompleteRound(investigation: Investigation, round: Round): RoundCompletionCheck {
  const reasons: string[] = [];

  if (round.dealerHand.cards.length === 0) {
    reasons.push("Dealer cards pending — enter cards or declare a round exception");
  }

  for (const seatNumber of investigation.occupiedSeats) {
    checkHand(round.seats[seatNumber], `Spot ${seatNumber}`, reasons);
    const splitHand = round.splitHands[seatNumber];
    if (splitHand) checkHand(splitHand, `Spot ${seatNumber} split hand`, reasons);
  }

  return { canComplete: reasons.length === 0, reasons };
}

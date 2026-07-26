import { computeHandTotal } from "@/lib/utils/blackjackTotal";
import type { Investigation, Round } from "@/types/investigation";

export interface RoundCompletionCheck {
  canComplete: boolean;
  /** Human-readable blockers, most specific first — shown to the operator when Complete Round is disabled. */
  reasons: string[];
}

/** Outcomes an operator can only reach without comparing to the dealer's hand — a seat resolved this way never requires the dealer to have played. */
const SELF_RESOLVED_OUTCOMES = new Set(["blackjack", "surrender", "void"]);

/**
 * Complete Round stays disabled until every occupied wager this round has
 * an outcome and the dealer's hand is accounted for — except when nothing
 * in play ever needed the dealer to draw (every live hand busted, or was
 * resolved some other self-evident way), matching real blackjack play
 * where the dealer doesn't need to reveal/hit if every player is already
 * out.
 */
export function canCompleteRound(investigation: Investigation, round: Round): RoundCompletionCheck {
  const reasons: string[] = [];

  if (!round.dealerHand.upcard) {
    reasons.push("Dealer upcard not recorded");
  }

  let anyLiveHandNeedsDealer = false;

  for (const seatNumber of investigation.occupiedSeats) {
    const seat = round.seats[seatNumber];
    if (!seat) continue;

    const hasActiveWager = seat.betAmount != null && seat.betAmount > 0;
    if (!hasActiveWager) continue;

    if (seat.outcome == null) {
      reasons.push(`Seat ${seatNumber} has no result`);
      continue;
    }

    const total = seat.playerCards.length > 0 ? computeHandTotal(seat.playerCards) : null;
    const selfResolved = Boolean(total?.bust) || SELF_RESOLVED_OUTCOMES.has(seat.outcome);
    if (!selfResolved) anyLiveHandNeedsDealer = true;
  }

  if (anyLiveHandNeedsDealer && round.dealerHand.result == null) {
    reasons.push("Dealer hand not resolved");
  }

  return { canComplete: reasons.length === 0, reasons };
}

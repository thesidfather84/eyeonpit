import { computeHandTotal } from "@/lib/utils/blackjackTotal";
import type { Investigation, Round, SeatRoundRecord } from "@/types/investigation";

export interface RoundCompletionCheck {
  canComplete: boolean;
  /** Human-readable blockers, most specific first — shown to the operator when Complete Round is disabled. */
  reasons: string[];
}

/** Outcomes an operator can only reach without comparing to the dealer's hand — a seat resolved this way never requires the dealer to have played. */
const SELF_RESOLVED_OUTCOMES = new Set(["blackjack", "surrender", "void"]);

function checkHand(
  hand: SeatRoundRecord | undefined,
  label: string,
  reasons: string[]
): boolean {
  if (!hand) return false;
  const hasActiveWager = hand.betAmount != null && hand.betAmount > 0;
  if (!hasActiveWager) return false;

  if (hand.outcome == null) {
    reasons.push(`${label} has no result`);
    return false;
  }

  const total = hand.playerCards.length > 0 ? computeHandTotal(hand.playerCards) : null;
  const selfResolved = Boolean(total?.bust) || SELF_RESOLVED_OUTCOMES.has(hand.outcome);
  return !selfResolved;
}

/**
 * Complete Round stays disabled until every occupied wager this round has
 * an outcome and the dealer's hand is accounted for — except when nothing
 * in play ever needed the dealer to draw (every live hand busted, or was
 * resolved some other self-evident way), matching real blackjack play
 * where the dealer doesn't need to reveal/hit if every player is already
 * out. Split hands are checked exactly like their seat's primary hand.
 */
export function canCompleteRound(investigation: Investigation, round: Round): RoundCompletionCheck {
  const reasons: string[] = [];
  let anyLiveHandNeedsDealer = false;

  if (!round.dealerHand.upcard) {
    reasons.push("Dealer upcard not recorded");
  }

  for (const seatNumber of investigation.occupiedSeats) {
    if (checkHand(round.seats[seatNumber], `Seat ${seatNumber}`, reasons)) {
      anyLiveHandNeedsDealer = true;
    }
    const splitHand = round.splitHands[seatNumber];
    if (splitHand && checkHand(splitHand, `Seat ${seatNumber} split hand`, reasons)) {
      anyLiveHandNeedsDealer = true;
    }
  }

  if (anyLiveHandNeedsDealer && round.dealerHand.result == null) {
    reasons.push("Dealer hand not resolved");
  }

  return { canComplete: reasons.length === 0, reasons };
}

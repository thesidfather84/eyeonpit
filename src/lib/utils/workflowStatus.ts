import { canCompleteRound } from "@/lib/utils/roundValidation";
import type { Investigation, Round, SeatRoundRecord } from "@/types/investigation";

export interface WorkflowStatus {
  /** Short next-step message — what the Hand Status line and Operator Assistant (Basic) both show. */
  message: string;
  /** Fuller explanation, shown only at the Guided workflow-assistance level. */
  guidance: string;
}

interface HandRef {
  seatNumber: number;
  hand: SeatRoundRecord;
  isSplit: boolean;
}

function allHands(investigation: Investigation, round: Round): HandRef[] {
  const hands: HandRef[] = [];
  for (const seatNumber of investigation.occupiedSeats) {
    const seat = round.seats[seatNumber];
    if (seat) hands.push({ seatNumber, hand: seat, isSplit: false });
    const split = round.splitHands[seatNumber];
    if (split) hands.push({ seatNumber, hand: split, isSplit: true });
  }
  return hands;
}

/**
 * The one place that decides "what should the operator do next" from
 * investigation/round state alone — never interrupts, never blocks
 * anything, purely descriptive. Powers both the compact Hand Status line
 * in the sticky header and the Operator Assistant bar; the two surfaces
 * just render the same result differently.
 */
export function computeWorkflowStatus(investigation: Investigation, round: Round): WorkflowStatus {
  if (investigation.occupiedSeats.length === 0) {
    return {
      message: "Select occupied seats.",
      guidance: "Tap an empty seat tile to mark it occupied and start tracking that player.",
    };
  }

  const missingWager = investigation.occupiedSeats.find((s) => round.seats[s]?.betAmount == null);
  if (missingWager != null) {
    return {
      message: "Waiting for starting wagers.",
      guidance: `Seat ${missingWager} has no wager recorded yet — set it from the bet panel.`,
    };
  }

  const hands = allHands(investigation, round);

  if (hands.every((h) => h.hand.playerCards.length === 0)) {
    return {
      message: "Waiting for player cards.",
      guidance: "Enter each player's cards as they become visible.",
    };
  }

  const waitingOnDouble = hands.find(
    (h) =>
      h.hand.doubled &&
      h.hand.doubledAtCardCount != null &&
      h.hand.playerCards.length <= h.hand.doubledAtCardCount
  );
  if (waitingOnDouble) {
    return {
      message: `Seat ${waitingOnDouble.seatNumber} is doubled. Enter one final card.`,
      guidance: "A doubled hand takes exactly one more card, then locks automatically.",
    };
  }

  const activeSplit = hands.find((h) => h.isSplit && h.hand.playerCards.length === 0);
  if (activeSplit) {
    return {
      message: `Split hand active on Seat ${activeSplit.seatNumber}.`,
      guidance: "Enter cards for the split hand — its result is derived automatically when the round completes.",
    };
  }

  const insuranceOffered =
    round.dealerHand.cards.length === 1 &&
    round.dealerHand.cards[0].rank === "A" &&
    hands.every((h) => (h.hand.insuranceAmount ?? 0) === 0);
  if (insuranceOffered) {
    return {
      message: "Insurance available.",
      guidance: "Record an insurance wager for any seat that takes it, or continue without it.",
    };
  }

  const check = canCompleteRound(investigation, round);
  if (!check.canComplete) {
    if (check.reasons.some((r) => r.includes("Dealer"))) {
      return {
        message: "Dealer card entry pending.",
        guidance: "Enter the dealer's observed cards, or declare a round exception from the menu.",
      };
    }
    return {
      message: check.reasons[0] ?? "Waiting for player cards.",
      guidance: "Enter each remaining hand's cards — results are derived automatically before moving on.",
    };
  }

  return {
    message: "Ready for Next Hand.",
    guidance: "Every hand's cards are recorded — results are derived automatically when you tap Next Hand.",
  };
}

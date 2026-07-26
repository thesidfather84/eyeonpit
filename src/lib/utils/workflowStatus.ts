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

  if (!round.dealerHand.upcard) {
    return {
      message: "Enter Dealer Up Card.",
      guidance: "Tap the dealer, then tap the rank of the dealer's up card.",
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

  const activeSplit = hands.find((h) => h.isSplit && h.hand.outcome == null);
  if (activeSplit) {
    return {
      message: `Split hand active on Seat ${activeSplit.seatNumber}.`,
      guidance: "Continue entering cards and a result for the split hand before moving on.",
    };
  }

  const insuranceOffered =
    round.dealerHand.upcard.rank === "A" &&
    !round.dealerHand.holeCardRevealed &&
    hands.every((h) => (h.hand.insuranceAmount ?? 0) === 0);
  if (insuranceOffered) {
    return {
      message: "Insurance available.",
      guidance: "Record an insurance wager for any seat that takes it, or continue without it.",
    };
  }

  const check = canCompleteRound(investigation, round);
  if (!check.canComplete) {
    if (check.reasons.some((r) => r.includes("Dealer hand"))) {
      return {
        message: "Dealer hand incomplete.",
        guidance: "Reveal the hole card and record Stand, Blackjack, or Bust.",
      };
    }
    return {
      message: check.reasons[0] ?? "Waiting for player cards.",
      guidance: "Finish recording each hand's result before moving on.",
    };
  }

  return {
    message: "Ready for Next Hand.",
    guidance: "Every hand is resolved — tap Next Hand when ready.",
  };
}

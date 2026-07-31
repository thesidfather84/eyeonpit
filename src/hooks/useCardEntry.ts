"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { formatCard } from "@/lib/utils/cards";
import { resolveSeatTarget, updateSeatAtTarget } from "@/lib/utils/seatTarget";
import { isSeatLocked } from "@/lib/utils/seatLock";
import type { CardCode, Rank } from "@/types/investigation";

/**
 * The card-entry orchestration CardEntryPad's keypad taps drive — target
 * resolution (dealer / seat / split), the disabled gate, and the exact
 * addCard() call shape — pulled out into a hook so a second entry surface
 * (VoiceControl) can drive the identical path instead of re-deriving its
 * own copy of this logic. CardEntryPad still owns everything about how it
 * *looks* (labels, keypad grid, last-card-entered text); this hook owns
 * only what a tap or a voice command actually *does*.
 */
export function useCardEntry() {
  const { investigation, currentRound, activeTarget, addCard, busy } = useInvestigationContext();
  const isDealerTarget = activeTarget === "dealer";
  const seatResolved =
    !isDealerTarget && typeof activeTarget === "number"
      ? resolveSeatTarget(currentRound, activeTarget)
      : null;
  const locked = seatResolved ? isSeatLocked(seatResolved.record) : false;
  const notEnabled = seatResolved != null && !seatResolved.record;
  const disabled =
    busy || investigation.status !== "active" || currentRound.completed || locked || notEnabled;

  const targetLabel = isDealerTarget
    ? "DEALER"
    : `SEAT ${seatResolved?.seatNumber}${seatResolved?.isSplit ? " · SPLIT" : ""}`;

  function enterCard(rank: Rank) {
    if (disabled) return;
    const card: CardCode = { rank, suit: "unspecified" };

    if (activeTarget === "dealer") {
      addCard(
        { targetType: "dealer", targetId: "dealer", rank },
        (round) => ({ ...round, dealerHand: { cards: [...round.dealerHand.cards, card] } }),
        { type: "card", message: `Dealer: ${formatCard(card)}` }
      );
      return;
    }

    if (typeof activeTarget !== "number" || !seatResolved) return;
    const target = activeTarget;
    addCard(
      { targetType: seatResolved.isSplit ? "split" : "seat", targetId: seatResolved.seatNumber, rank },
      (round) =>
        updateSeatAtTarget(round, target, (seat) => ({
          ...seat,
          playerCards: [...seat.playerCards, card],
        })),
      {
        type: "card",
        message: `Seat ${seatResolved.seatNumber}${seatResolved.isSplit ? " (split)" : ""}: ${formatCard(card)}`,
      }
    );
  }

  return { enterCard, disabled, locked, notEnabled, targetLabel };
}

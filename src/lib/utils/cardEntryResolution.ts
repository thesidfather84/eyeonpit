import type { CardCode, Investigation, Round } from "@/types/investigation";
import type { CardEventTargetType } from "@/lib/counting-engine/types";
import { resolveSeatTarget, updateSeatAtTarget } from "./seatTarget";
import { isSeatLocked } from "./seatLock";
import { formatCard } from "./cards";

export type CardTarget = "dealer" | number;

export interface CardEntryResolution {
  disabled: boolean;
  locked: boolean;
  notEnabled: boolean;
  targetLabel: string;
  targetType: CardEventTargetType;
  targetId: number | "dealer";
  applyCard: (round: Round, card: CardCode) => Round;
  eventMessage: (card: CardCode) => string;
}

/**
 * Resolves everything needed to enter a card at a specific target (dealer,
 * a seat, or a seat's split hand) — the target-agnostic core `useCardEntry`
 * (driven by whichever target is currently active) and voice entry (driven
 * by a target spoken in the same utterance, e.g. "dealer king") both build
 * on, so the disabled/lock/label rules can never drift between the two
 * entry surfaces.
 */
export function resolveCardEntryTarget(
  investigation: Investigation,
  currentRound: Round,
  target: CardTarget,
  busy: boolean
): CardEntryResolution {
  const isDealerTarget = target === "dealer";
  const seatResolved = isDealerTarget ? null : resolveSeatTarget(currentRound, target);
  const locked = seatResolved ? isSeatLocked(seatResolved.record) : false;
  const notEnabled = seatResolved != null && !seatResolved.record;
  const disabled = busy || investigation.status !== "active" || currentRound.completed || locked || notEnabled;
  const targetLabel = isDealerTarget
    ? "DEALER"
    : `SEAT ${seatResolved?.seatNumber}${seatResolved?.isSplit ? " · SPLIT" : ""}`;

  if (isDealerTarget) {
    return {
      disabled,
      locked,
      notEnabled,
      targetLabel,
      targetType: "dealer",
      targetId: "dealer",
      applyCard: (round, card) => ({ ...round, dealerHand: { cards: [...round.dealerHand.cards, card] } }),
      eventMessage: (card) => `Dealer: ${formatCard(card)}`,
    };
  }

  const seatNumber = target;
  return {
    disabled,
    locked,
    notEnabled,
    targetLabel,
    targetType: seatResolved?.isSplit ? "split" : "seat",
    targetId: seatResolved?.seatNumber ?? Math.abs(seatNumber),
    applyCard: (round, card) =>
      updateSeatAtTarget(round, seatNumber, (seat) => ({ ...seat, playerCards: [...seat.playerCards, card] })),
    eventMessage: (card) =>
      `Seat ${seatResolved?.seatNumber}${seatResolved?.isSplit ? " (split)" : ""}: ${formatCard(card)}`,
  };
}

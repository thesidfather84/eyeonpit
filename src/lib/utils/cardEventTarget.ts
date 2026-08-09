import type { CardCode, Rank, Round } from "@/types/investigation";
import type { CardEventTargetType } from "@/lib/counting-engine/types";
import { updateSeatAtTarget } from "./seatTarget";

function numericSeatTarget(targetType: CardEventTargetType, targetId: number | "dealer"): number {
  return targetType === "split" ? -Number(targetId) : Number(targetId);
}

/**
 * Pops the most recently added card from a ledger target's own display
 * array (dealerHand.cards / a seat's playerCards / a split hand's
 * playerCards) — the exact inverse of `appendCardForTarget`. Used by
 * context-aware Undo instead of restoring a whole prior-round snapshot, so
 * reversing one target's card never touches any other target's data, even
 * if that other target's card was added more recently.
 */
export function popLastCardForTarget(
  round: Round,
  targetType: CardEventTargetType,
  targetId: number | "dealer"
): Round {
  if (targetType === "dealer") {
    return { ...round, dealerHand: { ...round.dealerHand, cards: round.dealerHand.cards.slice(0, -1) } };
  }
  return updateSeatAtTarget(round, numericSeatTarget(targetType, targetId), (seat) => ({
    ...seat,
    playerCards: seat.playerCards.slice(0, -1),
  }));
}

/** Appends a card back onto a ledger target's own display array — the exact inverse of `popLastCardForTarget`, used by context-aware Redo. */
export function appendCardForTarget(
  round: Round,
  targetType: CardEventTargetType,
  targetId: number | "dealer",
  card: CardCode
): Round {
  if (targetType === "dealer") {
    return { ...round, dealerHand: { ...round.dealerHand, cards: [...round.dealerHand.cards, card] } };
  }
  return updateSeatAtTarget(round, numericSeatTarget(targetType, targetId), (seat) => ({
    ...seat,
    playerCards: [...seat.playerCards, card],
  }));
}

/** Rebuilds a card from a CardEvent's own rank — the display array only ever stores suit as "unspecified" (see docs/counting-systems.md), so this is always a safe, lossless reconstruction. */
export function cardFromRank(rank: Rank): CardCode {
  return { rank, suit: "unspecified" };
}

/**
 * Maps the app's card-entry target (dealer, a seat, or a seat's split hand
 * — see `CardTarget` in InvestigationContext) to the ledger's own
 * (targetType, targetId) shape, so context-aware Undo can look up exactly
 * that target's most recent CardEvent. Kept independent of `CardTarget`'s
 * defining module to avoid a circular import; the two are structurally the
 * same "dealer" | number shape.
 */
export function ledgerTargetFor(
  activeTarget: "dealer" | number
): { targetType: CardEventTargetType; targetId: number | "dealer" } {
  if (activeTarget === "dealer") return { targetType: "dealer", targetId: "dealer" };
  return activeTarget < 0
    ? { targetType: "split", targetId: -activeTarget }
    : { targetType: "seat", targetId: activeTarget };
}

/** Human-readable label for a ledger target — "Dealer" / "Seat 3" / "Seat 3 (Split)" — so Undo's button label can say exactly what it will affect. */
export function describeLedgerTarget(targetType: CardEventTargetType, targetId: number | "dealer"): string {
  if (targetType === "dealer") return "Dealer";
  return targetType === "split" ? `Seat ${targetId} (Split)` : `Seat ${targetId}`;
}

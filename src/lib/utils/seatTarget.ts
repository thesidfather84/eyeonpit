import type { Round, SeatRoundRecord } from "@/types/investigation";

/**
 * A split hand is targeted as the negative of its seat number (seat 3's
 * split hand = target -3) — CardTarget stays a plain number everywhere
 * else, so every existing seat-iteration/occupancy check is untouched;
 * only the handful of components that read/write a seat's hand need to
 * resolve through this.
 */
export interface ResolvedSeatTarget {
  seatNumber: number;
  isSplit: boolean;
  record: SeatRoundRecord | undefined;
}

export function resolveSeatTarget(round: Round, target: number): ResolvedSeatTarget {
  const isSplit = target < 0;
  const seatNumber = Math.abs(target);
  const record = isSplit ? round.splitHands[seatNumber] : round.seats[seatNumber];
  return { seatNumber, isSplit, record };
}

/** Encodes a seat number's split-hand target — the counterpart to resolveSeatTarget. */
export function splitTargetFor(seatNumber: number): number {
  return -seatNumber;
}

/** Applies an updater to whichever map (seats or splitHands) a target number resolves to. */
export function updateSeatAtTarget(
  round: Round,
  target: number,
  updater: (seat: SeatRoundRecord) => SeatRoundRecord
): Round {
  const { seatNumber, isSplit, record } = resolveSeatTarget(round, target);
  if (!record) return round;
  return isSplit
    ? { ...round, splitHands: { ...round.splitHands, [seatNumber]: updater(record) } }
    : { ...round, seats: { ...round.seats, [seatNumber]: updater(record) } };
}

/**
 * EyeOnPit 1.10 Phase 2 — the Double/Undo defect fix. True when a target's
 * hand is doubled AND has not yet received the one additional card a
 * double allows — i.e., this hand's own most recent real action WAS the
 * double itself, not an earlier card. This is the exact, deterministic
 * signal `InvestigationContext.undo()` uses to decide "undo the double"
 * instead of "undo a card": derived purely from the target's OWN current
 * record fields (`doubled`/`doubledAtCardCount`/`playerCards.length`),
 * never from history-stack position, so it's correct regardless of what
 * any OTHER target did in between. Always false for `"dealer"` (which
 * never doubles) and for any target with no record.
 */
export function isDoubledWithNoPostDoubleCard(round: Round, target: "dealer" | number): boolean {
  if (target === "dealer") return false;
  const { record } = resolveSeatTarget(round, target);
  if (!record || !record.doubled || record.doubledAtCardCount == null) return false;
  return record.playerCards.length === record.doubledAtCardCount;
}

/**
 * Reverts a target's Double — the exact inverse of the mutation
 * PlayerActionsRow.tsx's `handleDouble` performs (halves `betAmount`,
 * clears `doubled`/`doubledAtCardCount`, removes the `"double"` action).
 * Never touches `playerCards` — the hand's pre-existing cards are
 * completely untouched, per EyeOnPit 1.10's locked decision that Undoing
 * a Double must never remove the hand's own cards. Never touches a
 * CardEvent or the count.
 */
export function revertDouble(round: Round, target: number): Round {
  return updateSeatAtTarget(round, target, (seat) => ({
    ...seat,
    betAmount: seat.betAmount != null ? seat.betAmount / 2 : seat.betAmount,
    doubled: false,
    doubledAtCardCount: null,
    actions: seat.actions.filter((a) => a !== "double"),
  }));
}

/**
 * Re-applies a target's Double — the exact inverse of `revertDouble`,
 * given the original `doubledAtCardCount` to restore (captured at
 * undo-time by the caller so Redo restores the precise pre-undo state,
 * exactly like `redoTargetCard` reconstructs a card from its own
 * recorded rank rather than re-deriving one).
 */
export function reapplyDouble(round: Round, target: number, doubledAtCardCount: number): Round {
  return updateSeatAtTarget(round, target, (seat) => ({
    ...seat,
    betAmount: seat.betAmount != null ? seat.betAmount * 2 : seat.betAmount,
    doubled: true,
    doubledAtCardCount,
    actions: [...seat.actions, "double"],
  }));
}

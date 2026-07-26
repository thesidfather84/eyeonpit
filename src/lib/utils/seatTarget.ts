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

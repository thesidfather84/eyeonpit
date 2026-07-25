import type { WagerChange } from "@/types/investigation";

/**
 * Auto-computes how a seat's wager moved versus its previous round bet.
 * Never typed by the operator — see plan.md §10. `overridden` starts false;
 * it's flipped to true only by an explicit operator correction in Review.
 */
export function computeWagerChange(
  currentBet: number | null,
  previousBet: number | null
): WagerChange {
  if (previousBet === null) {
    return { direction: "first", amount: null, overridden: false };
  }
  if (currentBet === null) {
    return { direction: "same", amount: null, overridden: false };
  }

  const amount = Math.abs(currentBet - previousBet);
  if (currentBet > previousBet) {
    return { direction: "up", amount, overridden: false };
  }
  if (currentBet < previousBet) {
    return { direction: "down", amount, overridden: false };
  }
  return { direction: "same", amount: 0, overridden: false };
}

/**
 * Finds the seat's most recent bet from prior rounds (in round order),
 * for feeding into computeWagerChange when a new round starts.
 */
export function findPreviousBet(
  seatNumber: number,
  priorRounds: { seats: Partial<Record<number, { betAmount: number | null }>> }[]
): number | null {
  for (let i = priorRounds.length - 1; i >= 0; i -= 1) {
    const seatRecord = priorRounds[i].seats[seatNumber];
    if (seatRecord && seatRecord.betAmount !== null) {
      return seatRecord.betAmount;
    }
  }
  return null;
}

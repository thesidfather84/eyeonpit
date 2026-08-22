import type { Investigation, Round } from "@/types/investigation";

/** Seat tiles are generated from playerSpotCount, never hardcoded — this is the one place that turns a count into the list of seat numbers to render. */
export function seatNumbersFor(investigation: Investigation): number[] {
  return Array.from({ length: investigation.playerSpotCount }, (_, i) => i + 1);
}

/** The table-configurable spot counts an operator can pick in QuickSetupSheet. */
export const PLAYER_SPOT_COUNT_OPTIONS = [5, 6, 7] as const;

/** The six permanent arch positions, numbered left to right exactly as the dealer sees them — the maximum the curved arch graphic ever has slots for, independent of how many are currently configured visible. */
export const ARCH_SEAT_NUMBERS = [1, 2, 3, 4, 5, 6] as const;

/**
 * The arch positions actually visible for this table's configured spot
 * count (5, 6, or 7 — see QuickSetupSheet): the first `min(playerSpotCount,
 * 6)` arch slots, same left-to-right order, never renumbered. A seat hidden
 * this way keeps any recorded data it already has; see
 * legacyOverflowSeatNumbersFor.
 */
export function visibleArchSeatNumbersFor(investigation: Investigation): number[] {
  return ARCH_SEAT_NUMBERS.slice(0, Math.min(investigation.playerSpotCount, 6));
}

/** Position 7 is the one optional arch seat, centered beneath the arch and above the dealer. */
export function isPosition7Enabled(investigation: Investigation): boolean {
  return investigation.playerSpotCount >= 7;
}

/**
 * Seat numbers beyond this table's currently configured spot count. New and
 * edited table configs pick 5, 6, or 7 (see QuickSetupSheet), so this is
 * non-empty whenever an investigation has recorded data (occupancy, cards,
 * bets) on a position that used to be visible and no longer is — either a
 * legacy investigation set up before the arch layout existed (positions
 * 8-10), or simply a table reconfigured down (e.g. 7 -> 5) mid-investigation
 * with a player still recorded on position 6 or 7. That data is never
 * deleted or hidden — it renders in a clearly labeled legacy section instead
 * of the standard arch/dealer graphic.
 */
export function legacyOverflowSeatNumbersFor(investigation: Investigation, round: Round): number[] {
  const threshold = investigation.playerSpotCount;
  const seatNumbers = new Set<number>();
  for (const seat of investigation.occupiedSeats) {
    if (seat > threshold) seatNumbers.add(seat);
  }
  for (const seat of Object.keys(round.seats)) {
    if (Number(seat) > threshold) seatNumbers.add(Number(seat));
  }
  for (const seat of Object.keys(round.splitHands)) {
    if (Number(seat) > threshold) seatNumbers.add(Number(seat));
  }
  return Array.from(seatNumbers).sort((a, b) => a - b);
}

/** Ascending for left-to-right entry direction, descending for right-to-left — the order automatic card/result progression walks through. */
export function orderedSeatNumbersFor(investigation: Investigation): number[] {
  const seats = [...investigation.occupiedSeats].sort((a, b) => a - b);
  return investigation.entryDirection === "rtl" ? seats.reverse() : seats;
}

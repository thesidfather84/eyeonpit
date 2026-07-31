import type { Investigation, Round } from "@/types/investigation";

/** Seat tiles are generated from playerSpotCount, never hardcoded — this is the one place that turns a count into the list of seat numbers to render. */
export function seatNumbersFor(investigation: Investigation): number[] {
  return Array.from({ length: investigation.playerSpotCount }, (_, i) => i + 1);
}

/** The six permanent arch positions, numbered left to right exactly as the dealer sees them — fixed regardless of playerSpotCount, never renumbered. */
export const ARCH_SEAT_NUMBERS = [1, 2, 3, 4, 5, 6] as const;

/** Position 7 is the one optional arch seat, centered beneath positions 1-6 and above the dealer. */
export function isPosition7Enabled(investigation: Investigation): boolean {
  return investigation.playerSpotCount >= 7;
}

/**
 * Seat numbers above the fixed 6+1 arch. New and edited table configs are
 * capped at 6 or 7 (see QuickSetupSheet), so this is only ever non-empty for
 * investigations set up before the arch layout existed, with recorded data
 * (occupancy, cards, bets) on positions 8-10. That data is never deleted or
 * hidden — it renders in a clearly labeled legacy section instead of the
 * standard arch/dealer graphic.
 */
export function legacyOverflowSeatNumbersFor(investigation: Investigation, round: Round): number[] {
  const seatNumbers = new Set<number>();
  for (const seat of investigation.occupiedSeats) {
    if (seat > 7) seatNumbers.add(seat);
  }
  for (const seat of Object.keys(round.seats)) {
    if (Number(seat) > 7) seatNumbers.add(Number(seat));
  }
  for (const seat of Object.keys(round.splitHands)) {
    if (Number(seat) > 7) seatNumbers.add(Number(seat));
  }
  return Array.from(seatNumbers).sort((a, b) => a - b);
}

/** Ascending for left-to-right entry direction, descending for right-to-left — the order automatic card/result progression walks through. */
export function orderedSeatNumbersFor(investigation: Investigation): number[] {
  const seats = [...investigation.occupiedSeats].sort((a, b) => a - b);
  return investigation.entryDirection === "rtl" ? seats.reverse() : seats;
}

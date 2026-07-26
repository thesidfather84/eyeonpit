import type { Investigation } from "@/types/investigation";

/** Seat tiles are generated from playerSpotCount, never hardcoded — this is the one place that turns a count into the list of seat numbers to render. */
export function seatNumbersFor(investigation: Investigation): number[] {
  return Array.from({ length: investigation.playerSpotCount }, (_, i) => i + 1);
}

/** Ascending for left-to-right entry direction, descending for right-to-left — the order automatic card/result progression walks through. */
export function orderedSeatNumbersFor(investigation: Investigation): number[] {
  const seats = [...investigation.occupiedSeats].sort((a, b) => a - b);
  return investigation.entryDirection === "rtl" ? seats.reverse() : seats;
}

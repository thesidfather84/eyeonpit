// Configurable player-spot count (5/6/7, default 6) — the "hidden" seats
// beyond a table's current configuration must never lose recorded data, only
// stop appearing in the primary arch/list. See AGENTS.md's UI-rebuild
// follow-up instruction (mid-cycle addition after the initial operational
// rebuild) and QuickSetupSheet's "Player Spots" control.
import { describe, expect, it } from "vitest";
import {
  isPosition7Enabled,
  legacyOverflowSeatNumbersFor,
  seatNumbersFor,
  visibleArchSeatNumbersFor,
} from "./seats";
import type { Investigation, Round } from "@/types/investigation";

function inv(playerSpotCount: number, occupiedSeats: number[] = []): Investigation {
  return { playerSpotCount, occupiedSeats } as Investigation;
}

function round(seats: number[] = [], splitSeats: number[] = []): Round {
  return {
    seats: Object.fromEntries(seats.map((s) => [s, {}])),
    splitHands: Object.fromEntries(splitSeats.map((s) => [s, {}])),
  } as unknown as Round;
}

describe("seatNumbersFor", () => {
  it("returns exactly 1..N for playerSpotCount N, for every supported count", () => {
    expect(seatNumbersFor(inv(5))).toEqual([1, 2, 3, 4, 5]);
    expect(seatNumbersFor(inv(6))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(seatNumbersFor(inv(7))).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("visibleArchSeatNumbersFor", () => {
  it("trims the 6-slot arch from the end for a 5-spot table", () => {
    expect(visibleArchSeatNumbersFor(inv(5))).toEqual([1, 2, 3, 4, 5]);
  });

  it("shows the full arch for a 6-spot table", () => {
    expect(visibleArchSeatNumbersFor(inv(6))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("caps at 6 even for a 7-spot table — position 7 is a separate slot, not part of the arch", () => {
    expect(visibleArchSeatNumbersFor(inv(7))).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("isPosition7Enabled", () => {
  it("is only true at playerSpotCount 7", () => {
    expect(isPosition7Enabled(inv(5))).toBe(false);
    expect(isPosition7Enabled(inv(6))).toBe(false);
    expect(isPosition7Enabled(inv(7))).toBe(true);
  });
});

describe("legacyOverflowSeatNumbersFor — reconfiguring a table down never drops recorded data", () => {
  it("is empty when nothing is occupied or carded beyond the configured count", () => {
    expect(legacyOverflowSeatNumbersFor(inv(6, [1, 2, 3]), round([1, 2, 3]))).toEqual([]);
  });

  it("surfaces an occupied seat beyond a reduced spot count instead of silently dropping it", () => {
    // A table reconfigured from 7 down to 5 mid-investigation, with a player
    // still recorded on position 6.
    expect(legacyOverflowSeatNumbersFor(inv(5, [1, 6]), round([1, 6]))).toEqual([6]);
  });

  it("surfaces a split-hand seat beyond the configured count even if occupiedSeats/round.seats don't mention it", () => {
    expect(legacyOverflowSeatNumbersFor(inv(5, []), round([], [7]))).toEqual([7]);
  });

  it("still catches pre-arch legacy positions 8-10 the same way it always did", () => {
    expect(legacyOverflowSeatNumbersFor(inv(7, [8, 9]), round([8, 9]))).toEqual([8, 9]);
  });

  it("the threshold tracks whatever playerSpotCount currently is, not a fixed 7", () => {
    const r = round([5, 6, 7]);
    expect(legacyOverflowSeatNumbersFor(inv(7, [5, 6, 7]), r)).toEqual([]);
    expect(legacyOverflowSeatNumbersFor(inv(6, [5, 6, 7]), r)).toEqual([7]);
    expect(legacyOverflowSeatNumbersFor(inv(5, [5, 6, 7]), r)).toEqual([6, 7]);
  });
});

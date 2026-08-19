import { describe, expect, it } from "vitest";
import { computeEntryExitEvidence } from "./entryExitAnalysis";
import type { PlayerObservation } from "./playerObservation";

function obs(overrides: Partial<PlayerObservation> = {}): PlayerObservation {
  return {
    schemaVersion: 1,
    id: "o1",
    investigationId: "inv-1",
    investigationDisplayId: "BJ-1",
    playerGroupId: null,
    tableIdentifier: "BJ-1",
    spotNumber: 1,
    shoeNumber: 1,
    roundNumber: 1,
    handSequenceNumber: 1,
    timestamp: new Date().toISOString(),
    isSplitHand: false,
    wagerAmount: 10,
    startingWagerAmount: 10,
    wagerChangeDirection: "same",
    wagerChangeAmount: 0,
    runningCountAtWager: 0,
    trueCountAtWager: 0,
    countMethodRef: { id: "builtin-hi-lo", version: 1 },
    playerCards: null,
    dealerUpcard: null,
    actions: [],
    outcome: null,
    insuranceOffered: false,
    insuranceTaken: null,
    insuranceAmount: null,
    isFirstHandOfEntry: false,
    isLastHandBeforeExit: false,
    observerNotes: [],
    ...overrides,
  };
}

describe("computeEntryExitEvidence", () => {
  it("excludes the very first ever appearance from entry-consistency evidence (sitting down isn't wong-in)", () => {
    const observations = [obs({ id: "1", handSequenceNumber: 1, isFirstHandOfEntry: true, trueCountAtWager: 5 })];
    const result = computeEntryExitEvidence(observations);
    expect(result.entries).toHaveLength(1);
    expect(result.resumeCount).toBe(0);
    expect(result.entryCountConsistencyRate).toBeNull();
  });

  it("counts a later resume at a positive count as entry-consistent evidence", () => {
    const observations = [
      obs({ id: "1", handSequenceNumber: 1, isFirstHandOfEntry: true, trueCountAtWager: -2 }),
      obs({ id: "2", handSequenceNumber: 2, isFirstHandOfEntry: true, trueCountAtWager: 4 }), // a resume, at positive count
    ];
    const result = computeEntryExitEvidence(observations);
    expect(result.resumeCount).toBe(1);
    expect(result.entriesAtPositiveCount).toBe(1);
    expect(result.entryCountConsistencyRate).toBe(1);
  });

  it("counts exits at negative-or-zero count as exit-consistent evidence", () => {
    const observations = [
      obs({ id: "1", handSequenceNumber: 1, isLastHandBeforeExit: true, trueCountAtWager: -3 }),
      obs({ id: "2", handSequenceNumber: 2, isLastHandBeforeExit: true, trueCountAtWager: 5 }),
    ];
    const result = computeEntryExitEvidence(observations);
    expect(result.exits).toHaveLength(2);
    expect(result.exitsAtNegativeOrZeroCount).toBe(1);
    expect(result.exitsAtPositiveCount).toBe(1);
    expect(result.exitCountConsistencyRate).toBe(0.5);
  });

  it("returns null rates and empty arrays for zero observations, never throws", () => {
    const result = computeEntryExitEvidence([]);
    expect(result.entries).toEqual([]);
    expect(result.exits).toEqual([]);
    expect(result.entryCountConsistencyRate).toBeNull();
    expect(result.exitCountConsistencyRate).toBeNull();
  });
});

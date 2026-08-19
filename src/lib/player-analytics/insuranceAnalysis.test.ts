import { describe, expect, it } from "vitest";
import { computeInsuranceAnalysis, HI_LO_INSURANCE_REFERENCE_TRUE_COUNT } from "./insuranceAnalysis";
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
    dealerUpcard: "A",
    actions: [],
    outcome: null,
    insuranceOffered: true,
    insuranceTaken: false,
    insuranceAmount: null,
    isFirstHandOfEntry: false,
    isLastHandBeforeExit: false,
    observerNotes: [],
    ...overrides,
  };
}

describe("computeInsuranceAnalysis", () => {
  it("requires an explicit threshold — HI_LO_INSURANCE_REFERENCE_TRUE_COUNT is a real, citable value, not a hidden default", () => {
    expect(HI_LO_INSURANCE_REFERENCE_TRUE_COUNT).toBe(3);
  });

  it("counts offered/taken/declined correctly, ignoring hands where insurance wasn't offered", () => {
    const observations = [
      obs({ id: "1", trueCountAtWager: 5, insuranceTaken: true }),
      obs({ id: "2", trueCountAtWager: -1, insuranceTaken: false }),
      obs({ id: "3", insuranceOffered: false, dealerUpcard: "9", insuranceTaken: null }),
    ];
    const result = computeInsuranceAnalysis(observations, 3);
    expect(result.timesOffered).toBe(2);
    expect(result.timesTaken).toBe(1);
    expect(result.timesDeclined).toBe(1);
  });

  it("marks a decision count-consistent when the player takes insurance at/above the threshold and declines below it", () => {
    const observations = [
      obs({ id: "1", trueCountAtWager: 5, insuranceTaken: true }), // at/above 3, took -> consistent
      obs({ id: "2", trueCountAtWager: 1, insuranceTaken: false }), // below 3, declined -> consistent
      obs({ id: "3", trueCountAtWager: 5, insuranceTaken: false }), // at/above 3, declined -> inconsistent
    ];
    const result = computeInsuranceAnalysis(observations, 3);
    expect(result.countConsistentRate).toBeCloseTo(2 / 3, 5);
  });

  it("excludes split sub-hands so one round's insurance decision is never double-counted", () => {
    const observations = [
      obs({ id: "1", trueCountAtWager: 5, insuranceTaken: true }),
      obs({ id: "1-split", isSplitHand: true, trueCountAtWager: 5, insuranceTaken: true }),
    ];
    const result = computeInsuranceAnalysis(observations, 3);
    expect(result.timesOffered).toBe(1);
  });

  it("returns null countConsistentRate and 0 counts for zero observations", () => {
    const result = computeInsuranceAnalysis([], 3);
    expect(result.timesOffered).toBe(0);
    expect(result.countConsistentRate).toBeNull();
  });

  it("never guesses countConsistent when the true count is unknown", () => {
    const observations = [obs({ id: "1", trueCountAtWager: null, insuranceTaken: true })];
    const result = computeInsuranceAnalysis(observations, 3);
    expect(result.decisions[0].countConsistent).toBeNull();
    expect(result.countConsistentRate).toBeNull();
  });
});

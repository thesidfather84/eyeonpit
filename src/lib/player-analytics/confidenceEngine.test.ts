import { describe, expect, it } from "vitest";
import {
  MIN_HANDS_FOR_ANY_CLASSIFICATION,
  runConfidenceEngine,
  type CounterClassificationState,
} from "./confidenceEngine";
import type { PlayerObservation } from "./playerObservation";

function baseObs(overrides: Partial<PlayerObservation>): PlayerObservation {
  return {
    schemaVersion: 1,
    id: `o${overrides.handSequenceNumber ?? 0}`,
    investigationId: "inv-1",
    investigationDisplayId: "BJ-1",
    playerGroupId: null,
    tableIdentifier: "BJ-1",
    spotNumber: 1,
    shoeNumber: 1,
    roundNumber: overrides.handSequenceNumber ?? 1,
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

/** A deterministic true-count sequence sweeping -5..+5..-5, repeated. */
function trueCountSequence(length: number): number[] {
  const seq: number[] = [];
  for (let i = 0; i < length; i++) {
    const phase = i % 20;
    seq.push(phase <= 10 ? phase - 5 : 15 - phase);
  }
  return seq;
}

function makeObservations(n: number, wagerFn: (tc: number) => number): PlayerObservation[] {
  const tcs = trueCountSequence(n);
  return tcs.map((tc, i) =>
    baseObs({
      handSequenceNumber: i + 1,
      trueCountAtWager: tc,
      runningCountAtWager: tc,
      startingWagerAmount: wagerFn(tc),
      wagerAmount: wagerFn(tc),
    })
  );
}

describe("runConfidenceEngine — INSUFFICIENT_DATA gate", () => {
  it("never classifies above INSUFFICIENT_DATA below the minimum-hands floor, even with a perfect-looking correlation", () => {
    const observations = makeObservations(MIN_HANDS_FOR_ANY_CLASSIFICATION - 5, (tc) => 10 + Math.max(0, tc) * 50);
    const result = runConfidenceEngine(observations, { insuranceTrueCountThreshold: 3 });
    expect(result.classification).toBe("INSUFFICIENT_DATA");
    expect(result.reasonCodes[0]).toMatch(/insufficient-hands/);
  });
});

describe("runConfidenceEngine — a clear count-consistent bettor over many hands", () => {
  it("reaches HIGH or VERY_HIGH with strong, consistent count-scaled wagers over 60 hands", () => {
    const observations = makeObservations(60, (tc) => 10 + Math.max(0, tc) * 40);
    const result = runConfidenceEngine(observations, { insuranceTrueCountThreshold: 3 });
    const acceptable: CounterClassificationState[] = ["HIGH", "VERY_HIGH"];
    expect(acceptable).toContain(result.classification);
    expect(result.confidenceScore).toBeGreaterThan(0.5);
    expect(result.strongestContributingSignals.length).toBeGreaterThan(0);
    expect(result.handsWithUsableEvidence).toBeGreaterThanOrEqual(50);
  });

  it("caps at HIGH (never VERY_HIGH) when usable hands are between the HIGH and VERY_HIGH floors", () => {
    const observations = makeObservations(35, (tc) => 10 + Math.max(0, tc) * 40);
    const result = runConfidenceEngine(observations, { insuranceTrueCountThreshold: 3 });
    expect(result.classification).not.toBe("VERY_HIGH");
  });
});

describe("runConfidenceEngine — a flat bettor never reaches HIGH regardless of hands observed", () => {
  it("stays at LOW or MODERATE for 100 hands of a completely flat, count-independent wager", () => {
    const observations = makeObservations(100, () => 25);
    const result = runConfidenceEngine(observations, { insuranceTrueCountThreshold: 3 });
    expect(["LOW", "MODERATE"]).toContain(result.classification);
    expect(result.classification).not.toBe("HIGH");
    expect(result.classification).not.toBe("VERY_HIGH");
  });
});

describe("runConfidenceEngine — contradictory evidence", () => {
  it("flags a strongly NEGATIVE bet/count correlation as a contradictory signal, not simply zero support", () => {
    // Bets DECREASE as true count rises -- the opposite of counting behavior.
    const observations = makeObservations(60, (tc) => 100 - Math.max(0, tc) * 15);
    const result = runConfidenceEngine(observations, { insuranceTrueCountThreshold: 3 });
    expect(result.contradictorySignals.length).toBeGreaterThan(0);
    expect(result.classification).not.toBe("HIGH");
    expect(result.classification).not.toBe("VERY_HIGH");
  });
});

describe("runConfidenceEngine — output shape discipline", () => {
  it("never outputs a bare boolean — classification is always one of the five documented states", () => {
    const observations = makeObservations(60, (tc) => 10 + Math.max(0, tc) * 40);
    const result = runConfidenceEngine(observations, { insuranceTrueCountThreshold: 3 });
    expect(["INSUFFICIENT_DATA", "LOW", "MODERATE", "HIGH", "VERY_HIGH"]).toContain(result.classification);
  });

  it("stamps every input analytic's version for traceability", () => {
    const observations = makeObservations(20, (tc) => 10 + Math.max(0, tc) * 40);
    const result = runConfidenceEngine(observations, { insuranceTrueCountThreshold: 3 });
    expect(result.inputVersions.betCountAnalyticsVersion).toBeGreaterThan(0);
    expect(result.inputVersions.playingDeviationVersion).toBeGreaterThan(0);
    expect(result.inputVersions.insuranceAnalysisVersion).toBeGreaterThan(0);
    expect(result.inputVersions.entryExitVersion).toBeGreaterThan(0);
  });

  it("returns a valid, non-throwing result for zero observations", () => {
    const result = runConfidenceEngine([], { insuranceTrueCountThreshold: 3 });
    expect(result.classification).toBe("INSUFFICIENT_DATA");
    expect(result.handsObserved).toBe(0);
  });
});

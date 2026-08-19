import { describe, expect, it } from "vitest";
import {
  computeBetCountAnalytics,
  computeBetSpread,
  computeCountThresholdResponse,
  linearRegression,
  pearsonCorrelation,
} from "./betCountAnalytics";
import type { PlayerObservation } from "./playerObservation";

function obs(n: number, wager: number, trueCount: number, runningCount = trueCount, overrides: Partial<PlayerObservation> = {}): PlayerObservation {
  return {
    schemaVersion: 1,
    id: `o${n}`,
    investigationId: "inv-1",
    investigationDisplayId: "BJ-1",
    playerGroupId: null,
    tableIdentifier: "BJ-1",
    spotNumber: 1,
    shoeNumber: 1,
    roundNumber: n,
    handSequenceNumber: n,
    timestamp: new Date(2026, 0, 1, 0, n).toISOString(),
    isSplitHand: false,
    wagerAmount: wager,
    startingWagerAmount: wager,
    wagerChangeDirection: "same",
    wagerChangeAmount: 0,
    runningCountAtWager: runningCount,
    trueCountAtWager: trueCount,
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

describe("pearsonCorrelation", () => {
  it("returns a near-perfect positive correlation for a linear relationship", () => {
    expect(pearsonCorrelation([1, 2, 3, 4, 5], [10, 20, 30, 40, 50])).toBeCloseTo(1, 5);
  });

  it("returns 0 for fewer than 3 samples", () => {
    expect(pearsonCorrelation([1, 2], [1, 2])).toBe(0);
  });

  it("returns 0 for zero variance", () => {
    expect(pearsonCorrelation([5, 5, 5], [1, 2, 3])).toBe(0);
  });
});

describe("linearRegression", () => {
  it("recovers the exact slope/intercept of a noiseless line, with rSquared 1", () => {
    const fit = linearRegression([0, 1, 2, 3], [10, 15, 20, 25]);
    expect(fit).not.toBeNull();
    expect(fit!.slope).toBeCloseTo(5, 5);
    expect(fit!.intercept).toBeCloseTo(10, 5);
    expect(fit!.rSquared).toBeCloseTo(1, 5);
  });

  it("returns null for zero variance in x", () => {
    expect(linearRegression([5, 5, 5], [1, 2, 3])).toBeNull();
  });
});

describe("computeBetSpread", () => {
  it("computes min/max/ratio", () => {
    expect(computeBetSpread([10, 25, 100, 10])).toEqual({ minWager: 10, maxWager: 100, ratio: 10, sampleSize: 4 });
  });

  it("returns null for an empty sample", () => {
    expect(computeBetSpread([])).toBeNull();
  });
});

describe("computeCountThresholdResponse", () => {
  it("computes positive-count increase rate and negative-count decrease rate from consecutive transitions", () => {
    const samples = [
      { wager: 10, runningCount: 1, trueCount: 1, handSequenceNumber: 1 },
      { wager: 50, runningCount: 3, trueCount: 3, handSequenceNumber: 2 }, // positive count, increase
      { wager: 10, runningCount: -2, trueCount: -2, handSequenceNumber: 3 }, // negative count, decrease
      { wager: 10, runningCount: -2, trueCount: -2, handSequenceNumber: 4 }, // same wager, ignored
    ];
    const response = computeCountThresholdResponse(samples);
    expect(response.positiveCountBetIncreaseRate).toBe(1);
    expect(response.positiveCountTransitionSampleSize).toBe(1);
    expect(response.negativeCountBetDecreaseRate).toBe(1);
    expect(response.negativeCountTransitionSampleSize).toBe(1);
  });

  it("returns null rates with zero denominators, never a fabricated 0", () => {
    const response = computeCountThresholdResponse([]);
    expect(response.positiveCountBetIncreaseRate).toBeNull();
    expect(response.negativeCountBetDecreaseRate).toBeNull();
  });
});

describe("computeBetCountAnalytics", () => {
  it("shows strong positive correlation for a player who scales wager directly with true count", () => {
    const observations = [
      obs(1, 10, -2),
      obs(2, 10, -1),
      obs(3, 10, 0),
      obs(4, 50, 2),
      obs(5, 100, 4),
      obs(6, 150, 6),
    ];
    const result = computeBetCountAnalytics(observations);
    expect(result.sampleSize).toBe(6);
    expect(result.correlationWithTrueCount).toBeGreaterThan(0.9);
    expect(result.regressionOnTrueCount).not.toBeNull();
    expect(result.regressionOnTrueCount!.slope).toBeGreaterThan(0);
    expect(result.averageWagerAtPositiveCount).toBeGreaterThan(result.averageWagerAtNegativeOrZeroCount!);
  });

  it("shows near-zero correlation for a flat bettor regardless of count", () => {
    const observations = [obs(1, 25, -3), obs(2, 25, -1), obs(3, 25, 1), obs(4, 25, 3), obs(5, 25, 5)];
    const result = computeBetCountAnalytics(observations);
    expect(Math.abs(result.correlationWithTrueCount ?? 0)).toBeLessThan(0.3);
  });

  it("excludes split sub-hands and observations with no usable wager/count data", () => {
    const observations = [
      obs(1, 10, 1),
      obs(2, 999, 5, 5, { isSplitHand: true }),
      obs(3, 20, null as unknown as number, null as unknown as number, { trueCountAtWager: null, runningCountAtWager: null }),
    ];
    const result = computeBetCountAnalytics(observations);
    expect(result.sampleSize).toBe(1);
  });

  it("uses startingWagerAmount, never the post-double wagerAmount, for bet-sizing analytics", () => {
    const observations = [
      obs(1, 10, 1, 1, { startingWagerAmount: 10, wagerAmount: 20 }), // doubled mid-hand
      obs(2, 10, 1, 1, { startingWagerAmount: 10, wagerAmount: 10 }),
      obs(3, 10, 1, 1, { startingWagerAmount: 10, wagerAmount: 10 }),
    ];
    const result = computeBetCountAnalytics(observations);
    expect(result.betSpread!.maxWager).toBe(10); // not 20
  });

  it("returns an empty-but-valid result (never throws) for zero observations", () => {
    const result = computeBetCountAnalytics([]);
    expect(result.sampleSize).toBe(0);
    expect(result.correlationWithTrueCount).toBeNull();
    expect(result.betSpread).toBeNull();
  });
});

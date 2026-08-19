import type { PlayerObservation } from "./playerObservation";

/**
 * PRIORITY 1.7-2 — bet/count correlation analytics. Every function here is
 * a plain, explicit, testable statistical calculation over real
 * `PlayerObservation` data — Pearson correlation and ordinary least-squares
 * linear regression, both well-established, citable statistics, never an
 * invented formula.
 *
 * "Do not output 'counter' from correlation alone" (Priority 2's own rule):
 * nothing in this file returns a qualitative judgment, a label, or a
 * classification — only numbers and sample sizes. Turning these numbers
 * into an interpreted signal is the Confidence Engine's job
 * (confidenceEngine.ts), never this module's.
 *
 * Uses `startingWagerAmount`, never `wagerAmount` — a player's Double
 * changes `wagerAmount` mid-hand as a strategic reaction to their own
 * cards, not a pre-round bet-sizing decision, so it would contaminate a
 * "does this player size their INITIAL wager to the count" measurement.
 * Split sub-hands are excluded for the same reason as
 * lib/gold-standard/simulation/engine.ts's own split-aggregation rule —
 * they don't carry an independent bet-sizing decision of their own.
 */
export const BET_COUNT_ANALYTICS_VERSION = 1;

export interface LinearFit {
  slope: number;
  intercept: number;
  /** Coefficient of determination, 0..1 — how much of the wager's variation this straight-line fit against true count explains. Used as the "consistency across hands" measure Priority 2 asks for: a high R² means the player's bet size tracks a straight line against the count consistently, not just loosely correlated. */
  rSquared: number;
  sampleSize: number;
}

export interface BetSpread {
  minWager: number;
  maxWager: number;
  /** null when minWager is 0 (division by zero) — never silently reported as Infinity. */
  ratio: number | null;
  sampleSize: number;
}

export interface CountThresholdResponse {
  /** Of the hand-to-hand wager CHANGES observed while true count was positive going in, the fraction that were increases. Null with 0 denominator, never 0. */
  positiveCountBetIncreaseRate: number | null;
  /** Of the hand-to-hand wager CHANGES observed while true count was zero or negative going in, the fraction that were decreases. */
  negativeCountBetDecreaseRate: number | null;
  positiveCountTransitionSampleSize: number;
  negativeCountTransitionSampleSize: number;
}

export interface BetCountAnalyticsResult {
  version: number;
  sampleSize: number;
  correlationWithRunningCount: number | null;
  correlationWithTrueCount: number | null;
  /** Wager (starting) regressed on true count — slope is "extra wager units per +1 true count." */
  regressionOnTrueCount: LinearFit | null;
  betSpread: BetSpread | null;
  averageWagerAtPositiveCount: number | null;
  averageWagerAtNegativeOrZeroCount: number | null;
  countThresholdResponse: CountThresholdResponse;
}

interface UsableSample {
  wager: number;
  runningCount: number;
  trueCount: number;
  handSequenceNumber: number;
}

function usableSamples(observations: PlayerObservation[]): UsableSample[] {
  return observations
    .filter((o) => !o.isSplitHand && o.startingWagerAmount != null && o.trueCountAtWager != null && o.runningCountAtWager != null)
    .sort((a, b) => a.handSequenceNumber - b.handSequenceNumber)
    .map((o) => ({
      wager: o.startingWagerAmount as number,
      runningCount: o.runningCountAtWager as number,
      trueCount: o.trueCountAtWager as number,
      handSequenceNumber: o.handSequenceNumber,
    }));
}

/** Standard Pearson product-moment correlation coefficient, -1..1. Returns 0 for fewer than 3 samples or zero variance in either series — never NaN/Infinity. */
export function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3 || n !== ys.length) return 0;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let numerator = 0;
  let sumSqX = 0;
  let sumSqY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    numerator += dx * dy;
    sumSqX += dx * dx;
    sumSqY += dy * dy;
  }
  const denominator = Math.sqrt(sumSqX * sumSqY);
  return denominator === 0 ? 0 : numerator / denominator;
}

/** Ordinary least-squares linear regression of y on x. Returns null for fewer than 3 samples or zero variance in x (an undefined slope). */
export function linearRegression(xs: number[], ys: number[]): LinearFit | null {
  const n = xs.length;
  if (n < 3 || n !== ys.length) return null;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumXY += (xs[i] - meanX) * (ys[i] - meanY);
    sumXX += (xs[i] - meanX) * (xs[i] - meanX);
  }
  if (sumXX === 0) return null;
  const slope = sumXY / sumXX;
  const intercept = meanY - slope * meanX;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = intercept + slope * xs[i];
    ssRes += (ys[i] - predicted) ** 2;
    ssTot += (ys[i] - meanY) ** 2;
  }
  const rSquared = ssTot === 0 ? (ssRes === 0 ? 1 : 0) : 1 - ssRes / ssTot;

  return { slope, intercept, rSquared, sampleSize: n };
}

export function computeBetSpread(wagers: number[]): BetSpread | null {
  if (wagers.length === 0) return null;
  const minWager = Math.min(...wagers);
  const maxWager = Math.max(...wagers);
  return { minWager, maxWager, ratio: minWager === 0 ? null : maxWager / minWager, sampleSize: wagers.length };
}

export function computeCountThresholdResponse(samples: UsableSample[]): CountThresholdResponse {
  let positiveIncreases = 0;
  let positiveTransitions = 0;
  let negativeDecreases = 0;
  let negativeTransitions = 0;

  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const cur = samples[i];
    if (cur.wager === prev.wager) continue; // "same" is not evidence either way
    const wentUp = cur.wager > prev.wager;

    if (cur.trueCount > 0) {
      positiveTransitions += 1;
      if (wentUp) positiveIncreases += 1;
    } else {
      negativeTransitions += 1;
      if (!wentUp) negativeDecreases += 1;
    }
  }

  return {
    positiveCountBetIncreaseRate: positiveTransitions === 0 ? null : positiveIncreases / positiveTransitions,
    negativeCountBetDecreaseRate: negativeTransitions === 0 ? null : negativeDecreases / negativeTransitions,
    positiveCountTransitionSampleSize: positiveTransitions,
    negativeCountTransitionSampleSize: negativeTransitions,
  };
}

export function computeBetCountAnalytics(observations: PlayerObservation[]): BetCountAnalyticsResult {
  const samples = usableSamples(observations);
  const wagers = samples.map((s) => s.wager);
  const runningCounts = samples.map((s) => s.runningCount);
  const trueCounts = samples.map((s) => s.trueCount);

  const positiveWagers = samples.filter((s) => s.trueCount > 0).map((s) => s.wager);
  const negativeOrZeroWagers = samples.filter((s) => s.trueCount <= 0).map((s) => s.wager);
  const avg = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

  return {
    version: BET_COUNT_ANALYTICS_VERSION,
    sampleSize: samples.length,
    correlationWithRunningCount: samples.length === 0 ? null : pearsonCorrelation(wagers, runningCounts),
    correlationWithTrueCount: samples.length === 0 ? null : pearsonCorrelation(wagers, trueCounts),
    regressionOnTrueCount: linearRegression(trueCounts, wagers),
    betSpread: computeBetSpread(wagers),
    averageWagerAtPositiveCount: avg(positiveWagers),
    averageWagerAtNegativeOrZeroCount: avg(negativeOrZeroWagers),
    countThresholdResponse: computeCountThresholdResponse(samples),
  };
}

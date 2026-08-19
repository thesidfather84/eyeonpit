import { computeBetCountAnalytics, type BetCountAnalyticsResult } from "./betCountAnalytics";
import { computeEntryExitEvidence, type EntryExitEvidence } from "./entryExitAnalysis";
import { computeInsuranceAnalysis, type InsuranceAnalysisResult } from "./insuranceAnalysis";
import { computePlayingDeviationSummary, type PlayingDeviationSummary, type IndexDeviationTable } from "./playingDeviationAnalysis";
import type { PlayerObservation } from "./playerObservation";

/**
 * PRIORITY 1.7-6 — the Counter Detection / Confidence Engine.
 *
 * STATUS: EXPERIMENTAL / NOT VALIDATED. This is a real, deterministic,
 * versioned, fully-tested implementation — but its scoring weights and
 * classification thresholds are an initial, documented DESIGN, not yet
 * proven against real-world or benchmark data. Priority 7's validation
 * harness (validation/benchmarkHarness.ts) exists specifically to measure
 * whether this design's thresholds are defensible — do not present this
 * engine's output as a validated capability anywhere product-facing until
 * that harness's results say so (see docs/EYEONPIT_1_7_COUNTER_DETECTION.md).
 *
 * "The system must NEVER classify a player simply because N hands have
 * elapsed" — the hand-count floors below (`MIN_HANDS_FOR_*`) are a
 * NECESSARY, not sufficient, gate: they only ever CAP how high a
 * classification can go when evidence is thin; they never by themselves
 * PRODUCE a HIGH/VERY_HIGH classification. A player with 200 hands of
 * perfectly flat, count-independent betting stays LOW forever — hand count
 * alone never promotes anyone.
 *
 * "Do NOT use binary counter/not-counter as the only output" — the only
 * exported classification type is the five-state
 * `CounterClassificationState` enum; nothing in this file ever collapses
 * that to a boolean.
 */
export const CONFIDENCE_ENGINE_VERSION = 1;

export type CounterClassificationState = "INSUFFICIENT_DATA" | "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";

/** Below this many hands with usable wager/count evidence, classification is ALWAYS INSUFFICIENT_DATA regardless of how strong the available signals look — small-N correlations are statistical noise, not evidence. */
export const MIN_HANDS_FOR_ANY_CLASSIFICATION = 15;
/** A HIGH classification additionally requires at least this many usable hands, even if the weighted score alone would qualify. */
export const MIN_HANDS_FOR_HIGH = 30;
/** A VERY_HIGH classification additionally requires at least this many usable hands — this is the number Priority 7's benchmark harness exists to validate (or refute) against the ~50-hand product target. */
export const MIN_HANDS_FOR_VERY_HIGH = 50;

/** Score thresholds — a starting, documented design, not yet benchmark-validated. */
const SCORE_THRESHOLD_MODERATE = 0.35;
const SCORE_THRESHOLD_HIGH = 0.55;
const SCORE_THRESHOLD_VERY_HIGH = 0.75;

/** Shrinkage constant for the sample-size confidence weight `n / (n + K)` — a standard regularization technique (larger n asymptotically approaches full weight; small n is heavily discounted) applied per signal so a strong-looking correlation from 3 hands can't dominate the score the way it would from 40. */
const SAMPLE_SIZE_SHRINKAGE_K = 10;
/** A raw metric beyond this negative magnitude is flagged as a contradictory signal, not merely "no support." */
const CONTRADICTION_THRESHOLD = -0.3;

export type SignalDirection = "supports-counting" | "contradicts-counting" | "neutral";

export interface ContributingSignal {
  signalKey: string;
  description: string;
  /** 0..1, how strongly (once available) this signal supports count-consistent behavior. */
  strength: number;
  sampleSize: number;
  direction: SignalDirection;
}

export interface ConfidenceEngineInputVersions {
  betCountAnalyticsVersion: number;
  playingDeviationVersion: number;
  insuranceAnalysisVersion: number;
  entryExitVersion: number;
}

export interface ConfidenceEngineResult {
  version: number;
  handsObserved: number;
  handsWithUsableEvidence: number;
  classification: CounterClassificationState;
  confidenceScore: number;
  reasonCodes: string[];
  strongestContributingSignals: ContributingSignal[];
  contradictorySignals: ContributingSignal[];
  allSignals: ContributingSignal[];
  minimumHandsForClassification: number;
  inputVersions: ConfidenceEngineInputVersions;
  betCountAnalytics: BetCountAnalyticsResult;
  playingDeviation: PlayingDeviationSummary;
  insuranceAnalysis: InsuranceAnalysisResult;
  entryExitEvidence: EntryExitEvidence;
}

export interface ConfidenceEngineOptions {
  insuranceTrueCountThreshold: number;
  indexDeviationTable?: IndexDeviationTable;
  ruleSet?: Parameters<typeof computePlayingDeviationSummary>[1];
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function buildSignals(
  bet: BetCountAnalyticsResult,
  deviation: PlayingDeviationSummary,
  insurance: InsuranceAnalysisResult,
  entryExit: EntryExitEvidence
): ContributingSignal[] {
  const signals: ContributingSignal[] = [];

  if (bet.correlationWithTrueCount != null && bet.sampleSize > 0) {
    const r = bet.correlationWithTrueCount;
    signals.push({
      signalKey: "bet-count-correlation",
      description: "Correlation between starting wager size and true count at the time of the bet.",
      strength: clamp01(r),
      sampleSize: bet.sampleSize,
      direction: r <= CONTRADICTION_THRESHOLD ? "contradicts-counting" : r > 0 ? "supports-counting" : "neutral",
    });
  }

  if (bet.regressionOnTrueCount != null) {
    const fit = bet.regressionOnTrueCount;
    signals.push({
      signalKey: "bet-count-regression-fit",
      description: "How consistently (R²) the wager tracks a straight line against true count.",
      strength: fit.slope > 0 ? clamp01(fit.rSquared) : 0,
      sampleSize: fit.sampleSize,
      direction: fit.slope > 0 && fit.rSquared > 0.3 ? "supports-counting" : "neutral",
    });
  }

  const thresholdRates = [bet.countThresholdResponse.positiveCountBetIncreaseRate, bet.countThresholdResponse.negativeCountBetDecreaseRate].filter(
    (v): v is number => v != null
  );
  if (thresholdRates.length > 0) {
    const avg = thresholdRates.reduce((a, b) => a + b, 0) / thresholdRates.length;
    signals.push({
      signalKey: "count-threshold-response",
      description: "How consistently the player raises wagers after a positive-count swing and lowers them after a negative one.",
      strength: clamp01(avg),
      sampleSize: bet.countThresholdResponse.positiveCountTransitionSampleSize + bet.countThresholdResponse.negativeCountTransitionSampleSize,
      direction: avg > 0.6 ? "supports-counting" : avg < 0.25 ? "contradicts-counting" : "neutral",
    });
  }

  if (deviation.indexTableProvided && deviation.indexConsistentDeviationRate != null) {
    const rate = deviation.indexConsistentDeviationRate;
    signals.push({
      signalKey: "playing-deviation-index-consistency",
      description: "Fraction of known index-play situations where the player's deviation matched the published index.",
      strength: clamp01(rate),
      sampleSize: deviation.opportunities.filter((o) => o.indexEntryUsed != null).length,
      direction: rate > 0.6 ? "supports-counting" : "neutral",
    });
  }

  if (insurance.countConsistentRate != null) {
    const rate = insurance.countConsistentRate;
    signals.push({
      signalKey: "insurance-count-consistency",
      description: "Fraction of insurance decisions consistent with the configured true-count threshold.",
      strength: clamp01(rate),
      sampleSize: insurance.decisions.filter((d) => d.countConsistent != null).length,
      direction: rate > 0.7 ? "supports-counting" : rate < 0.3 ? "contradicts-counting" : "neutral",
    });
  }

  const entryExitRates = [entryExit.entryCountConsistencyRate, entryExit.exitCountConsistencyRate].filter((v): v is number => v != null);
  if (entryExitRates.length > 0) {
    const avg = entryExitRates.reduce((a, b) => a + b, 0) / entryExitRates.length;
    signals.push({
      signalKey: "entry-exit-consistency",
      description: "How consistently the player enters/resumes at favorable counts and leaves/sits out at unfavorable ones.",
      strength: clamp01(avg),
      sampleSize: entryExit.resumeCount + entryExit.exits.length,
      direction: avg > 0.6 ? "supports-counting" : "neutral",
    });
  }

  return signals;
}

function classify(confidenceScore: number, handsWithUsableEvidence: number): CounterClassificationState {
  if (handsWithUsableEvidence < MIN_HANDS_FOR_ANY_CLASSIFICATION) return "INSUFFICIENT_DATA";
  if (confidenceScore >= SCORE_THRESHOLD_VERY_HIGH && handsWithUsableEvidence >= MIN_HANDS_FOR_VERY_HIGH) return "VERY_HIGH";
  if (confidenceScore >= SCORE_THRESHOLD_HIGH && handsWithUsableEvidence >= MIN_HANDS_FOR_HIGH) return "HIGH";
  if (confidenceScore >= SCORE_THRESHOLD_MODERATE) return "MODERATE";
  return "LOW";
}

function buildReasonCodes(
  classification: CounterClassificationState,
  handsWithUsableEvidence: number,
  signals: ContributingSignal[]
): string[] {
  const codes: string[] = [];
  if (classification === "INSUFFICIENT_DATA") {
    codes.push(`insufficient-hands:${handsWithUsableEvidence}<${MIN_HANDS_FOR_ANY_CLASSIFICATION}`);
    return codes;
  }
  if (signals.length === 0) codes.push("no-usable-signals");
  for (const s of signals) {
    if (s.direction === "supports-counting") codes.push(`supports:${s.signalKey}`);
    if (s.direction === "contradicts-counting") codes.push(`contradicts:${s.signalKey}`);
  }
  if ((classification === "HIGH" || classification === "VERY_HIGH") && handsWithUsableEvidence < MIN_HANDS_FOR_VERY_HIGH) {
    codes.push(`capped-by-sample-size:${handsWithUsableEvidence}<${MIN_HANDS_FOR_VERY_HIGH}`);
  }
  return codes;
}

/**
 * The single entry point — runs every Priority 2-5 analytic over the same
 * observation set and combines them into one classification. Each signal
 * is weighted by a sample-size-based confidence factor (`n / (n + K)`) so
 * a strong-looking signal from very few hands cannot dominate the score
 * the way the same strength from many hands would.
 */
export function runConfidenceEngine(observations: PlayerObservation[], options: ConfidenceEngineOptions): ConfidenceEngineResult {
  const bet = computeBetCountAnalytics(observations);
  const deviation = computePlayingDeviationSummary(observations, options.ruleSet, options.indexDeviationTable ?? []);
  const insurance = computeInsuranceAnalysis(observations, options.insuranceTrueCountThreshold);
  const entryExit = computeEntryExitEvidence(observations);

  const signals = buildSignals(bet, deviation, insurance, entryExit);

  let totalWeightedStrength = 0;
  let totalWeight = 0;
  for (const s of signals) {
    if (s.direction === "contradicts-counting") continue; // contradictory evidence pulls confidence down structurally, not by contributing a positive weighted term
    const weight = s.sampleSize / (s.sampleSize + SAMPLE_SIZE_SHRINKAGE_K);
    totalWeightedStrength += s.strength * weight;
    totalWeight += weight;
  }
  const contradictoryCount = signals.filter((s) => s.direction === "contradicts-counting").length;
  const rawScore = totalWeight === 0 ? 0 : totalWeightedStrength / totalWeight;
  // Each contradictory signal discounts the score — never allowed to push it negative.
  const confidenceScore = clamp01(rawScore * (1 - 0.25 * contradictoryCount));

  const handsWithUsableEvidence = bet.sampleSize;
  const handsObserved = new Set(observations.map((o) => o.handSequenceNumber)).size;

  const classification = classify(confidenceScore, handsWithUsableEvidence);
  const sortedByStrength = [...signals].filter((s) => s.direction !== "contradicts-counting").sort((a, b) => b.strength - a.strength);

  return {
    version: CONFIDENCE_ENGINE_VERSION,
    handsObserved,
    handsWithUsableEvidence,
    classification,
    confidenceScore,
    reasonCodes: buildReasonCodes(classification, handsWithUsableEvidence, signals),
    strongestContributingSignals: sortedByStrength.slice(0, 3),
    contradictorySignals: signals.filter((s) => s.direction === "contradicts-counting"),
    allSignals: signals,
    minimumHandsForClassification: MIN_HANDS_FOR_ANY_CLASSIFICATION,
    inputVersions: {
      betCountAnalyticsVersion: bet.version,
      playingDeviationVersion: deviation.version,
      insuranceAnalysisVersion: insurance.version,
      entryExitVersion: entryExit.version,
    },
    betCountAnalytics: bet,
    playingDeviation: deviation,
    insuranceAnalysis: insurance,
    entryExitEvidence: entryExit,
  };
}

import { ENGINE_VERSIONS } from "@/lib/versioning/types";
import type { Report, ReportAnalysisSection } from "@/lib/reporting/reportSchema";
import { runConfidenceEngine, type ConfidenceEngineOptions } from "./confidenceEngine";
import { extractPlayerObservations, type ExtractObservationsOptions } from "./extractObservations";
import { PLAYER_OBSERVATION_SCHEMA_VERSION, type PlayerObservation } from "./playerObservation";

/**
 * PRIORITY 1.7-9 — the ONLY place a Report gains 1.7 analytics fields.
 * Deliberately a separate, explicit, opt-in step — NEVER called from
 * `buildReportFromInvestigation` (see reportSchema.ts's own doc comment on
 * `counterAnalysisBySeat` for why). Calling this is a deliberate analyst
 * action, not something every report silently accumulates, because the
 * Confidence Engine behind it is EXPERIMENTAL / NOT VALIDATED — see
 * docs/EYEONPIT_1_7_COUNTER_DETECTION.md.
 *
 * "Only show these sections when real validated data exists... Do NOT
 * present experimental analysis as fact" (Priority 9's own rules) is
 * enforced structurally: `attachPlayerAnalytics` ALWAYS stamps
 * `methodology.validationStatus: "EXPERIMENTAL_NOT_VALIDATED"` alongside
 * any analytics field it adds — there is no code path that adds one
 * without the other.
 *
 * SCOPE LIMITATION (documented, not hidden): analytics are computed PER
 * SEAT, not merged across seats that share the same `playerGroupId` — a
 * player occupying two spots gets two separate analyses rather than one
 * combined one. Cross-seat evidence merging is real additional complexity
 * (which seat's cards "count" toward which decision point, etc.) left for
 * separately-scoped future work rather than guessed at here.
 */

export interface SeatAnalyticsOptions {
  seatNumber: number;
  observations: PlayerObservation[];
  confidenceOptions: ConfidenceEngineOptions;
}

const METHODOLOGY_LIMITATIONS = [
  "Confidence Engine thresholds are an initial, documented design — not yet validated against real-world player data (see docs/EYEONPIT_1_7_COUNTER_DETECTION.md).",
  "Playing-deviation index-consistency is only evaluated when a real, sourced index table was explicitly supplied; otherwise that signal is entirely absent from the score.",
  "Only the first decision point of each hand is evaluated for basic-strategy consistency.",
  "This is an investigative indicator, not an accusation or a legal conclusion — human judgment is always final.",
];

/**
 * Groups a full investigation's PlayerObservation[] by seat number
 * (splits included with their parent seat) — the shape
 * `attachPlayerAnalytics` expects one entry per seat for.
 */
export function groupObservationsBySeat(observations: PlayerObservation[]): Map<number, PlayerObservation[]> {
  const bySeat = new Map<number, PlayerObservation[]>();
  for (const obs of observations) {
    const existing = bySeat.get(obs.spotNumber);
    if (existing) existing.push(obs);
    else bySeat.set(obs.spotNumber, [obs]);
  }
  return bySeat;
}

export { extractPlayerObservations };
export type { ExtractObservationsOptions };

/**
 * Runs the full 1.7 analytics pipeline for every seat and returns a NEW
 * Report with `analysis` populated — never mutates the input `report`.
 * Existing `analysis` fields (e.g. the pre-existing
 * `betCountCorrelationBySeat`) are preserved, not overwritten.
 */
export function attachPlayerAnalytics(report: Report, seats: SeatAnalyticsOptions[]): Report {
  const counterAnalysisBySeat: NonNullable<ReportAnalysisSection["counterAnalysisBySeat"]> = [];
  const bettingAnalysisBySeat: NonNullable<ReportAnalysisSection["bettingAnalysisBySeat"]> = [];
  const playingDeviationAnalysisBySeat: NonNullable<ReportAnalysisSection["playingDeviationAnalysisBySeat"]> = [];
  const insuranceAnalysisBySeat: NonNullable<ReportAnalysisSection["insuranceAnalysisBySeat"]> = [];
  const observationConfidenceBySeat: NonNullable<ReportAnalysisSection["observationConfidenceBySeat"]> = [];

  for (const seat of seats) {
    if (seat.observations.length === 0) continue;
    const playerGroupId = seat.observations[0].playerGroupId;
    const result = runConfidenceEngine(seat.observations, seat.confidenceOptions);

    counterAnalysisBySeat.push({
      seatNumber: seat.seatNumber,
      playerGroupId,
      classification: result.classification,
      confidenceScore: result.confidenceScore,
      reasonCodes: result.reasonCodes,
      strongestContributingSignals: result.strongestContributingSignals.map((s) => ({ signalKey: s.signalKey, description: s.description, strength: s.strength })),
      contradictorySignals: result.contradictorySignals.map((s) => ({ signalKey: s.signalKey, description: s.description, strength: s.strength })),
      engineVersion: result.version,
    });

    bettingAnalysisBySeat.push({
      seatNumber: seat.seatNumber,
      playerGroupId,
      sampleSize: result.betCountAnalytics.sampleSize,
      correlationWithTrueCount: result.betCountAnalytics.correlationWithTrueCount,
      betSpread: result.betCountAnalytics.betSpread
        ? { minWager: result.betCountAnalytics.betSpread.minWager, maxWager: result.betCountAnalytics.betSpread.maxWager, ratio: result.betCountAnalytics.betSpread.ratio }
        : null,
      version: result.betCountAnalytics.version,
    });

    playingDeviationAnalysisBySeat.push({
      seatNumber: seat.seatNumber,
      playerGroupId,
      totalOpportunities: result.playingDeviation.totalOpportunities,
      totalDeviations: result.playingDeviation.totalDeviations,
      deviationRate: result.playingDeviation.deviationRate,
      indexTableProvided: result.playingDeviation.indexTableProvided,
      indexConsistentDeviationRate: result.playingDeviation.indexConsistentDeviationRate,
      version: result.playingDeviation.version,
    });

    insuranceAnalysisBySeat.push({
      seatNumber: seat.seatNumber,
      playerGroupId,
      timesOffered: result.insuranceAnalysis.timesOffered,
      timesTaken: result.insuranceAnalysis.timesTaken,
      countConsistentRate: result.insuranceAnalysis.countConsistentRate,
      trueCountThresholdUsed: result.insuranceAnalysis.trueCountThresholdUsed,
      version: result.insuranceAnalysis.version,
    });

    observationConfidenceBySeat.push({
      seatNumber: seat.seatNumber,
      handsObserved: result.handsObserved,
      handsWithUsableEvidence: result.handsWithUsableEvidence,
      minimumHandsForClassification: result.minimumHandsForClassification,
    });
  }

  if (counterAnalysisBySeat.length === 0) return report;

  return {
    ...report,
    analysis: {
      ...report.analysis,
      counterAnalysisBySeat,
      bettingAnalysisBySeat,
      playingDeviationAnalysisBySeat,
      insuranceAnalysisBySeat,
      observationConfidenceBySeat,
      methodology: {
        playerObservationSchemaVersion: PLAYER_OBSERVATION_SCHEMA_VERSION,
        confidenceEngineVersion: counterAnalysisBySeat[0].engineVersion,
        validationStatus: "EXPERIMENTAL_NOT_VALIDATED",
        limitations: METHODOLOGY_LIMITATIONS,
      },
    },
    versionInfo: {
      ...report.versionInfo,
      analyticsVersions: [
        ...report.versionInfo.analyticsVersions,
        { id: "player-analytics", version: Number(ENGINE_VERSIONS.playerAnalytics.split(".")[0]) || 0 },
      ],
    },
  };
}

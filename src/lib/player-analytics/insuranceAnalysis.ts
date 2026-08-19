import type { VersionRef } from "@/lib/versioning/types";
import type { PlayerObservation } from "./playerObservation";

/**
 * PRIORITY 1.7-4 — insurance analysis. Compares each recorded insurance
 * decision (only possible when the dealer's first card is an Ace — see
 * extractObservations.ts's `insuranceOffered` derivation) against a
 * CALLER-SUPPLIED true-count threshold.
 *
 * "Do not hard-code one universal insurance threshold" (this priority's
 * own rule): `computeInsuranceAnalysis` takes `trueCountThreshold` as a
 * REQUIRED argument — there is no default baked into the function. A
 * documented, widely-published Hi-Lo reference value is exported below as
 * `HI_LO_INSURANCE_REFERENCE_TRUE_COUNT` purely as a convenience a caller
 * MAY choose to pass; the module itself never assumes it.
 *
 * Split sub-hands are excluded — insurance is a single per-round decision
 * made before any hand (main or split) plays out, so counting it once per
 * split sub-hand would double-count the same real-world decision.
 */
export const INSURANCE_ANALYSIS_VERSION = 1;

/** The widely-published Hi-Lo insurance index (take insurance at true count +3 or higher) — see docs/counting-systems.md. A reference value only, never applied automatically. */
export const HI_LO_INSURANCE_REFERENCE_TRUE_COUNT = 3;

export interface InsuranceDecision {
  observationId: string;
  handSequenceNumber: number;
  trueCountAtWager: number | null;
  countMethodRef: VersionRef | null;
  taken: boolean;
  /** Whether the supplied threshold recommends taking insurance here — null when the true count wasn't available. */
  thresholdRecommendsTaking: boolean | null;
  /** taken === thresholdRecommendsTaking, when known — never guessed when the count is unavailable. */
  countConsistent: boolean | null;
}

export interface InsuranceAnalysisResult {
  version: number;
  trueCountThresholdUsed: number;
  timesOffered: number;
  timesTaken: number;
  timesDeclined: number;
  decisions: InsuranceDecision[];
  /** Of decisions with a known true count, the fraction where the player's actual choice (take/decline) matched what the supplied threshold would recommend. Null when no decision had a usable true count. */
  countConsistentRate: number | null;
}

export function computeInsuranceAnalysis(observations: PlayerObservation[], trueCountThreshold: number): InsuranceAnalysisResult {
  const offered = observations.filter((o) => !o.isSplitHand && o.insuranceOffered);

  const decisions: InsuranceDecision[] = offered.map((o) => {
    const taken = o.insuranceTaken === true;
    const thresholdRecommendsTaking = o.trueCountAtWager == null ? null : o.trueCountAtWager >= trueCountThreshold;
    return {
      observationId: o.id,
      handSequenceNumber: o.handSequenceNumber,
      trueCountAtWager: o.trueCountAtWager,
      countMethodRef: o.countMethodRef,
      taken,
      thresholdRecommendsTaking,
      countConsistent: thresholdRecommendsTaking == null ? null : taken === thresholdRecommendsTaking,
    };
  });

  const withKnownCount = decisions.filter((d) => d.countConsistent != null);
  const consistentCount = withKnownCount.filter((d) => d.countConsistent).length;

  return {
    version: INSURANCE_ANALYSIS_VERSION,
    trueCountThresholdUsed: trueCountThreshold,
    timesOffered: offered.length,
    timesTaken: decisions.filter((d) => d.taken).length,
    timesDeclined: decisions.filter((d) => !d.taken).length,
    decisions,
    countConsistentRate: withKnownCount.length === 0 ? null : consistentCount / withKnownCount.length,
  };
}

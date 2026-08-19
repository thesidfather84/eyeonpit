import { describe, expect, it } from "vitest";
import { runConfidenceEngine, type CounterClassificationState } from "../confidenceEngine";
import {
  briefEntryBettor,
  highRollerVariableBettor,
  martingaleBettor,
  progressiveBettor,
  randomInsuranceBettor,
} from "./syntheticArchetypes";

/**
 * PRIORITY 1.7-8 — explicit false-positive safety tests. Each of these
 * archetypes is DESIGNED to look erratic/streaky/systematic in a way that
 * could plausibly be mistaken for count-consistent behavior by a naive
 * detector — none of them actually respond to the count at all. "The
 * system must be conservative. It is better to say INSUFFICIENT_DATA than
 * make a weak accusation" (this priority's own rule) — every test here
 * asserts the Confidence Engine NEVER reaches HIGH/VERY_HIGH for these
 * patterns, across multiple seeds and multiple hand counts.
 */
const NOT_A_COUNTER: CounterClassificationState[] = ["INSUFFICIENT_DATA", "LOW", "MODERATE"];
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const HAND_COUNTS = [30, 50, 75, 100];

function assertNeverFlaggedAsCounter(
  archetype: (seed: number, handCount: number) => { observations: import("../playerObservation").PlayerObservation[] },
  label: string
) {
  for (const seed of SEEDS) {
    for (const handCount of HAND_COUNTS) {
      const { observations } = archetype(seed, handCount);
      const result = runConfidenceEngine(observations, { insuranceTrueCountThreshold: 3 });
      expect(
        NOT_A_COUNTER,
        `${label} (seed ${seed}, ${handCount} hands) reached ${result.classification} — a conservative-safety violation`
      ).toContain(result.classification);
    }
  }
}

describe("Priority 8 — false-positive safety: adversarial non-counter patterns never reach HIGH/VERY_HIGH", () => {
  it("a lucky-streak / press-your-win progressive bettor is never flagged as a counter", () => {
    assertNeverFlaggedAsCounter(progressiveBettor, "progressive-lucky-streak");
  });

  it("a martingale bettor (doubles after a loss) is never flagged as a counter", () => {
    assertNeverFlaggedAsCounter(martingaleBettor, "martingale");
  });

  it("a high roller with large, naturally variable bets (count-independent) is never flagged as a counter", () => {
    assertNeverFlaggedAsCounter(highRollerVariableBettor, "high-roller-variable");
  });

  it("a player who takes insurance at random is never flagged as a counter", () => {
    assertNeverFlaggedAsCounter(randomInsuranceBettor, "random-insurance");
  });

  it("a player who only plays a few hands stays INSUFFICIENT_DATA rather than an accusation from thin evidence", () => {
    for (const seed of SEEDS) {
      const { observations } = briefEntryBettor(seed, 100); // the archetype itself truncates to ~8 real hands
      const result = runConfidenceEngine(observations.slice(0, 8), { insuranceTrueCountThreshold: 3 });
      expect(result.classification).toBe("INSUFFICIENT_DATA");
    }
  });
});

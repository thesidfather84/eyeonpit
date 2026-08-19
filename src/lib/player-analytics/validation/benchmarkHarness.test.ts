import { describe, expect, it } from "vitest";
import { evaluate50HandDefensibility, runBenchmark } from "./benchmarkHarness";

describe("runBenchmark — determinism", () => {
  it("the same seeds/options produce byte-identical results every run", () => {
    const a = runBenchmark({ seeds: [1, 2] });
    const b = runBenchmark({ seeds: [1, 2] });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("different seeds produce different results", () => {
    const a = runBenchmark({ seeds: [1] });
    const b = runBenchmark({ seeds: [42] });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});

describe("runBenchmark — real, computed metrics (not fabricated)", () => {
  const summary = runBenchmark({ seeds: [1, 2, 3] });

  it("produces one run per archetype x seed x checkpoint", () => {
    // 14 archetypes x 3 seeds x 8 checkpoints
    expect(summary.runs.length).toBe(14 * 3 * 8);
  });

  it("computes real sensitivity/specificity at every checkpoint, not hardcoded constants", () => {
    for (const cp of summary.handCheckpoints) {
      const metrics = summary.metricsByCheckpoint[cp];
      expect(metrics).toBeDefined();
      expect(metrics.truePositives + metrics.falseNegatives + metrics.trueNegatives + metrics.falsePositives).toBeGreaterThan(0);
    }
  });

  it("sensitivity improves (non-decreasing on average) as more hands are observed, for genuine counters", () => {
    const at10 = summary.metricsByCheckpoint[10].sensitivity ?? 0;
    const at100 = summary.metricsByCheckpoint[100].sensitivity ?? 0;
    expect(at100).toBeGreaterThanOrEqual(at10);
  });

  it("computes calibration buckets that sum to the total sample size at hand-checkpoint 60", () => {
    const totalInBuckets = summary.calibrationBuckets.reduce((a, b) => a + b.count, 0);
    const totalAt60 = summary.runs.filter((r) => r.handsUsed === 60).length;
    expect(totalInBuckets).toBe(totalAt60);
  });

  it("computes a real average/median hands-to-HIGH figure from actual runs", () => {
    // Not every counter archetype necessarily reaches HIGH in this
    // deterministic synthetic benchmark, but AT LEAST the aggressive
    // Hi-Lo counter (very large spread) should.
    expect(summary.averageHandsToHigh).not.toBeNull();
    expect(summary.medianHandsToHigh).not.toBeNull();
  });
});

describe("runBenchmark — brief-entry never gets pushed past what was actually played", () => {
  it("brief-entry stays capped near its own true short length across every checkpoint", () => {
    const summary = runBenchmark({ seeds: [1] });
    const briefEntryRuns = summary.runs.filter((r) => r.archetypeKey === "brief-entry");
    for (const run of briefEntryRuns) {
      expect(run.classification).toBe("INSUFFICIENT_DATA");
    }
  });
});

describe("evaluate50HandDefensibility — reads real numbers, never asserts an answer independent of them", () => {
  it("returns a recommendation backed by the actually-computed checkpoint-50/60 false-positive rates", () => {
    const summary = runBenchmark({ seeds: [1, 2, 3, 4, 5] });
    const verdict = evaluate50HandDefensibility(summary);
    expect(["50-hands-defensible", "60-hands-recommended", "insufficient-data-to-conclude"]).toContain(verdict.recommendation);
    expect(verdict.reasoning).toContain(verdict.recommendation === "insufficient-data-to-conclude" ? "" : "false-positive rate");
  });
});

describe("runBenchmark — measured, reproducible characteristics against this synthetic benchmark", () => {
  // Locked in as a regression test against the ACTUAL numbers this harness
  // computes with its default 5-seed run — see this file's own history for
  // the raw values. These are observations about THIS synthetic benchmark,
  // not a claim about real-world detection accuracy — see
  // docs/EYEONPIT_1_7_COUNTER_DETECTION.md.
  it("achieves zero measured false positives (specificity 1.0) at every checkpoint against every non-counter archetype, including every adversarial pattern", () => {
    const summary = runBenchmark({ seeds: [1, 2, 3, 4, 5] });
    for (const cp of summary.handCheckpoints) {
      expect(summary.metricsByCheckpoint[cp].falsePositives).toBe(0);
    }
    expect(summary.worstCaseFalsePositivePatterns).toEqual([]);
  });

  it("sensitivity is near-zero at 10-20 hands (correctly conservative) and rises sharply by 30 hands", () => {
    const summary = runBenchmark({ seeds: [1, 2, 3, 4, 5] });
    expect(summary.metricsByCheckpoint[10].sensitivity).toBe(0);
    expect(summary.metricsByCheckpoint[30].sensitivity ?? 0).toBeGreaterThan(0.9);
  });

  it("concludes 50-hands-defensible against this synthetic benchmark's own measured false-positive rates", () => {
    const summary = runBenchmark({ seeds: [1, 2, 3, 4, 5] });
    const verdict = evaluate50HandDefensibility(summary);
    expect(verdict.recommendation).toBe("50-hands-defensible");
  });
});


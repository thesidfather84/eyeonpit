// @vitest-environment node
import { describe, expect, it } from "vitest";
import { VOICE_BENCHMARK_CORPUS, evaluateCorpusItem, computeBenchmarkMetrics } from "./voiceBenchmarkCorpus";

describe("voice benchmark corpus — EyeOnPit's own classifier scored against itself", () => {
  it("produces the correct accept/reject outcome for every corpus item", () => {
    for (const item of VOICE_BENCHMARK_CORPUS) {
      const result = evaluateCorpusItem(item);
      expect(result.accepted, `${item.id}: "${item.transcript}"`).toBe(item.expected.accepted);
    }
  });

  it("produces the correct target for every accepted item with an expected target", () => {
    for (const item of VOICE_BENCHMARK_CORPUS.filter((i) => i.expected.accepted && i.expected.targetKind)) {
      const result = evaluateCorpusItem(item);
      expect(result.correctTarget, `${item.id}: "${item.transcript}"`).toBe(true);
    }
  });

  it("produces the correct ranks for every accepted item with expected ranks", () => {
    for (const item of VOICE_BENCHMARK_CORPUS.filter((i) => i.expected.accepted && i.expected.ranks)) {
      const result = evaluateCorpusItem(item);
      expect(result.correctRanks, `${item.id}: "${item.transcript}"`).toBe(true);
    }
  });

  it("THE MOST IMPORTANT METRIC — zero false CardEvents across the entire corpus", () => {
    const falseCardEvents = VOICE_BENCHMARK_CORPUS.filter((item) => evaluateCorpusItem(item).falseCardEvent);
    expect(falseCardEvents.map((i) => i.id)).toEqual([]);
  });

  it("computeBenchmarkMetrics aggregates cleanly for the current (Chrome-backed) classifier", () => {
    const metrics = computeBenchmarkMetrics("eyeonpit-classifier-self-test");
    expect(metrics.totalItems).toBe(VOICE_BENCHMARK_CORPUS.length);
    expect(metrics.falseCardEvents).toBe(0);
    expect(metrics.completeCommandAccuracy).toBe(1);
    expect(metrics.validCommandAcceptanceRate).toBe(1);
    expect(metrics.validRejectionRate).toBe(1);
    // Not measurable in this environment — see the module's own doc comment.
    expect(metrics.averageLatencyMs).toBeNull();
    expect(metrics.medianLatencyMs).toBeNull();
    expect(metrics.cpuUsage).toBeNull();
    expect(metrics.memoryUsageMb).toBeNull();
    expect(metrics.modelDownloadSizeMb).toBeNull();
    expect(metrics.asrNoFinalRate).toBeNull();
  });

  it("computeBenchmarkMetrics works on an arbitrary subset (a future provider comparison would slice the same corpus)", () => {
    const subset = VOICE_BENCHMARK_CORPUS.slice(0, 3);
    const metrics = computeBenchmarkMetrics("subset-check", subset);
    expect(metrics.totalItems).toBe(3);
  });

  it("every corpus item's note is non-empty (documentation discipline, not scored)", () => {
    for (const item of VOICE_BENCHMARK_CORPUS) {
      expect(item.note.length).toBeGreaterThan(0);
    }
  });
});

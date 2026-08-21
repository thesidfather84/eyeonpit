import { describe, expect, it } from "vitest";
import {
  DEFAULT_AB_CONFIG,
  resolveAbConfigProviderOptions,
  computeAggregatesByConfig,
  type AbTestRecordLike,
} from "./sherpaAbTestHarness";
import type { HotwordEntry } from "./casinoVoiceContext";

const hotwordList: HotwordEntry[] = [{ phrase: "dealer", weight: 10, reason: "casino vocabulary" }];
const bpeVocabUrl = "/sherpa-onnx-lab/bpe.vocab";

describe("DEFAULT_AB_CONFIG — REGRESSION (item 9 context): C is the preferred Lab default per the real 2026-08-20 A/B/C mic session", () => {
  it("defaults to C", () => {
    expect(DEFAULT_AB_CONFIG).toBe("C");
  });
});

describe("resolveAbConfigProviderOptions — REGRESSION (item 9): C remains the BPE + uppercase tuned configuration", () => {
  it("A has no hotwords at all", () => {
    expect(resolveAbConfigProviderOptions("A", hotwordList, bpeVocabUrl)).toEqual({ hotwords: undefined });
  });

  it("B is hotwords ON with NO modelingUnit/casing override — the confirmed-wrong baseline, kept exactly as shipped so the comparison measures the real regression", () => {
    const options = resolveAbConfigProviderOptions("B", hotwordList, bpeVocabUrl);
    expect(options.hotwords).toBe(hotwordList);
    expect(options.modelingUnit).toBeUndefined();
    expect(options.hotwordCasing).toBeUndefined();
  });

  it("C is hotwords ON with modelingUnit bpe, the real bpeVocabUrl, and UPPERCASE hotword casing", () => {
    expect(resolveAbConfigProviderOptions("C", hotwordList, bpeVocabUrl)).toEqual({
      hotwords: hotwordList,
      modelingUnit: "bpe",
      bpeVocabUrl,
      hotwordCasing: "upper",
    });
  });
});

function record(overrides: Partial<AbTestRecordLike>): AbTestRecordLike {
  return {
    provider: "sherpa-onnx",
    abConfig: "C",
    classification: { accepted: true, wouldProduceCardEvent: true },
    correctness: "unmarked",
    ...overrides,
  };
}

describe("computeAggregatesByConfig — REGRESSION (item 8): A/B/C records never bleed into the wrong group", () => {
  it("groups strictly by (provider, abConfig) — a B record can never inflate C's total or vice versa", () => {
    const records: AbTestRecordLike[] = [
      record({ abConfig: "A" }),
      record({ abConfig: "B" }),
      record({ abConfig: "B" }),
      record({ abConfig: "C" }),
      record({ abConfig: "C" }),
      record({ abConfig: "C" }),
    ];
    const aggregates = computeAggregatesByConfig(records);
    const byKey = Object.fromEntries(aggregates.map((a) => [a.key, a.total]));
    expect(byKey["sherpa-A"]).toBe(1);
    expect(byKey["sherpa-B"]).toBe(2);
    expect(byKey["sherpa-C"]).toBe(3);
  });

  it("a Chrome baseline record groups separately from every Sherpa config, regardless of abConfig field state", () => {
    const records: AbTestRecordLike[] = [
      record({ provider: "browser-web-speech", abConfig: null }),
      record({ provider: "sherpa-onnx", abConfig: "C" }),
    ];
    const aggregates = computeAggregatesByConfig(records);
    const keys = aggregates.map((a) => a.key).sort();
    expect(keys).toEqual(["chrome", "sherpa-C"]);
  });

  it("a Whisper record groups into its own 'whisper' key, separate from both Chrome and every Sherpa config — three-way comparison never bleeds", () => {
    const records: AbTestRecordLike[] = [
      record({ provider: "browser-web-speech", abConfig: null }),
      record({ provider: "sherpa-onnx", abConfig: "C" }),
      record({ provider: "whisper-cpp", abConfig: null }),
      record({ provider: "whisper-cpp", abConfig: null }),
    ];
    const aggregates = computeAggregatesByConfig(records);
    const byKey = Object.fromEntries(aggregates.map((a) => [a.key, a.total]));
    expect(byKey.chrome).toBe(1);
    expect(byKey["sherpa-C"]).toBe(1);
    expect(byKey.whisper).toBe(2);
  });

  it("REGRESSION (unequal totals, 2026-08-20 real session): totals are reported exactly as captured, never padded/normalized to a common N", () => {
    // Mirrors the real session's own reported shape: A=26, B=27, C=25 —
    // never fabricated as if they were a controlled equal-N comparison.
    const records: AbTestRecordLike[] = [
      ...Array.from({ length: 26 }, () => record({ abConfig: "A" })),
      ...Array.from({ length: 27 }, () => record({ abConfig: "B" })),
      ...Array.from({ length: 25 }, () => record({ abConfig: "C" })),
    ];
    const aggregates = computeAggregatesByConfig(records);
    const byKey = Object.fromEntries(aggregates.map((a) => [a.key, a.total]));
    expect(byKey["sherpa-A"]).toBe(26);
    expect(byKey["sherpa-B"]).toBe(27);
    expect(byKey["sherpa-C"]).toBe(25);
  });

  it("computes acceptedRate/cardEventRate independently per group from only that group's own records", () => {
    const records: AbTestRecordLike[] = [
      record({ abConfig: "A", classification: { accepted: false, wouldProduceCardEvent: false } }),
      record({ abConfig: "A", classification: { accepted: false, wouldProduceCardEvent: false } }),
      record({ abConfig: "C", classification: { accepted: true, wouldProduceCardEvent: true } }),
    ];
    const aggregates = computeAggregatesByConfig(records);
    const a = aggregates.find((x) => x.key === "sherpa-A")!;
    const c = aggregates.find((x) => x.key === "sherpa-C")!;
    expect(a.acceptedRate).toBe(0);
    expect(c.acceptedRate).toBe(1);
  });

  it("an empty record list produces an empty aggregate list", () => {
    expect(computeAggregatesByConfig([])).toEqual([]);
  });
});

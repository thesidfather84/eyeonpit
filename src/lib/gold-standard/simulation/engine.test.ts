import { describe, expect, it } from "vitest";
import { buildGameDefinition, GAME_DEFINITION_PRESETS } from "../gameDefinition";
import { BUILT_IN_COUNT_METHODS } from "../countMethodAdapters";
import { buildSimulationScenario, type BettingStrategy, type PlayingStrategy } from "./scenario";
import { runSimulation } from "./engine";
import { isResultTrustworthy } from "./result";

const now = new Date().toISOString();

const flatBet: BettingStrategy = {
  id: "bs-flat",
  version: 1,
  createdAt: now,
  updatedAt: now,
  name: "Flat 1 unit",
  steps: [{ trueCountThreshold: -Infinity, betUnits: 1 }],
};

const spreadBet: BettingStrategy = {
  id: "bs-spread",
  version: 1,
  createdAt: now,
  updatedAt: now,
  name: "1-8 spread",
  steps: [
    { trueCountThreshold: -Infinity, betUnits: 1 },
    { trueCountThreshold: 2, betUnits: 4 },
    { trueCountThreshold: 4, betUnits: 8 },
  ],
};

const basicPlay: PlayingStrategy = {
  id: "ps-basic",
  version: 1,
  createdAt: now,
  updatedAt: now,
  name: "Basic strategy",
  baseStrategy: "basic",
  deviations: [],
};

function buildInputs(overrides: { hands?: number; seed?: number; bettingStrategy?: BettingStrategy; deckCount?: number } = {}) {
  const gameDefinition = buildGameDefinition({ ...GAME_DEFINITION_PRESETS["vegas-strip-6d-s17"], deckCount: overrides.deckCount ?? 6 });
  const countMethod = BUILT_IN_COUNT_METHODS["hi-lo"];
  const scenario = buildSimulationScenario({
    name: "Test scenario",
    gameDefinitionRef: { id: gameDefinition.id, version: gameDefinition.version },
    countMethodRef: { id: countMethod.id, version: countMethod.version },
    bettingStrategyRef: { id: (overrides.bettingStrategy ?? flatBet).id, version: 1 },
    playingStrategyRef: { id: basicPlay.id, version: 1 },
    startingBankrollUnits: 1000,
    handsToSimulate: overrides.hands ?? 2000,
    seed: overrides.seed ?? 42,
  });
  return { scenario, gameDefinition, countMethod, bettingStrategy: overrides.bettingStrategy ?? flatBet, playingStrategy: basicPlay };
}

describe("runSimulation — determinism (Priority B6)", () => {
  it("the same seed + scenario + inputs produce byte-identical results", () => {
    const inputs = buildInputs({ seed: 123, hands: 500 });
    const a = runSimulation(inputs);
    const b = runSimulation(inputs);
    expect(a.handsSimulated).toBe(b.handsSimulated);
    expect(a.expectedValuePerHand).toBe(b.expectedValuePerHand);
    expect(a.variance).toBe(b.variance);
    expect(a.totalExpectedValue).toBe(b.totalExpectedValue);
  });

  it("different seeds produce different results", () => {
    const a = runSimulation(buildInputs({ seed: 1, hands: 500 }));
    const b = runSimulation(buildInputs({ seed: 2, hands: 500 }));
    expect(a.expectedValuePerHand).not.toBe(b.expectedValuePerHand);
  });
});

describe("runSimulation — Priority B7 validation checklist", () => {
  it("passes every validation check and is reported trustworthy", () => {
    const result = runSimulation(buildInputs({ hands: 1000 }));
    expect(isResultTrustworthy(result)).toBe(true);
    for (const check of result.validationChecks) {
      expect(check.passed).toBe(true);
    }
  });

  it("never simulates more hands than requested", () => {
    const result = runSimulation(buildInputs({ hands: 300 }));
    expect(result.handsSimulated).toBeLessThanOrEqual(300);
  });

  it("variance is never negative", () => {
    const result = runSimulation(buildInputs({ hands: 1000 }));
    expect(result.variance).toBeGreaterThanOrEqual(0);
  });

  it("standard deviation/error are consistent with variance", () => {
    const result = runSimulation(buildInputs({ hands: 1000 }));
    expect(result.risk.standardDeviation).toBeCloseTo(Math.sqrt(result.variance), 10);
  });

  it("EV per hand for a full basic-strategy flat-bet game is close to the well-known house-edge range (a sanity bound, not an exact literature match)", () => {
    // Standard 6-deck S17 DAS basic strategy house edge is roughly 0.3%-0.6%.
    // Over thousands of simulated hands this must land in a broad,
    // generous band around that — this is a sanity check on engine
    // correctness, not a precision claim (see engine.ts's own scope
    // limitations on the strategy chart used).
    const result = runSimulation(buildInputs({ hands: 20000, seed: 7 }));
    expect(result.expectedValuePerHand).toBeGreaterThan(-0.05);
    expect(result.expectedValuePerHand).toBeLessThan(0.05);
  });

  it("throws for an unbalanced count method rather than producing a misleading result", () => {
    const inputs = buildInputs();
    expect(() => runSimulation({ ...inputs, countMethod: BUILT_IN_COUNT_METHODS.ko })).toThrow(/unbalanced/);
  });

  it("a higher-spread betting strategy changes the runtime bet distribution — different EV/variance from a flat bet with the same seed", () => {
    const flatResult = runSimulation(buildInputs({ hands: 5000, seed: 55, bettingStrategy: flatBet }));
    const spreadResult = runSimulation(buildInputs({ hands: 5000, seed: 55, bettingStrategy: spreadBet }));
    // Same cards dealt (same seed/shoe), but the spread strategy bets more
    // during favorable counts — total EV must differ from the flat strategy.
    expect(spreadResult.totalExpectedValue).not.toBe(flatResult.totalExpectedValue);
  });

  it("single-deck games still simulate without error (uses the same standard chart — see documented scope limitation)", () => {
    const result = runSimulation(buildInputs({ deckCount: 1, hands: 500 }));
    expect(result.handsSimulated).toBeGreaterThan(0);
  });

  it("records a note when playing deviations were requested but not applied", () => {
    const inputs = buildInputs({ hands: 100 });
    const withDeviations = { ...inputs, playingStrategy: { ...basicPlay, deviations: [{ description: "16v10 stand", trueCountThreshold: 0 }] } };
    const result = runSimulation(withDeviations);
    expect(result.notes).toMatch(/NOT YET applied/);
  });

  it("runtimeMs is recorded and non-negative", () => {
    const result = runSimulation(buildInputs({ hands: 200 }));
    expect(result.runtimeMs).toBeGreaterThanOrEqual(0);
  });
});

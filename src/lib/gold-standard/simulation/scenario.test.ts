import { describe, expect, it } from "vitest";
import { buildSimulationScenario, betUnitsForTrueCount, validateSimulationScenario, type BettingStrategy } from "./scenario";

const baseInput = {
  name: "Test Scenario",
  gameDefinitionRef: { id: "gd-1", version: 1 },
  countMethodRef: { id: "cm-1", version: 1 },
  bettingStrategyRef: { id: "bs-1", version: 1 },
  playingStrategyRef: { id: "ps-1", version: 1 },
  startingBankrollUnits: 1000,
  handsToSimulate: 100000,
  seed: 42,
};

describe("validateSimulationScenario", () => {
  it("accepts a valid scenario", () => {
    expect(validateSimulationScenario(baseInput)).toEqual({ valid: true });
  });

  it("rejects a non-integer seed", () => {
    expect(validateSimulationScenario({ ...baseInput, seed: 1.5 }).valid).toBe(false);
  });

  it("rejects zero/negative hands", () => {
    expect(validateSimulationScenario({ ...baseInput, handsToSimulate: 0 }).valid).toBe(false);
  });

  it("rejects an out-of-range penetration override", () => {
    expect(validateSimulationScenario({ ...baseInput, penetrationOverridePercent: 0 }).valid).toBe(false);
    expect(validateSimulationScenario({ ...baseInput, penetrationOverridePercent: 101 }).valid).toBe(false);
  });
});

describe("buildSimulationScenario", () => {
  it("builds a versioned, seeded scenario", () => {
    const scenario = buildSimulationScenario(baseInput);
    expect(scenario.seed).toBe(42);
    expect(scenario.version).toBe(1);
    expect(scenario.id).toBeTruthy();
  });

  it("two scenarios built from identical input still get distinct ids — never coalesced into 'the same' record", () => {
    const a = buildSimulationScenario(baseInput);
    const b = buildSimulationScenario(baseInput);
    expect(a.id).not.toBe(b.id);
  });
});

describe("betUnitsForTrueCount", () => {
  const strategy: BettingStrategy = {
    id: "bs-1",
    version: 1,
    createdAt: "",
    updatedAt: "",
    name: "Spread 1-8",
    steps: [
      { trueCountThreshold: -Infinity, betUnits: 1 },
      { trueCountThreshold: 1, betUnits: 2 },
      { trueCountThreshold: 3, betUnits: 4 },
      { trueCountThreshold: 5, betUnits: 8 },
    ],
  };

  it("picks the base bet below the first real threshold", () => {
    expect(betUnitsForTrueCount(strategy, -2)).toBe(1);
  });

  it("picks the matching step at an exact threshold", () => {
    expect(betUnitsForTrueCount(strategy, 3)).toBe(4);
  });

  it("picks the highest applicable step for a true count between two thresholds", () => {
    expect(betUnitsForTrueCount(strategy, 4)).toBe(4);
  });

  it("picks the top step for a true count above every threshold", () => {
    expect(betUnitsForTrueCount(strategy, 99)).toBe(8);
  });
});

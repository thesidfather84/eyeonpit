// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { resetAllData } from "@/lib/db/repositories/investigations";
import {
  listCountMethods,
  getCountMethod,
  createCountMethod,
  createGameDefinition,
  listGameDefinitions,
  createSimulationScenario,
  saveSimulationResult,
  listSimulationResultsForScenario,
  createResearchEntry,
  listResearchEntries,
} from "./goldStandard";
import { GAME_DEFINITION_PRESETS } from "@/lib/gold-standard/gameDefinition";

// resetAllData() (investigations.ts) now clears every 1.6 table alongside
// `investigations` — see resetAllData.test.ts for the dedicated regression
// coverage proving that.

describe("Count method repository", () => {
  it("listCountMethods includes all 4 built-in adapters even with no custom methods stored", async () => {
    await resetAllData();
    const methods = await listCountMethods();
    const ids = methods.map((m) => m.canonicalId);
    expect(ids).toEqual(expect.arrayContaining(["hi-lo", "ko", "zen", "omega-ii"]));
  });

  it("getCountMethod resolves a built-in without touching Dexie", async () => {
    const method = await getCountMethod("hi-lo");
    expect(method?.displayName).toBe("Hi-Lo");
    expect(method?.isBuiltInAdapter).toBe(true);
  });

  it("createCountMethod persists a custom method and it appears in listCountMethods", async () => {
    await resetAllData();
    await createCountMethod({
      canonicalId: "my-system",
      displayName: "My System",
      verificationStatus: "EXPERIMENTAL",
      balanced: true,
      tags: { A: -1, "2": 1, "3": 1, "4": 1, "5": 1, "6": 1, "7": 0, "8": 0, "9": 0, "10": -1 },
      trueCountMethod: "level-division",
      aceHandling: "primary-tag",
      sideCounts: [],
      sourceReferences: ["my own research"],
    });
    const methods = await listCountMethods();
    expect(methods.some((m) => m.canonicalId === "my-system")).toBe(true);
  });

  it("createCountMethod rejects a canonicalId that collides with a built-in adapter", async () => {
    await resetAllData();
    await expect(
      createCountMethod({
        canonicalId: "hi-lo",
        displayName: "Fake Hi-Lo",
        verificationStatus: "EXPERIMENTAL",
        balanced: true,
        tags: { A: -1 },
        trueCountMethod: "level-division",
        aceHandling: "primary-tag",
        sideCounts: [],
        sourceReferences: ["x"],
      })
    ).rejects.toThrow(/reserved/);
  });
});

describe("Game definition repository", () => {
  it("creates and lists game definitions", async () => {
    await resetAllData();
    await createGameDefinition(GAME_DEFINITION_PRESETS["vegas-strip-6d-s17"]);
    const all = await listGameDefinitions();
    expect(all).toHaveLength(1);
    expect(all[0].deckCount).toBe(6);
  });
});

describe("Simulation scenario/result repository", () => {
  it("saves a result and lists it scoped to its scenario", async () => {
    await resetAllData();
    const scenario = await createSimulationScenario({
      name: "Test",
      gameDefinitionRef: { id: "gd-1", version: 1 },
      countMethodRef: { id: "cm-1", version: 1 },
      bettingStrategyRef: { id: "bs-1", version: 1 },
      playingStrategyRef: { id: "ps-1", version: 1 },
      startingBankrollUnits: 1000,
      handsToSimulate: 100,
      seed: 1,
    });

    const now = new Date().toISOString();
    await saveSimulationResult({
      id: "result-1",
      version: 1,
      createdAt: now,
      updatedAt: now,
      scenarioId: scenario.id,
      scenarioVersion: 1,
      seed: 1,
      simulatorVersion: "0.1.0",
      gameDefinitionRef: { id: "gd-1", version: 1 },
      countMethodRef: { id: "cm-1", version: 1 },
      bettingStrategyRef: { id: "bs-1", version: 1 },
      playingStrategyRef: { id: "ps-1", version: 1 },
      handsSimulated: 100,
      expectedValuePerHand: 0.01,
      totalExpectedValue: 1,
      variance: 1.2,
      risk: { standardDeviation: 1.1, standardError: 0.1, confidenceInterval95: [-0.1, 0.2] },
      penetrationPercentUsed: 75,
      runtimeMs: 5,
      validationChecks: [{ name: "check", passed: true }],
    });

    const results = await listSimulationResultsForScenario(scenario.id);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("result-1");
  });
});

describe("Research library repository", () => {
  it("creates and lists entries", async () => {
    await resetAllData();
    await createResearchEntry({
      sourceType: "forum",
      source: "https://example.com",
      dateFound: "2026-08-19",
      claim: "Test claim",
      implementationStatus: "not-started",
      verificationStatus: "RESEARCH_ONLY",
      simulationStatus: "not-simulated",
    });
    const entries = await listResearchEntries();
    expect(entries).toHaveLength(1);
  });
});

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { createInvestigation, resetAllData } from "@/lib/db/repositories/investigations";
import { createProperty, saveReport } from "@/lib/db/repositories/reporting";
import { buildReportFromInvestigation } from "@/lib/reporting/reportBuilder";
import {
  createCountMethod,
  createGameDefinition,
  createSimulationScenario,
  saveSimulationResult,
  createResearchEntry,
} from "@/lib/db/repositories/goldStandard";
import { GAME_DEFINITION_PRESETS } from "@/lib/gold-standard/gameDefinition";

/**
 * FINAL PRE-COMMIT CLEANUP — regression coverage proving Settings' "Reset
 * all local data" (resetAllData() in investigations.ts) actually clears
 * every EyeOnPit 1.5/1.6 local Dexie table, not just `investigations`.
 * Each describe block seeds one real record into one table via the real
 * repository/builder functions (never a raw Dexie write), calls the real
 * resetAllData(), and asserts that table — and only that table's own
 * concern — is empty afterward. `cardEvents` is deliberately NOT asserted
 * cleared here: resetAllData() does not touch it (pre-existing behavior,
 * unrelated to the 1.5/1.6 architecture, explicitly out of scope for this
 * fix — see resetAllData()'s own doc comment).
 */

async function seedInvestigation() {
  return createInvestigation({
    casino: "Test Casino",
    tableNumber: "BJ-1",
    dealerName: "",
    investigationDate: "2026-08-19",
    operatorName: "J. Smith",
    countingSystem: "Hi-Lo",
    shoeTotalDecks: 6,
    status: "active",
  });
}

describe("resetAllData — clears existing EyeOnPit local data", () => {
  it("clears the investigations table", async () => {
    await seedInvestigation();
    expect(await getDb().investigations.count()).toBeGreaterThan(0);

    await resetAllData();

    expect(await getDb().investigations.count()).toBe(0);
  });
});

describe("resetAllData — clears property/reporting data (1.5)", () => {
  it("clears the properties table", async () => {
    await createProperty({ code: "PROP1", name: "Property One" });
    expect(await getDb().properties.count()).toBeGreaterThan(0);

    await resetAllData();

    expect(await getDb().properties.count()).toBe(0);
  });

  it("clears the reports table", async () => {
    const inv = await seedInvestigation();
    const report = buildReportFromInvestigation({ investigation: inv, cardEvents: [] });
    await saveReport(report);
    expect(await getDb().reports.count()).toBeGreaterThan(0);

    await resetAllData();

    expect(await getDb().reports.count()).toBe(0);
  });
});

describe("resetAllData — clears Gold Standard / Lab data (1.6)", () => {
  it("clears the countMethods table (custom methods only — built-in adapters are code constants, not rows)", async () => {
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
    expect(await getDb().countMethods.count()).toBeGreaterThan(0);

    await resetAllData();

    expect(await getDb().countMethods.count()).toBe(0);
  });

  it("clears the gameDefinitions table", async () => {
    await createGameDefinition(GAME_DEFINITION_PRESETS["vegas-strip-6d-s17"]);
    expect(await getDb().gameDefinitions.count()).toBeGreaterThan(0);

    await resetAllData();

    expect(await getDb().gameDefinitions.count()).toBe(0);
  });
});

describe("resetAllData — clears simulation scenarios/results (1.6)", () => {
  it("clears the simulationScenarios table", async () => {
    await createSimulationScenario({
      name: "Test",
      gameDefinitionRef: { id: "gd-1", version: 1 },
      countMethodRef: { id: "cm-1", version: 1 },
      bettingStrategyRef: { id: "bs-1", version: 1 },
      playingStrategyRef: { id: "ps-1", version: 1 },
      startingBankrollUnits: 1000,
      handsToSimulate: 100,
      seed: 1,
    });
    expect(await getDb().simulationScenarios.count()).toBeGreaterThan(0);

    await resetAllData();

    expect(await getDb().simulationScenarios.count()).toBe(0);
  });

  it("clears the simulationResults table", async () => {
    const now = new Date().toISOString();
    await saveSimulationResult({
      id: "result-1",
      version: 1,
      createdAt: now,
      updatedAt: now,
      scenarioId: "scenario-1",
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
    expect(await getDb().simulationResults.count()).toBeGreaterThan(0);

    await resetAllData();

    expect(await getDb().simulationResults.count()).toBe(0);
  });
});

describe("resetAllData — clears research-library data (1.6)", () => {
  it("clears the researchEntries table", async () => {
    await createResearchEntry({
      sourceType: "forum",
      source: "https://example.com",
      dateFound: "2026-08-19",
      claim: "Test claim",
      implementationStatus: "not-started",
      verificationStatus: "RESEARCH_ONLY",
      simulationStatus: "not-simulated",
    });
    expect(await getDb().researchEntries.count()).toBeGreaterThan(0);

    await resetAllData();

    expect(await getDb().researchEntries.count()).toBe(0);
  });
});

describe("resetAllData — clears every table in a single combined call, all at once", () => {
  it("seeds one record in every 1.5/1.6 table plus investigations, then confirms all are empty after one resetAllData() call", async () => {
    const inv = await seedInvestigation();
    await createProperty({ code: "PROP1", name: "Property One" });
    await saveReport(buildReportFromInvestigation({ investigation: inv, cardEvents: [] }));
    await createCountMethod({
      canonicalId: "combined-system",
      displayName: "Combined System",
      verificationStatus: "EXPERIMENTAL",
      balanced: true,
      tags: { A: -1 },
      trueCountMethod: "level-division",
      aceHandling: "primary-tag",
      sideCounts: [],
      sourceReferences: ["x"],
    });
    await createGameDefinition(GAME_DEFINITION_PRESETS["single-deck-h17"]);
    const scenario = await createSimulationScenario({
      name: "Combined Test",
      gameDefinitionRef: { id: "gd-1", version: 1 },
      countMethodRef: { id: "cm-1", version: 1 },
      bettingStrategyRef: { id: "bs-1", version: 1 },
      playingStrategyRef: { id: "ps-1", version: 1 },
      startingBankrollUnits: 1000,
      handsToSimulate: 100,
      seed: 2,
    });
    const now = new Date().toISOString();
    await saveSimulationResult({
      id: "combined-result-1",
      version: 1,
      createdAt: now,
      updatedAt: now,
      scenarioId: scenario.id,
      scenarioVersion: 1,
      seed: 2,
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
    await createResearchEntry({
      sourceType: "forum",
      source: "https://example.com",
      dateFound: "2026-08-19",
      claim: "Combined test claim",
      implementationStatus: "not-started",
      verificationStatus: "RESEARCH_ONLY",
      simulationStatus: "not-simulated",
    });

    // Every table genuinely has data before reset — proves this test isn't
    // vacuously true.
    expect(await getDb().investigations.count()).toBeGreaterThan(0);
    expect(await getDb().properties.count()).toBeGreaterThan(0);
    expect(await getDb().reports.count()).toBeGreaterThan(0);
    expect(await getDb().countMethods.count()).toBeGreaterThan(0);
    expect(await getDb().gameDefinitions.count()).toBeGreaterThan(0);
    expect(await getDb().simulationScenarios.count()).toBeGreaterThan(0);
    expect(await getDb().simulationResults.count()).toBeGreaterThan(0);
    expect(await getDb().researchEntries.count()).toBeGreaterThan(0);

    await resetAllData();

    expect(await getDb().investigations.count()).toBe(0);
    expect(await getDb().properties.count()).toBe(0);
    expect(await getDb().reports.count()).toBe(0);
    expect(await getDb().countMethods.count()).toBe(0);
    expect(await getDb().gameDefinitions.count()).toBe(0);
    expect(await getDb().simulationScenarios.count()).toBe(0);
    expect(await getDb().simulationResults.count()).toBe(0);
    expect(await getDb().researchEntries.count()).toBe(0);
  });
});

describe("resetAllData — every table on EyeOnPitDB is accounted for by this suite or explicitly excluded", () => {
  it("fails loudly if a future schema migration adds a table this suite doesn't know about", () => {
    const db = getDb();
    const knownTableNames = new Set([
      "investigations",
      "cardEvents", // deliberately excluded from resetAllData() — see its own doc comment
      "properties",
      "reports",
      "countMethods",
      "gameDefinitions",
      "simulationScenarios",
      "simulationResults",
      "researchEntries",
    ]);
    const actualTableNames = db.tables.map((t) => t.name);
    const unaccountedFor = actualTableNames.filter((name) => !knownTableNames.has(name));
    expect(unaccountedFor).toEqual([]);
  });
});

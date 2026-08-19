import { getDb } from "@/lib/db/client";
import { BUILT_IN_COUNT_METHODS } from "@/lib/gold-standard/countMethodAdapters";
import type { CountMethodDefinition, CreateCountMethodInput } from "@/lib/gold-standard/countMethodRegistry";
import { buildCountMethodDefinition } from "@/lib/gold-standard/countMethodRegistry";
import type { GameDefinition, CreateGameDefinitionInput } from "@/lib/gold-standard/gameDefinition";
import { buildGameDefinition } from "@/lib/gold-standard/gameDefinition";
import type { SimulationScenario, CreateSimulationScenarioInput } from "@/lib/gold-standard/simulation/scenario";
import { buildSimulationScenario } from "@/lib/gold-standard/simulation/scenario";
import type { SimulationResult } from "@/lib/gold-standard/simulation/result";
import type { ResearchLibraryEntry, CreateResearchLibraryEntryInput } from "@/lib/gold-standard/researchLibrary";
import { buildResearchLibraryEntry } from "@/lib/gold-standard/researchLibrary";

/**
 * EyeOnPit 1.6 — Dexie persistence for the Gold Standard / Simulation Lab
 * entities. See lib/db/schema.ts's v3 migration for table definitions.
 * `listCountMethods` is the ONE place built-in adapters (code constants,
 * never DB rows — see countMethodAdapters.ts's own doc comment) are merged
 * with user-added custom methods, so every /lab caller sees one unified
 * list without needing to know which source a given method came from.
 */

// ---- Count Methods ----

export async function listCountMethods(): Promise<CountMethodDefinition[]> {
  const custom = await getDb().countMethods.toArray();
  return [...Object.values(BUILT_IN_COUNT_METHODS), ...custom];
}

export async function getCountMethod(canonicalId: string): Promise<CountMethodDefinition | undefined> {
  if (BUILT_IN_COUNT_METHODS[canonicalId]) return BUILT_IN_COUNT_METHODS[canonicalId];
  return getDb().countMethods.where("canonicalId").equals(canonicalId).first();
}

/** Throws if `canonicalId` collides with a built-in adapter's — a custom method must never shadow/override Hi-Lo/KO/Zen/Omega II. */
export async function createCountMethod(input: CreateCountMethodInput): Promise<CountMethodDefinition> {
  if (BUILT_IN_COUNT_METHODS[input.canonicalId]) {
    throw new Error(`createCountMethod: '${input.canonicalId}' is a reserved built-in adapter id.`);
  }
  const record = buildCountMethodDefinition(input);
  await getDb().countMethods.add(record);
  return record;
}

export async function deleteCountMethod(id: string): Promise<void> {
  await getDb().countMethods.delete(id);
}

// ---- Game Definitions ----

export async function listGameDefinitions(): Promise<GameDefinition[]> {
  return getDb().gameDefinitions.toArray();
}

export async function createGameDefinition(input: CreateGameDefinitionInput): Promise<GameDefinition> {
  const record = buildGameDefinition(input);
  await getDb().gameDefinitions.add(record);
  return record;
}

export async function getGameDefinition(id: string): Promise<GameDefinition | undefined> {
  return getDb().gameDefinitions.get(id);
}

export async function deleteGameDefinition(id: string): Promise<void> {
  await getDb().gameDefinitions.delete(id);
}

// ---- Simulation Scenarios / Results ----

export async function listSimulationScenarios(): Promise<SimulationScenario[]> {
  return getDb().simulationScenarios.toArray();
}

export async function createSimulationScenario(input: CreateSimulationScenarioInput): Promise<SimulationScenario> {
  const record = buildSimulationScenario(input);
  await getDb().simulationScenarios.add(record);
  return record;
}

export async function getSimulationScenario(id: string): Promise<SimulationScenario | undefined> {
  return getDb().simulationScenarios.get(id);
}

export async function deleteSimulationScenario(id: string): Promise<void> {
  await getDb().simulationScenarios.delete(id);
}

/** Write-once — a SimulationResult is never edited after creation (see simulation/result.ts's own doc comment), so this repository deliberately offers no `updateSimulationResult`. */
export async function saveSimulationResult(result: SimulationResult): Promise<SimulationResult> {
  await getDb().simulationResults.add(result);
  return result;
}

export async function listSimulationResultsForScenario(scenarioId: string): Promise<SimulationResult[]> {
  return getDb().simulationResults.where("scenarioId").equals(scenarioId).toArray();
}

export async function listAllSimulationResults(): Promise<SimulationResult[]> {
  return getDb().simulationResults.toArray();
}

export async function deleteSimulationResult(id: string): Promise<void> {
  await getDb().simulationResults.delete(id);
}

// ---- Research Library ----

export async function listResearchEntries(): Promise<ResearchLibraryEntry[]> {
  return getDb().researchEntries.toArray();
}

export async function createResearchEntry(input: CreateResearchLibraryEntryInput): Promise<ResearchLibraryEntry> {
  const record = buildResearchLibraryEntry(input);
  await getDb().researchEntries.add(record);
  return record;
}

export async function updateResearchEntry(id: string, patch: Partial<Omit<ResearchLibraryEntry, "id" | "createdAt">>): Promise<void> {
  await getDb().researchEntries.update(id, { ...patch, updatedAt: new Date().toISOString() });
}

export async function deleteResearchEntry(id: string): Promise<void> {
  await getDb().researchEntries.delete(id);
}

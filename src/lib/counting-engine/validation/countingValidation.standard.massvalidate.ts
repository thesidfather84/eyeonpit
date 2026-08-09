// @vitest-environment jsdom
//
// STANDARD scale — thousands of hands, suitable for pre-commit/pre-release
// validation. Run via `npm run validate:counting` (see
// vitest.validate.config.ts — this file's `.massvalidate.ts` extension
// deliberately keeps it out of the main `npm test` run). See
// docs/VALIDATION.md for the full explanation of what this proves and what
// it does not.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetAllData } from "@/lib/db/repositories/investigations";
import { formatHarnessReport } from "./report";
import { runHarness } from "./simulator";
import type { HarnessConfig } from "./types";

const STANDARD_CONFIG: HarnessConfig = {
  seed: 20260809,
  sessionCount: 220,
  shoesPerSession: [1, 2],
  roundsPerShoe: [4, 8],
  cardsPerHand: [1, 3],
  seatCount: [0, 4],
  deckCounts: [1, 2, 6, 8],
  workflowOpProbability: 0.12,
  checkEveryNEvents: 8,
};

beforeAll(async () => {
  await resetAllData();
});

afterAll(async () => {
  await resetAllData();
});

describe("counting validation harness — STANDARD", () => {
  it(
    "passes thousands of simulated hands with zero detected mismatches against the independent reference model",
    async () => {
      const result = await runHarness(STANDARD_CONFIG);
      console.log(formatHarnessReport(result));
      expect(result.mismatches).toEqual([]);
      expect(result.roundsSimulated).toBeGreaterThanOrEqual(1500);
    },
    600_000
  );
});

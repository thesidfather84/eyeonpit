// @vitest-environment jsdom
//
// STRESS scale — tens/hundreds of thousands of CardEvents or more. Manually
// invoked only (`npm run validate:counting:stress`), never part of an
// ordinary test run or even the STANDARD pre-release check. Expect this to
// take several minutes; that is an accepted tradeoff for a scale this size,
// not a bug (see docs/VALIDATION.md).
//
// Scale is controlled entirely by HarnessConfig below — per requirement,
// this architecture reaches 1,000,000+ CardEvents purely by raising
// `sessionCount` (spreading load across more, independent investigations
// rather than growing any single one very large — see simulator.ts's own
// notes on why that matters for performance), with no code changes.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetAllData } from "@/lib/db/repositories/investigations";
import { formatHarnessReport } from "./report";
import { runHarness } from "./simulator";
import type { HarnessConfig } from "./types";

const STRESS_CONFIG: HarnessConfig = {
  seed: 918273645,
  sessionCount: 2500,
  shoesPerSession: [1, 2],
  roundsPerShoe: [4, 10],
  cardsPerHand: [1, 3],
  seatCount: [0, 4],
  deckCounts: [1, 2, 6, 8],
  workflowOpProbability: 0.1,
  checkEveryNEvents: 10,
};

beforeAll(async () => {
  await resetAllData();
});

afterAll(async () => {
  await resetAllData();
});

describe("counting validation harness — STRESS", () => {
  it(
    "passes tens of thousands of simulated hands (hundreds of thousands of CardEvents) with zero detected mismatches",
    async () => {
      const result = await runHarness(STRESS_CONFIG);
      console.log(formatHarnessReport(result));
      expect(result.mismatches).toEqual([]);
      expect(result.cardEventsProcessed).toBeGreaterThanOrEqual(50_000);
    },
    1_800_000
  );
});

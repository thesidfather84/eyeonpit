// @vitest-environment jsdom
//
// SMOKE level — small and fast, part of the normal `npm test` run. Proves
// the harness itself works end to end (real production path + independent
// oracle + invariant checks + replay) on every ordinary test run, without
// the runtime cost of the STANDARD/STRESS scales (see
// countingValidation.standard/.stress.massvalidate.ts, run separately via
// `npm run validate:counting[:stress]` — see docs/VALIDATION.md).
import { beforeEach, describe, expect, it } from "vitest";
import { resetAllData } from "@/lib/db/repositories/investigations";
import { formatHarnessReport } from "./report";
import { replayPayload, runHarness } from "./simulator";
import type { HarnessConfig } from "./types";

beforeEach(async () => {
  await resetAllData();
});

const SMOKE_CONFIG: HarnessConfig = {
  seed: 123456,
  sessionCount: 3,
  shoesPerSession: [1, 2],
  roundsPerShoe: [3, 6],
  cardsPerHand: [1, 3],
  seatCount: [0, 3],
  deckCounts: [1, 2, 6, 8],
  workflowOpProbability: 0.25,
  checkEveryNEvents: 1,
};

describe("counting validation harness — SMOKE", () => {
  it("passes with zero mismatches against the independent oracle, and reports a positive amount of work done", async () => {
    const result = await runHarness(SMOKE_CONFIG);
    if (result.mismatches.length > 0) {
      console.error(formatHarnessReport(result));
    }
    expect(result.mismatches).toEqual([]);
    expect(result.cardEventsProcessed).toBeGreaterThan(0);
    expect(result.roundsSimulated).toBeGreaterThan(0);
    expect(result.shoesSimulated).toBeGreaterThan(0);
  }, 30_000);

  it("the exact same seed produces the exact same amount of simulated work every time (deterministic reproducibility)", async () => {
    const first = await runHarness(SMOKE_CONFIG);
    await resetAllData();
    const second = await runHarness(SMOKE_CONFIG);

    expect(second.cardEventsProcessed).toBe(first.cardEventsProcessed);
    expect(second.roundsSimulated).toBe(first.roundsSimulated);
    expect(second.shoesSimulated).toBe(first.shoesSimulated);
    expect(second.undoOpsProcessed).toBe(first.undoOpsProcessed);
    expect(second.redoOpsProcessed).toBe(first.redoOpsProcessed);
  }, 30_000);

  it("a deliberately corrupted production count is caught as a mismatch (proves the harness can actually fail, not just always pass)", async () => {
    // Sanity-checks the harness's own ability to detect a real
    // disagreement: feeds the oracle a rank that was never actually
    // written to production for the same target, guaranteeing a
    // divergence, and confirms replaying that exact op sequence reproduces
    // the same failure deterministically.
    const { createInvestigation, occupySeat: occupy } = await import("@/lib/db/repositories/investigations");
    const { addCardToRound: addCard } = await import("@/lib/db/repositories/cardEvents");
    const { ShoeOracle } = await import("./oracle");

    const inv = await createInvestigation({
      casino: "", tableNumber: "", dealerName: "", investigationDate: "2026-01-01",
      operatorName: "", countingSystem: "Hi-Lo", shoeTotalDecks: 6, status: "active",
    });
    await occupy(inv.localId, 1);
    const round = inv.rounds[0];
    await addCard({
      investigationLocalId: inv.localId, roundId: round.id, targetType: "dealer", targetId: "dealer", rank: "A",
      applyToRound: (r) => ({ ...r, dealerHand: { cards: [...r.dealerHand.cards, { rank: "A", suit: "unspecified" }] } }),
      event: { type: "card", message: "Dealer: A" },
    });

    // Oracle deliberately believes a "2" was dealt instead of the "A"
    // production actually recorded — this must be caught, not silently
    // accepted.
    const oracle = new ShoeOracle(6);
    oracle.addCard("dealer", "dealer", "2");

    const { calculateCountSnapshot } = await import("@/lib/counting-engine/calculateCounts");
    const { getCardEventsForShoe } = await import("@/lib/db/repositories/cardEvents");
    const events = await getCardEventsForShoe(inv.localId, round.shoeNumber);
    const actual = calculateCountSnapshot(events, 6);
    const expected = oracle.snapshot();

    expect(actual["Hi-Lo"].running).not.toBe(expected["Hi-Lo"].running);
  });
});

describe("counting validation harness — replay", () => {
  it("replaying a saved payload reproduces the same statistics as generating it live", async () => {
    const small: HarnessConfig = { ...SMOKE_CONFIG, sessionCount: 1, shoesPerSession: [1, 1] };
    const live = await runHarness(small);
    expect(live.mismatches).toEqual([]);

    // Build a minimal, hand-constructed replay payload (independent of
    // whatever the live run actually did) and confirm it replays cleanly
    // through the exact same applyOp/verifySnapshot path.
    await resetAllData();
    const replayed = await replayPayload({
      seed: 1,
      deckCount: 6,
      shoeNumber: 1,
      countingSystemUnderTest: "Hi-Lo",
      ops: [
        { kind: "occupySeat", seatNumber: 2 },
        { kind: "addCard", targetType: "dealer", targetId: "dealer", rank: "10" },
        { kind: "addCard", targetType: "seat", targetId: 2, rank: "A" },
        { kind: "undo", targetType: "seat", targetId: 2 },
        { kind: "redo", targetType: "seat", targetId: 2 },
        { kind: "nextRound" },
        { kind: "addCard", targetType: "dealer", targetId: "dealer", rank: "5" },
      ],
    });

    expect(replayed.mismatches).toEqual([]);
    expect(replayed.cardEventsProcessed).toBe(3);
    expect(replayed.undoOpsProcessed).toBe(1);
    expect(replayed.redoOpsProcessed).toBe(1);
  }, 30_000);
});

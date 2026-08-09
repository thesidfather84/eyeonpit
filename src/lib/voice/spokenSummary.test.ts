// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { addCardToRound, getCardEventsForInvestigation } from "@/lib/db/repositories/cardEvents";
import { createInvestigation, occupySeat, resetAllData } from "@/lib/db/repositories/investigations";
import { buildCountAnnouncement, buildStatusAnnouncement } from "./spokenSummary";
import type { CardCode } from "@/types/investigation";

beforeEach(async () => {
  await resetAllData();
});

async function freshInvestigation() {
  return createInvestigation({
    casino: "",
    tableNumber: "",
    dealerName: "",
    investigationDate: "2026-08-09",
    operatorName: "",
    countingSystem: "Hi-Lo",
    shoeTotalDecks: 1, // single deck — clean, small numbers to assert on
    status: "active",
  });
}

function dealerAdd(investigationId: string, roundId: string, rank: CardCode["rank"]) {
  return addCardToRound({
    investigationLocalId: investigationId,
    roundId,
    targetType: "dealer",
    targetId: "dealer",
    rank,
    applyToRound: (round) => ({
      ...round,
      dealerHand: { cards: [...round.dealerHand.cards, { rank, suit: "unspecified" }] },
    }),
    event: { type: "card", message: `Dealer: ${rank}` },
  });
}

describe("buildCountAnnouncement — read-only, reuses the exact same CountSnapshot values CountSummaryPanel renders", () => {
  it("speaks the primary system's running count with no cards dealt (zero, not swallowed)", async () => {
    const inv = await freshInvestigation();
    const events = await getCardEventsForInvestigation(inv.localId);
    const text = buildCountAnnouncement(inv, events, inv.rounds[0].shoeNumber);
    expect(text).toContain("Hi-Lo 0.");
  });

  it("speaks a positive running count, true count, and every other system, never mutating any investigation data", async () => {
    const inv = await freshInvestigation();
    const round = inv.rounds[0];
    // Low cards (2-6) are all Hi-Lo +1 — three of them for a clean +3.
    await dealerAdd(inv.localId, round.id, "2");
    await dealerAdd(inv.localId, round.id, "3");
    await dealerAdd(inv.localId, round.id, "4");

    const eventsBefore = await getCardEventsForInvestigation(inv.localId);
    const text = buildCountAnnouncement(inv, eventsBefore, round.shoeNumber);

    expect(text).toContain("Hi-Lo +3.");
    expect(text).toContain("True count");
    expect(text).toContain("K O");
    expect(text).toContain("Zen");
    expect(text).toContain("Omega II");

    // Purely a read — the ledger this function was handed is untouched.
    const eventsAfter = await getCardEventsForInvestigation(inv.localId);
    expect(eventsAfter).toEqual(eventsBefore);
  });

  it("omits the true count sentence entirely for an unbalanced primary system (KO) rather than fabricating one", async () => {
    const inv = await createInvestigation({
      casino: "",
      tableNumber: "",
      dealerName: "",
      investigationDate: "2026-08-09",
      operatorName: "",
      countingSystem: "KO",
      shoeTotalDecks: 1,
      status: "active",
    });
    const events = await getCardEventsForInvestigation(inv.localId);
    const text = buildCountAnnouncement(inv, events, inv.rounds[0].shoeNumber);
    expect(text).not.toContain("True count");
  });
});

describe("buildStatusAnnouncement — concise target/round/count, read-only", () => {
  it("speaks the active target, round number, and primary running count", async () => {
    const inv = await freshInvestigation();
    const round = inv.rounds[0];
    await occupySeat(inv.localId, 3);
    await dealerAdd(inv.localId, round.id, "10");

    const events = await getCardEventsForInvestigation(inv.localId);
    const text = buildStatusAnnouncement(inv, events, round.shoeNumber, round.roundNumber, "SEAT 3");

    expect(text).toBe("SEAT 3 active. Round 1. Hi-Lo -1.");
  });
});

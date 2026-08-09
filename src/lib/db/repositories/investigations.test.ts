// @vitest-environment jsdom
//
// Regression coverage for the Practice-vs-production reset split: Practice
// (isDemo) data is disposable and may be destructively cleared, but a
// production/live investigation's CardEvent ledger is authoritative
// evidence and must never be silently deletable by a normal operator
// action. See docs/EYEONPIT_PRODUCT_SPEC.md, "Count Integrity" / "Dual
// Operational Roles".
import { beforeEach, describe, expect, it } from "vitest";
import { addCardToRound, getCardEventsForInvestigation } from "@/lib/db/repositories/cardEvents";
import {
  advanceRound,
  completeInvestigation,
  createInvestigation,
  getInvestigation,
  resetAllData,
  resetPracticeInvestigationLiveState,
} from "@/lib/db/repositories/investigations";
import type { CardCode } from "@/types/investigation";

beforeEach(async () => {
  await resetAllData();
});

async function freshInvestigation(overrides: { isDemo?: boolean } = {}) {
  return createInvestigation({
    casino: "",
    tableNumber: "",
    dealerName: "",
    investigationDate: "2026-08-09",
    operatorName: "",
    countingSystem: "Hi-Lo",
    shoeTotalDecks: 6,
    status: "active",
    ...overrides,
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

describe("resetPracticeInvestigationLiveState — Practice (disposable) semantics", () => {
  it("clears a Practice investigation's cards/rounds/seats AND its CardEvent ledger", async () => {
    const inv = await freshInvestigation({ isDemo: true });
    const round = inv.rounds[0];
    await dealerAdd(inv.localId, round.id, "K");
    await dealerAdd(inv.localId, round.id, "A");

    const eventsBefore = await getCardEventsForInvestigation(inv.localId);
    expect(eventsBefore).toHaveLength(2);

    await resetPracticeInvestigationLiveState(inv.localId);

    const after = await getInvestigation(inv.localId);
    expect(after?.rounds).toHaveLength(1);
    expect(after?.rounds[0]?.dealerHand.cards).toHaveLength(0);

    // Fresh Practice state carries zero stale CardEvents — not just zero
    // visible cards while the ledger quietly still has some.
    const eventsAfter = await getCardEventsForInvestigation(inv.localId);
    expect(eventsAfter).toHaveLength(0);
  });
});

describe("resetPracticeInvestigationLiveState — refuses a non-Practice (production) investigation", () => {
  it("throws and deletes nothing when called on an investigation that is not isDemo", async () => {
    const inv = await freshInvestigation({ isDemo: false });
    const round = inv.rounds[0];
    await dealerAdd(inv.localId, round.id, "K");
    await dealerAdd(inv.localId, round.id, "A");

    const eventsBefore = await getCardEventsForInvestigation(inv.localId);
    expect(eventsBefore).toHaveLength(2);

    await expect(resetPracticeInvestigationLiveState(inv.localId)).rejects.toThrow(/not a Practice/i);

    // A normal operator action must not be able to silently erase a
    // production investigation's authoritative evidence — the refusal must
    // be total, not "reset the rounds but still delete the ledger."
    const investigationAfter = await getInvestigation(inv.localId);
    expect(investigationAfter?.rounds).toHaveLength(1);
    expect(investigationAfter?.rounds[0]?.dealerHand.cards).toHaveLength(2);
    const eventsAfter = await getCardEventsForInvestigation(inv.localId);
    expect(eventsAfter).toHaveLength(2);
    expect(eventsAfter).toEqual(eventsBefore);
  });
});

describe("production evidence remains reproducible after the audit-safe reset workflows", () => {
  it('"Start New Shoe" (advanceRound with newShoe: true) never deletes a CardEvent — the prior shoe stays fully reconstructible', async () => {
    const inv = await freshInvestigation({ isDemo: false });
    const round = inv.rounds[0];
    await dealerAdd(inv.localId, round.id, "K"); // Hi-Lo -1
    await dealerAdd(inv.localId, round.id, "2"); // Hi-Lo +1

    const eventsBeforeShoeChange = await getCardEventsForInvestigation(inv.localId);
    expect(eventsBeforeShoeChange).toHaveLength(2);

    await advanceRound(inv.localId, { newShoe: true });

    const after = await getInvestigation(inv.localId);
    // A new shoe/round boundary exists...
    expect(after?.rounds).toHaveLength(2);
    expect(after?.rounds[1]?.shoeNumber).toBe(2);
    // ...but every CardEvent from shoe 1 is still there, untouched — the
    // evidence is reproducible, just no longer counted toward the new
    // shoe's running count.
    const eventsAfter = await getCardEventsForInvestigation(inv.localId);
    expect(eventsAfter).toHaveLength(2);
    expect(eventsAfter.map((e) => e.id).sort()).toEqual(eventsBeforeShoeChange.map((e) => e.id).sort());
    expect(eventsAfter.every((e) => e.shoeNumber === 1)).toBe(true);
  });

  it('"Start Fresh Investigation" (close + create new) leaves the closed investigation\'s CardEvents completely intact', async () => {
    const inv = await freshInvestigation({ isDemo: false });
    const round = inv.rounds[0];
    await dealerAdd(inv.localId, round.id, "K");
    await dealerAdd(inv.localId, round.id, "A");
    const eventsBefore = await getCardEventsForInvestigation(inv.localId);

    await completeInvestigation(inv.localId);
    const freshInv = await freshInvestigation({ isDemo: false }); // the "brand-new blank investigation"

    const closed = await getInvestigation(inv.localId);
    expect(closed?.status).toBe("closed");
    const eventsAfter = await getCardEventsForInvestigation(inv.localId);
    expect(eventsAfter).toEqual(eventsBefore);

    // The new investigation is a genuinely separate record — no shared or
    // migrated ledger state.
    const newInvEvents = await getCardEventsForInvestigation(freshInv.localId);
    expect(newInvEvents).toHaveLength(0);
  });
});

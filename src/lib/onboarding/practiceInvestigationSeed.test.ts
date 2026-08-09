// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { findOrCreatePracticeInvestigation } from "./practiceInvestigationSeed";
import {
  addCardToRound,
  getCardEventsForInvestigation,
} from "@/lib/db/repositories/cardEvents";
import { getInvestigation, resetAllData } from "@/lib/db/repositories/investigations";

beforeEach(async () => {
  // findOrCreatePracticeInvestigation scans *all* investigations for an
  // open demo one — tests must start from a clean slate or they'd find
  // demo records left over from a previous test in this file.
  await resetAllData();
});

describe("findOrCreatePracticeInvestigation — stale-data safety", () => {
  it("a brand-new practice investigation starts with no dealer/player cards and exactly the two fixed seeded seats", async () => {
    const investigation = await findOrCreatePracticeInvestigation();
    const round = investigation.rounds[investigation.rounds.length - 1];

    expect(investigation.rounds).toHaveLength(1);
    expect(round.dealerHand.cards).toHaveLength(0);
    expect(investigation.occupiedSeats.sort()).toEqual([3, 5]);
    expect(round.seats[3]?.playerCards ?? []).toHaveLength(0);
    expect(round.seats[5]?.playerCards ?? []).toHaveLength(0);
    expect(round.seats[3]?.betAmount).toBe(25);
  });

  it('tapping "Practice" again after a prior exercise dealt cards and advanced the count never resurfaces that stale state — it comes back exactly as fresh as a brand-new practice investigation', async () => {
    const first = await findOrCreatePracticeInvestigation();
    const round = first.rounds[first.rounds.length - 1];

    // Simulate a previous practice exercise that was left open mid-shoe:
    // dealer and seat 3 both have cards, and seat 3's hand has progressed.
    await addCardToRound({
      investigationLocalId: first.localId,
      roundId: round.id,
      targetType: "dealer",
      targetId: "dealer",
      rank: "K",
      applyToRound: (r) => ({
        ...r,
        dealerHand: { cards: [...r.dealerHand.cards, { rank: "K", suit: "unspecified" }] },
      }),
      event: { type: "card", message: "Dealer: K" },
    });
    await addCardToRound({
      investigationLocalId: first.localId,
      roundId: round.id,
      targetType: "seat",
      targetId: 3,
      rank: "7",
      applyToRound: (r) => ({
        ...r,
        seats: {
          ...r.seats,
          3: { ...r.seats[3]!, playerCards: [...r.seats[3]!.playerCards, { rank: "7", suit: "unspecified" }] },
        },
      }),
      event: { type: "card", message: "Seat 3: 7" },
    });

    const midSession = await getInvestigation(first.localId);
    expect(midSession?.rounds[0]?.dealerHand.cards).toHaveLength(1);
    expect(midSession?.rounds[0]?.seats[3]?.playerCards).toHaveLength(1);

    // The operator backs out without completing the investigation, then
    // taps "Practice" again later — the exact scenario reported live.
    const second = await findOrCreatePracticeInvestigation();

    // Same underlying record (identity preserved, no unbounded History growth)...
    expect(second.localId).toBe(first.localId);
    // ...but the live table state is completely fresh, not resumed.
    const secondRound = second.rounds[second.rounds.length - 1];
    expect(second.rounds).toHaveLength(1);
    expect(secondRound.dealerHand.cards).toHaveLength(0);
    expect(secondRound.seats[3]?.playerCards ?? []).toHaveLength(0);
    expect(second.occupiedSeats.sort()).toEqual([3, 5]);
    expect(secondRound.seats[3]?.betAmount).toBe(25);

    // No leftover CardEvents from the stale session are still "active" and
    // reachable through the reused investigation's ledger.
    const events = await getCardEventsForInvestigation(second.localId);
    const activeEvents = events.filter((e) => e.status === "active");
    expect(activeEvents).toHaveLength(0);
  });

  it("a CLOSED previous practice investigation is left untouched, and a brand-new open one is created instead", async () => {
    const first = await findOrCreatePracticeInvestigation();
    const { completeInvestigation } = await import("@/lib/db/repositories/investigations");
    await completeInvestigation(first.localId);

    const second = await findOrCreatePracticeInvestigation();

    expect(second.localId).not.toBe(first.localId);
    const closedStillThere = await getInvestigation(first.localId);
    expect(closedStillThere?.status).toBe("closed");
  });
});

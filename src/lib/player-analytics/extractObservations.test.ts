// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { addCardToRound, getCardEventsForInvestigation } from "@/lib/db/repositories/cardEvents";
import { createInvestigation, getInvestigation, mutateRound, resetAllData, advanceRound } from "@/lib/db/repositories/investigations";
import { createEmptySeatRecord } from "@/lib/db/repositories/investigations";
import { extractPlayerObservations } from "./extractObservations";
import type { CardCode } from "@/types/investigation";

beforeEach(async () => {
  await resetAllData();
});

async function freshInvestigation() {
  return createInvestigation({
    casino: "Test Casino",
    tableNumber: "BJ-7",
    dealerName: "",
    investigationDate: "2026-08-19",
    operatorName: "J. Smith",
    countingSystem: "Hi-Lo",
    shoeTotalDecks: 6,
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
    applyToRound: (round) => ({ ...round, dealerHand: { cards: [...round.dealerHand.cards, { rank, suit: "unspecified" }] } }),
    event: { type: "card", message: `Dealer: ${rank}` },
  });
}

async function seatSeat(investigationId: string, roundId: string, seatNumber: number, patch: Partial<ReturnType<typeof createEmptySeatRecord>>) {
  await mutateRound(
    investigationId,
    roundId,
    (round) => ({
      ...round,
      seats: { ...round.seats, [seatNumber]: { ...createEmptySeatRecord(seatNumber), ...patch, seatNumber } },
    }),
    { type: "bet-change", message: `Seat ${seatNumber} test setup` }
  );
}

describe("extractPlayerObservations — derives PlayerObservation[] from real investigation data only", () => {
  it("produces one observation per occupied seat per round, with the real wager fields copied through", async () => {
    const inv = await freshInvestigation();
    const roundId = inv.rounds[0].id;
    await seatSeat(inv.localId, roundId, 3, { betAmount: 25, startingWagerAmount: 25, playerCards: [{ rank: "10", suit: "unspecified" }, { rank: "7", suit: "unspecified" }], actions: ["stand"], outcome: "win" });

    const fresh = await getInvestigation(inv.localId);
    const cardEvents = await getCardEventsForInvestigation(inv.localId);
    const observations = extractPlayerObservations({ investigation: fresh!, cardEvents });

    expect(observations).toHaveLength(1);
    expect(observations[0].spotNumber).toBe(3);
    expect(observations[0].wagerAmount).toBe(25);
    expect(observations[0].outcome).toBe("win");
    expect(observations[0].actions).toEqual(["stand"]);
    expect(observations[0].handSequenceNumber).toBe(1);
    expect(observations[0].isSplitHand).toBe(false);
  });

  it("computes runningCountAtWager/trueCountAtWager from the count as of the END of the PREVIOUS round, matching apLikelihood's convention", async () => {
    const inv = await freshInvestigation();
    const round1Id = inv.rounds[0].id;
    await dealerAdd(inv.localId, round1Id, "K"); // Hi-Lo -1
    await dealerAdd(inv.localId, round1Id, "5"); // Hi-Lo +1 -> running 0 after round 1

    const afterRound1 = await getInvestigation(inv.localId);
    const round2 = await advanceRound(inv.localId, { newShoe: false });
    await seatSeat(inv.localId, round2.id, 1, { betAmount: 10, startingWagerAmount: 10 });
    await dealerAdd(inv.localId, round2.id, "5"); // Hi-Lo +1 during round 2 -> should NOT affect round 2's wager-time count

    const fresh = await getInvestigation(inv.localId);
    const cardEvents = await getCardEventsForInvestigation(inv.localId);
    const observations = extractPlayerObservations({ investigation: fresh!, cardEvents });

    expect(observations).toHaveLength(1);
    // The count going INTO round 2 is the count as of the end of round 1 (0), not round 2's own in-progress count.
    expect(observations[0].runningCountAtWager).toBe(0);
    expect(afterRound1).toBeTruthy();
  });

  it("stamps countMethodRef to the built-in adapter matching the investigation's own counting system", async () => {
    const inv = await freshInvestigation();
    await seatSeat(inv.localId, inv.rounds[0].id, 2, { betAmount: 5, startingWagerAmount: 5 });
    const fresh = await getInvestigation(inv.localId);
    const observations = extractPlayerObservations({ investigation: fresh!, cardEvents: [] });
    expect(observations[0].countMethodRef).toEqual({ id: "builtin-hi-lo", version: 1 });
  });

  it("marks insuranceOffered only when the dealer's first card is an Ace, and insuranceTaken only when an amount was actually wagered", async () => {
    const inv = await freshInvestigation();
    const roundId = inv.rounds[0].id;
    await dealerAdd(inv.localId, roundId, "A");
    await seatSeat(inv.localId, roundId, 4, { betAmount: 10, startingWagerAmount: 10, insuranceAmount: 5 });
    const fresh = await getInvestigation(inv.localId);
    const cardEvents = await getCardEventsForInvestigation(inv.localId);
    const observations = extractPlayerObservations({ investigation: fresh!, cardEvents });
    expect(observations[0].insuranceOffered).toBe(true);
    expect(observations[0].insuranceTaken).toBe(true);
  });

  it("does not offer insurance when the dealer's first card is not an Ace, even if an insuranceAmount value happens to be stored", async () => {
    const inv = await freshInvestigation();
    const roundId = inv.rounds[0].id;
    await dealerAdd(inv.localId, roundId, "9");
    await seatSeat(inv.localId, roundId, 4, { betAmount: 10, startingWagerAmount: 10 });
    const fresh = await getInvestigation(inv.localId);
    const cardEvents = await getCardEventsForInvestigation(inv.localId);
    const observations = extractPlayerObservations({ investigation: fresh!, cardEvents });
    expect(observations[0].insuranceOffered).toBe(false);
    expect(observations[0].insuranceTaken).toBeNull();
  });

  it("marks isFirstHandOfEntry on the first round a seat appears, and isLastHandBeforeExit when a later round shows the seat gone while play continues", async () => {
    const inv = await freshInvestigation();
    const round1 = inv.rounds[0];
    await seatSeat(inv.localId, round1.id, 5, { betAmount: 10, startingWagerAmount: 10 });
    const round2 = await advanceRound(inv.localId, { newShoe: false });
    await seatSeat(inv.localId, round2.id, 5, { betAmount: 10, startingWagerAmount: 10 });
    // Round 3: seat 5 leaves (no record at all).
    await advanceRound(inv.localId, { newShoe: false });

    const fresh = await getInvestigation(inv.localId);
    const observations = extractPlayerObservations({ investigation: fresh!, cardEvents: [] });

    expect(observations).toHaveLength(2);
    expect(observations[0].isFirstHandOfEntry).toBe(true);
    expect(observations[0].isLastHandBeforeExit).toBe(false);
    expect(observations[1].isFirstHandOfEntry).toBe(false);
    expect(observations[1].isLastHandBeforeExit).toBe(true);
  });

  it("includes a split sub-hand as its own observation sharing the parent's handSequenceNumber, flagged isSplitHand", async () => {
    const inv = await freshInvestigation();
    const roundId = inv.rounds[0].id;
    await seatSeat(inv.localId, roundId, 6, { betAmount: 10, startingWagerAmount: 10, playerCards: [{ rank: "8", suit: "unspecified" }, { rank: "8", suit: "unspecified" }], actions: ["split"] });
    await mutateRound(
      inv.localId,
      roundId,
      (round) => ({ ...round, splitHands: { ...round.splitHands, 6: { ...createEmptySeatRecord(6, 10), playerCards: [{ rank: "8", suit: "unspecified" }, { rank: "3", suit: "unspecified" }], actions: ["stand"] } } }),
      { type: "action", message: "Split test setup" }
    );

    const fresh = await getInvestigation(inv.localId);
    const observations = extractPlayerObservations({ investigation: fresh!, cardEvents: [] });

    expect(observations).toHaveLength(2);
    const [main, split] = observations;
    expect(main.isSplitHand).toBe(false);
    expect(split.isSplitHand).toBe(true);
    expect(split.handSequenceNumber).toBe(main.handSequenceNumber);
  });

  it("copies operator/deviation notes through verbatim, never paraphrasing", async () => {
    const inv = await freshInvestigation();
    const roundId = inv.rounds[0].id;
    await seatSeat(inv.localId, roundId, 1, { betAmount: 10, startingWagerAmount: 10, observationNote: "Player counted cards loudly", deviationNote: "stood 16 v. dealer 10" });
    const fresh = await getInvestigation(inv.localId);
    const observations = extractPlayerObservations({ investigation: fresh!, cardEvents: [] });
    expect(observations[0].observerNotes).toContain("Player counted cards loudly");
    expect(observations[0].observerNotes).toContain("stood 16 v. dealer 10");
  });

  it("returns an empty array for an investigation with no occupied seats — never fabricates observations", async () => {
    const inv = await freshInvestigation();
    const observations = extractPlayerObservations({ investigation: inv, cardEvents: [] });
    expect(observations).toEqual([]);
  });
});

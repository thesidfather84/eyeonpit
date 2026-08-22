// @vitest-environment jsdom
//
// EyeOnPit 1.14b — Floor Surveillance Workflow (AGENTS.md). Pins the
// CRITICAL ACCEPTANCE SCENARIO end to end at the repository layer — seat
// occupancy, wagers, wager changes, dealer changes, and New Deck must all
// compose deterministically without corrupting each other's state. Every
// primitive exercised here (occupySeat, markSeatEmpty, updateSeatBet,
// changeDealer, advanceRound, splitSeat) already existed before 1.14b —
// this file proves Floor's new UI wiring can safely rely on them together,
// not that any of them individually needed to change.
import { describe, expect, it } from "vitest";
import { addCardToRound, getCardEventsForInvestigation } from "@/lib/db/repositories/cardEvents";
import {
  advanceRound,
  changeDealer,
  createInvestigation,
  getInvestigation,
  markSeatEmpty,
  mutateRound,
  occupySeat,
  splitSeat,
  updateSeatBet,
} from "@/lib/db/repositories/investigations";
import { calculateCountSnapshot } from "@/lib/counting-engine/calculateCounts";
import { computeCardsRemaining } from "@/lib/counting-engine/calculateTrueCount";
import { eventsInShoe } from "@/lib/counting-engine/ledger";
import type { CardCode, WagerChange } from "@/types/investigation";

const FIRST: WagerChange = { direction: "first", amount: null, overridden: false };

async function freshInvestigation() {
  return createInvestigation({
    casino: "",
    tableNumber: "111",
    dealerName: "Dealer A",
    investigationDate: "2026-08-22",
    operatorName: "",
    countingSystem: "Hi-Lo",
    shoeTotalDecks: 1,
    blackjackFormat: "single-deck",
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

describe("CRITICAL ACCEPTANCE SCENARIO — Table 111, Single Deck, Dealer A, three seated players", () => {
  it("occupancy, wagers, dealer change, New Deck, and a departure all compose deterministically", async () => {
    const inv = await freshInvestigation();
    const round = inv.rounds[0];

    // Seat 1, 3, 5 player sits.
    await occupySeat(inv.localId, 1);
    await occupySeat(inv.localId, 3);
    await occupySeat(inv.localId, 5);
    let current = await getInvestigation(inv.localId);
    expect(current!.occupiedSeats.sort()).toEqual([1, 3, 5]);

    // Wagers: Seat 1 = $25, Seat 3 = $50, Seat 5 = $100.
    await updateSeatBet(inv.localId, round.id, 1, 25, FIRST);
    await updateSeatBet(inv.localId, round.id, 3, 50, FIRST);
    await updateSeatBet(inv.localId, round.id, 5, 100, FIRST);
    current = await getInvestigation(inv.localId);
    let liveRound = current!.rounds[current!.rounds.length - 1];
    expect(liveRound.seats[1]?.betAmount).toBe(25);
    expect(liveRound.seats[3]?.betAmount).toBe(50);
    expect(liveRound.seats[5]?.betAmount).toBe(100);

    // Cards dealt and counted normally.
    await dealerAdd(inv.localId, liveRound.id, "10");
    await dealerAdd(inv.localId, liveRound.id, "6");
    let events = await getCardEventsForInvestigation(inv.localId);
    let snapshot = calculateCountSnapshot(eventsInShoe(events, liveRound.shoeNumber), current!.shoeTotalDecks);
    expect(snapshot.exposedCardCount).toBe(2);
    expect(computeCardsRemaining(current!.shoeTotalDecks, snapshot.exposedCardCount)).toBe(50);

    // Seat 3 changes wager to $100 — must not touch Seats 1 or 5.
    await updateSeatBet(inv.localId, liveRound.id, 3, 100, { direction: "up", amount: 50, overridden: false });
    current = await getInvestigation(inv.localId);
    liveRound = current!.rounds[current!.rounds.length - 1];
    expect(liveRound.seats[3]?.betAmount).toBe(100);
    expect(liveRound.seats[1]?.betAmount).toBe(25);
    expect(liveRound.seats[5]?.betAmount).toBe(100); // unchanged from its own $100, not affected by Seat 3's edit

    // Dealer A -> Dealer B: MUST preserve active deck, cards remaining,
    // RC/TC, seat occupancy, and current wager/player state.
    await changeDealer(inv.localId, "Dealer B");
    current = await getInvestigation(inv.localId);
    expect(current!.dealerName).toBe("Dealer B");
    expect(current!.shoeTotalDecks).toBe(1);
    expect(current!.occupiedSeats.sort()).toEqual([1, 3, 5]);
    liveRound = current!.rounds[current!.rounds.length - 1];
    expect(liveRound.shoeNumber).toBe(round.shoeNumber); // same shoe
    expect(liveRound.seats[1]?.betAmount).toBe(25);
    expect(liveRound.seats[3]?.betAmount).toBe(100);
    expect(liveRound.seats[5]?.betAmount).toBe(100);

    events = await getCardEventsForInvestigation(inv.localId);
    snapshot = calculateCountSnapshot(eventsInShoe(events, liveRound.shoeNumber), current!.shoeTotalDecks);
    expect(snapshot.exposedCardCount).toBe(2);
    expect(computeCardsRemaining(current!.shoeTotalDecks, snapshot.exposedCardCount)).toBe(50);

    // NEW DECK: fresh 52-card active pack, Dealer B preserved, occupied
    // seats preserved. Not voided — the round with Seat 3's activity stays
    // in history, exactly like a real "new deck mid-round" transition.
    await advanceRound(inv.localId, { newShoe: true });
    current = await getInvestigation(inv.localId);
    expect(current!.dealerName).toBe("Dealer B");
    expect(current!.occupiedSeats.sort()).toEqual([1, 3, 5]);
    const newDeckRound = current!.rounds[current!.rounds.length - 1];
    expect(newDeckRound.shoeNumber).toBe(round.shoeNumber + 1);

    events = await getCardEventsForInvestigation(inv.localId);
    const freshSnapshot = calculateCountSnapshot(eventsInShoe(events, newDeckRound.shoeNumber), current!.shoeTotalDecks);
    expect(freshSnapshot.exposedCardCount).toBe(0);
    expect(computeCardsRemaining(current!.shoeTotalDecks, freshSnapshot.exposedCardCount)).toBe(52);

    // Seat 3 player leaves: Seat 3 becomes empty; Seats 1/5 untouched;
    // historical Seat 3 activity from the earlier shoe remains available.
    await markSeatEmpty(inv.localId, 3);
    current = await getInvestigation(inv.localId);
    expect(current!.occupiedSeats.sort()).toEqual([1, 5]);

    const historicalRound = current!.rounds.find((r) => r.id === round.id);
    expect(historicalRound?.seats[3]?.betAmount).toBe(100); // Seat 3's own recorded history intact
    expect(historicalRound?.seats[1]?.betAmount).toBe(25);
    expect(historicalRound?.seats[5]?.betAmount).toBe(100);
  });
});

describe("CASE K — player movement (Seat 3 -> Seat 5) via deterministic leave-then-sit", () => {
  it("no dedicated move primitive exists — markSeatEmpty(3) then occupySeat(5) is the intended, fully deterministic pattern", async () => {
    const inv = await freshInvestigation();
    await occupySeat(inv.localId, 3);

    await markSeatEmpty(inv.localId, 3);
    await occupySeat(inv.localId, 5);

    const updated = await getInvestigation(inv.localId);
    expect(updated!.occupiedSeats).toEqual([5]);
    expect(updated!.occupiedSeats).not.toContain(3);
  });
});

describe("CASE L/M — split and double are not corrupted by occupancy/wager operations on OTHER seats", () => {
  it("splitting Seat 3, then occupying/leaving/rebidding an unrelated seat, leaves the split hand's own state untouched", async () => {
    const inv = await freshInvestigation();
    const round = inv.rounds[0];
    await occupySeat(inv.localId, 3);
    await updateSeatBet(inv.localId, round.id, 3, 25, FIRST);
    const afterSplit = await splitSeat(inv.localId, round.id, 3);
    expect(afterSplit.splitHands[3]).toBeDefined();
    expect(afterSplit.splitHands[3]?.betAmount).toBe(25);

    // Unrelated Floor operations on a different seat.
    await occupySeat(inv.localId, 5);
    await updateSeatBet(inv.localId, round.id, 5, 50, FIRST);
    await markSeatEmpty(inv.localId, 5);

    const final = await getInvestigation(inv.localId);
    const finalRound = final!.rounds[final!.rounds.length - 1];
    expect(finalRound.splitHands[3]?.betAmount).toBe(25);
    expect(finalRound.seats[3]?.betAmount).toBe(25);
    expect(final!.occupiedSeats).not.toContain(5);
  });

  it("doubling Seat 3's primary hand does not affect its own split hand's independent wager", async () => {
    const inv = await freshInvestigation();
    const round = inv.rounds[0];
    await occupySeat(inv.localId, 3);
    await updateSeatBet(inv.localId, round.id, 3, 25, FIRST);
    await splitSeat(inv.localId, round.id, 3);

    // Real Double on the primary hand only (doubles betAmount, flags doubled) —
    // PlayerActionsRow.handleDouble's exact mutation shape, never touching splitHands.
    const before = await getInvestigation(inv.localId);
    const beforeRound = before!.rounds[before!.rounds.length - 1];
    await mutateRound(
      inv.localId,
      beforeRound.id,
      (r) => ({
        ...r,
        seats: { ...r.seats, 3: { ...r.seats[3]!, betAmount: r.seats[3]!.betAmount! * 2, doubled: true } },
      }),
      { type: "action", message: "Spot 3: Double" }
    );

    const after = await getInvestigation(inv.localId);
    const afterRound = after!.rounds[after!.rounds.length - 1];
    expect(afterRound.seats[3]?.betAmount).toBe(50);
    expect(afterRound.splitHands[3]?.betAmount).toBe(25); // split hand's own wager independent
  });
});

describe("CASE H — wager carry-forward across a New Round matches the documented, existing lifecycle", () => {
  it("Next Round restores each occupied seat's STARTING wager (not a Double's ended amount), with wagerChange reset to 'same'", async () => {
    const inv = await freshInvestigation();
    const round = inv.rounds[0];
    await occupySeat(inv.localId, 1);
    await updateSeatBet(inv.localId, round.id, 1, 25, FIRST);

    // A real Double (PlayerActionsRow.handleDouble's exact mutation shape)
    // only changes the CURRENT bet, never startingWagerAmount.
    await mutateRound(
      inv.localId,
      round.id,
      (r) => ({
        ...r,
        seats: {
          ...r.seats,
          1: { ...r.seats[1]!, betAmount: (r.seats[1]!.betAmount ?? 0) * 2, doubled: true },
        },
      }),
      { type: "action", message: "Spot 1: Double" }
    );
    const midRound = (await getInvestigation(inv.localId))!.rounds[0];
    expect(midRound.seats[1]?.startingWagerAmount).toBe(25);
    expect(midRound.seats[1]?.betAmount).toBe(50);

    await advanceRound(inv.localId, { newShoe: false });
    const after = await getInvestigation(inv.localId);
    const nextRound = after!.rounds[after!.rounds.length - 1];
    expect(nextRound.seats[1]?.betAmount).toBe(25); // starting wager carried forward, not the doubled $50
    expect(nextRound.seats[1]?.wagerChange).toEqual({ direction: "same", amount: 0, overridden: false });
  });
});

describe("CASE O — a wrong wager can be corrected safely, without touching other seats or historical rounds", () => {
  it("re-applying updateSeatBet on the same seat overwrites cleanly", async () => {
    const inv = await freshInvestigation();
    const round = inv.rounds[0];
    await occupySeat(inv.localId, 1);
    await updateSeatBet(inv.localId, round.id, 1, 500, FIRST); // fat-fingered
    await updateSeatBet(inv.localId, round.id, 1, 25, { direction: "down", amount: 475, overridden: false }); // corrected

    const updated = await getInvestigation(inv.localId);
    expect(updated!.rounds[0].seats[1]?.betAmount).toBe(25);
  });
});

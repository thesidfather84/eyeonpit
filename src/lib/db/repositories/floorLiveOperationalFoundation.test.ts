// @vitest-environment jsdom
//
// EyeOnPit 1.14a — Floor/Live Configuration & Operational Foundation
// (AGENTS.md). Pins the CRITICAL ACCEPTANCE SCENARIO and the dealer/shoe/
// table-context matrix (section 21, cases F/G/H/I/J): dealer change and
// New Shoe are independent transitions, and configuration changes after
// CardEvents exist can never silently reinterpret historical cards.
import { describe, expect, it } from "vitest";
import { addCardToRound, getCardEventsForInvestigation } from "@/lib/db/repositories/cardEvents";
import {
  advanceRound,
  changeDealer,
  createInvestigation,
  getInvestigation,
  updateGameConfig,
  updateGameConfigAndRecalculate,
  updateGameConfigAndStartNewShoe,
} from "@/lib/db/repositories/investigations";
import { calculateCountSnapshot } from "@/lib/counting-engine/calculateCounts";
import { computeCardsRemaining } from "@/lib/counting-engine/calculateTrueCount";
import { eventsInShoe } from "@/lib/counting-engine/ledger";
import type { CardCode } from "@/types/investigation";

async function freshInvestigation(shoeTotalDecks: number, dealerName = "Dealer A") {
  return createInvestigation({
    casino: "",
    tableNumber: "111",
    dealerName,
    investigationDate: "2026-08-22",
    operatorName: "",
    countingSystem: "Hi-Lo",
    shoeTotalDecks,
    blackjackFormat: "shoe",
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

async function dealN(investigationId: string, roundId: string, n: number) {
  for (let i = 0; i < n; i++) await dealerAdd(investigationId, roundId, "2");
}

describe("CRITICAL ACCEPTANCE SCENARIO — Table 111, 6-deck shoe, Dealer A -> Dealer B -> New Shoe", () => {
  it("dealer change mid-shoe does not reset cards/decks/count; New Shoe (deliberate) does", async () => {
    const inv = await freshInvestigation(6, "Dealer A");
    const round = inv.rounds[0];
    await dealN(inv.localId, round.id, 104); // observe 104 of 312

    let events = await getCardEventsForInvestigation(inv.localId);
    let snapshot = calculateCountSnapshot(eventsInShoe(events, round.shoeNumber), inv.shoeTotalDecks);
    expect(computeCardsRemaining(inv.shoeTotalDecks, snapshot.exposedCardCount)).toBe(208);
    expect(snapshot.decksRemaining).toBe(4);
    const runningBeforeDealerChange = snapshot["Hi-Lo"].running;

    // Dealer A -> Dealer B, same shoe.
    await changeDealer(inv.localId, "Dealer B");
    const afterDealerChange = await getInvestigation(inv.localId);
    expect(afterDealerChange!.dealerName).toBe("Dealer B");
    expect(afterDealerChange!.shoeTotalDecks).toBe(6); // unchanged
    const currentRoundAfter = afterDealerChange!.rounds[afterDealerChange!.rounds.length - 1];
    expect(currentRoundAfter.shoeNumber).toBe(round.shoeNumber); // SAME shoe — no reset

    events = await getCardEventsForInvestigation(inv.localId);
    snapshot = calculateCountSnapshot(eventsInShoe(events, currentRoundAfter.shoeNumber), afterDealerChange!.shoeTotalDecks);
    expect(computeCardsRemaining(afterDealerChange!.shoeTotalDecks, snapshot.exposedCardCount)).toBe(208);
    expect(snapshot.decksRemaining).toBe(4);
    expect(snapshot["Hi-Lo"].running).toBe(runningBeforeDealerChange);

    // Only NOW, a deliberate New Shoe — fresh 6-deck/312-card shoe begins.
    await advanceRound(inv.localId, { newShoe: true });
    const afterNewShoe = await getInvestigation(inv.localId);
    expect(afterNewShoe!.dealerName).toBe("Dealer B"); // dealer untouched by New Shoe
    const newRound = afterNewShoe!.rounds[afterNewShoe!.rounds.length - 1];
    expect(newRound.shoeNumber).toBe(round.shoeNumber + 1);

    events = await getCardEventsForInvestigation(inv.localId);
    const freshSnapshot = calculateCountSnapshot(eventsInShoe(events, newRound.shoeNumber), afterNewShoe!.shoeTotalDecks);
    expect(freshSnapshot.exposedCardCount).toBe(0);
    expect(computeCardsRemaining(afterNewShoe!.shoeTotalDecks, freshSnapshot.exposedCardCount)).toBe(312);
    expect(freshSnapshot.decksRemaining).toBe(6);
    expect(freshSnapshot["Hi-Lo"].running).toBe(0);
  });
});

describe("CASE F — Next Dealer never touches shoe/card/count state", () => {
  it("cards remaining and running count are byte-for-byte identical immediately before/after a dealer change", async () => {
    const inv = await freshInvestigation(6, "Dealer A");
    const round = inv.rounds[0];
    await dealN(inv.localId, round.id, 50);

    const events = await getCardEventsForInvestigation(inv.localId);
    const before = calculateCountSnapshot(eventsInShoe(events, round.shoeNumber), inv.shoeTotalDecks);

    await changeDealer(inv.localId, "Dealer B");

    const afterInv = await getInvestigation(inv.localId);
    const afterEvents = await getCardEventsForInvestigation(inv.localId);
    const after = calculateCountSnapshot(eventsInShoe(afterEvents, round.shoeNumber), afterInv!.shoeTotalDecks);

    expect(after).toEqual(before);
  });

  it("changeDealer logs an auditable table event without creating/undoing any CardEvent", async () => {
    const inv = await freshInvestigation(6, "Dealer A");
    const round = inv.rounds[0];
    await dealerAdd(inv.localId, round.id, "5");
    const eventsBefore = await getCardEventsForInvestigation(inv.localId);

    await changeDealer(inv.localId, "Dealer B");

    const eventsAfter = await getCardEventsForInvestigation(inv.localId);
    expect(eventsAfter).toEqual(eventsBefore);

    const afterInv = await getInvestigation(inv.localId);
    const lastLog = afterInv!.rounds[0].eventLog.at(-1);
    expect(lastLog?.type).toBe("table-event");
    expect(lastLog?.message).toContain("Dealer B");
  });
});

describe("CASE G — New Shoe after a dealer change restores the full configured shoe", () => {
  it("Dealer B -> New Shoe -> 312 cards / 6 decks restored", async () => {
    const inv = await freshInvestigation(6, "Dealer A");
    const round = inv.rounds[0];
    await dealN(inv.localId, round.id, 200);
    await changeDealer(inv.localId, "Dealer B");

    await advanceRound(inv.localId, { newShoe: true });
    const afterInv = await getInvestigation(inv.localId);
    const newRound = afterInv!.rounds[afterInv!.rounds.length - 1];
    const events = await getCardEventsForInvestigation(inv.localId);
    const snapshot = calculateCountSnapshot(eventsInShoe(events, newRound.shoeNumber), afterInv!.shoeTotalDecks);

    expect(computeCardsRemaining(afterInv!.shoeTotalDecks, snapshot.exposedCardCount)).toBe(312);
    expect(snapshot.decksRemaining).toBe(6);
  });
});

describe("CASE H — Single Deck New Deck restores 52 cards, dealer identity preserved", () => {
  it("dealerName survives a New Deck the same way it survives a New Shoe", async () => {
    const inv = await freshInvestigation(1, "Dealer A");
    await updateGameConfig(inv.localId, { blackjackFormat: "single-deck" }); // no cards yet — safe field path
    const round = inv.rounds[0];
    await dealN(inv.localId, round.id, 26);

    await advanceRound(inv.localId, { newShoe: true });
    const afterInv = await getInvestigation(inv.localId);
    expect(afterInv!.dealerName).toBe("Dealer A");
    const newRound = afterInv!.rounds[afterInv!.rounds.length - 1];
    const events = await getCardEventsForInvestigation(inv.localId);
    const snapshot = calculateCountSnapshot(eventsInShoe(events, newRound.shoeNumber), afterInv!.shoeTotalDecks);
    expect(computeCardsRemaining(afterInv!.shoeTotalDecks, snapshot.exposedCardCount)).toBe(52);
  });
});

describe("CASE I — dangerous shoe-size change after CardEvents exist", () => {
  it("updateGameConfig REFUSES to change shoeTotalDecks once the active shoe has recorded cards — no silent historical reinterpretation", async () => {
    const inv = await freshInvestigation(6);
    const round = inv.rounds[0];
    await dealN(inv.localId, round.id, 100);

    await expect(updateGameConfig(inv.localId, { shoeTotalDecks: 8 })).rejects.toThrow();
    await expect(updateGameConfig(inv.localId, { blackjackFormat: "double-deck" })).rejects.toThrow();

    const unchanged = await getInvestigation(inv.localId);
    expect(unchanged!.shoeTotalDecks).toBe(6);
    expect(unchanged!.blackjackFormat).toBe("shoe");
  });

  it("updateGameConfig still allows non-counting-relevant fields (table, dealer, pit) on a shoe with recorded cards", async () => {
    const inv = await freshInvestigation(6);
    const round = inv.rounds[0];
    await dealN(inv.localId, round.id, 10);

    await updateGameConfig(inv.localId, { tableNumber: "222", dealerName: "Dealer Z" });
    const updated = await getInvestigation(inv.localId);
    expect(updated!.tableNumber).toBe("222");
    expect(updated!.dealerName).toBe("Dealer Z");
    expect(updated!.shoeTotalDecks).toBe(6);
  });

  it("updateGameConfigAndStartNewShoe (the safe path) preserves the OLD shoe's original denominator — its historical count never changes", async () => {
    const inv = await freshInvestigation(6);
    const round = inv.rounds[0];
    await dealN(inv.localId, round.id, 100);
    const eventsBeforeChange = await getCardEventsForInvestigation(inv.localId);
    const originalShoeSnapshot = calculateCountSnapshot(eventsInShoe(eventsBeforeChange, round.shoeNumber), 6);

    await updateGameConfigAndStartNewShoe(inv.localId, { shoeTotalDecks: 8 });

    const afterInv = await getInvestigation(inv.localId);
    expect(afterInv!.shoeTotalDecks).toBe(8);
    const events = await getCardEventsForInvestigation(inv.localId);

    // The OLD shoe's own events, recomputed with what its denominator
    // ACTUALLY was (6) at the time — must match exactly what was true then.
    const oldShoeReplayed = calculateCountSnapshot(eventsInShoe(events, round.shoeNumber), 6);
    expect(oldShoeReplayed).toEqual(originalShoeSnapshot);
    expect(oldShoeReplayed.exposedCardCount).toBe(100);

    // The new shoe is a fresh 8-deck/416-card pack, entirely independent.
    const newRound = afterInv!.rounds[afterInv!.rounds.length - 1];
    const newShoeSnapshot = calculateCountSnapshot(eventsInShoe(events, newRound.shoeNumber), afterInv!.shoeTotalDecks);
    expect(newShoeSnapshot.exposedCardCount).toBe(0);
    expect(computeCardsRemaining(afterInv!.shoeTotalDecks, newShoeSnapshot.exposedCardCount)).toBe(416);
  });

  it("updateGameConfigAndRecalculate is the one explicit, deliberate path allowed to reinterpret the SAME shoe's already-recorded cards under a new denominator", async () => {
    const inv = await freshInvestigation(6);
    const round = inv.rounds[0];
    await dealN(inv.localId, round.id, 100);

    await updateGameConfigAndRecalculate(inv.localId, { shoeTotalDecks: 8 });

    const afterInv = await getInvestigation(inv.localId);
    expect(afterInv!.shoeTotalDecks).toBe(8);
    const currentRound = afterInv!.rounds[afterInv!.rounds.length - 1];
    expect(currentRound.shoeNumber).toBe(round.shoeNumber); // same shoe, deliberately reinterpreted

    const events = await getCardEventsForInvestigation(inv.localId);
    const snapshot = calculateCountSnapshot(eventsInShoe(events, currentRound.shoeNumber), afterInv!.shoeTotalDecks);
    expect(computeCardsRemaining(afterInv!.shoeTotalDecks, snapshot.exposedCardCount)).toBe(416 - 100);
  });

  it("updateGameConfig allows shoeTotalDecks/blackjackFormat changes freely before any card has been observed", async () => {
    const inv = await freshInvestigation(6);
    await updateGameConfig(inv.localId, { shoeTotalDecks: 8 });
    const updated = await getInvestigation(inv.localId);
    expect(updated!.shoeTotalDecks).toBe(8);
  });
});

describe("CASE J — table identity change never contaminates the count, and separate investigations never share state", () => {
  it("changing tableNumber mid-shoe leaves cards/decks/count completely unaffected", async () => {
    const inv = await freshInvestigation(6);
    const round = inv.rounds[0];
    await dealN(inv.localId, round.id, 30);
    const eventsBefore = await getCardEventsForInvestigation(inv.localId);
    const before = calculateCountSnapshot(eventsInShoe(eventsBefore, round.shoeNumber), inv.shoeTotalDecks);

    await updateGameConfig(inv.localId, { tableNumber: "999" });

    const afterInv = await getInvestigation(inv.localId);
    const eventsAfter = await getCardEventsForInvestigation(inv.localId);
    const after = calculateCountSnapshot(eventsInShoe(eventsAfter, round.shoeNumber), afterInv!.shoeTotalDecks);
    expect(after).toEqual(before);
    expect(afterInv!.tableNumber).toBe("999");
  });

  it("two separate investigations (two tables) never share CardEvents or count state", async () => {
    const tableA = await freshInvestigation(6, "Dealer A");
    const tableB = await freshInvestigation(1, "Dealer C");
    await updateGameConfig(tableB.localId, { blackjackFormat: "single-deck" });

    await dealN(tableA.localId, tableA.rounds[0].id, 20);
    await dealerAdd(tableB.localId, tableB.rounds[0].id, "A");

    const eventsA = await getCardEventsForInvestigation(tableA.localId);
    const eventsB = await getCardEventsForInvestigation(tableB.localId);
    expect(eventsA).toHaveLength(20);
    expect(eventsB).toHaveLength(1);
    expect(eventsA.every((e) => e.investigationId === tableA.localId)).toBe(true);
    expect(eventsB.every((e) => e.investigationId === tableB.localId)).toBe(true);

    const snapshotA = calculateCountSnapshot(eventsInShoe(eventsA, tableA.rounds[0].shoeNumber), 6);
    const snapshotB = calculateCountSnapshot(eventsInShoe(eventsB, tableB.rounds[0].shoeNumber), 1);
    expect(snapshotA.exposedCardCount).toBe(20);
    expect(snapshotB.exposedCardCount).toBe(1);
  });
});

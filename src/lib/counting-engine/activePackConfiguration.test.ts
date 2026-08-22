// @vitest-environment jsdom
//
// EyeOnPit 1.13a — Active Pack / Deck Configuration Accuracy (AGENTS.md).
// Pins the Test Matrix (section 16) proving cards/decks remaining and every
// count engine derive from the ACTIVE pack/shoe actually being dealt, never
// from a physical-deck-inventory notion — this codebase has no such field;
// `investigation.shoeTotalDecks` (paired with `blackjackFormat`) already IS
// the active pack size, and `format: "single-deck"`/`"double-deck"` fix it
// to 1/2 regardless of how many physical decks exist at the table. These
// tests exist to keep that invariant from regressing, not to introduce a
// new counting mechanism.
import { describe, expect, it } from "vitest";
import { addCardToRound, getCardEventsForInvestigation, undoTargetCard } from "@/lib/db/repositories/cardEvents";
import { advanceRound, createInvestigation, getInvestigation } from "@/lib/db/repositories/investigations";
import { calculateCountSnapshot } from "@/lib/counting-engine/calculateCounts";
import { computeCardsRemaining, computeDecksRemaining } from "@/lib/counting-engine/calculateTrueCount";
import { eventsInShoe } from "@/lib/counting-engine/ledger";
import type { BlackjackFormat, CardCode } from "@/types/investigation";

async function freshInvestigation(shoeTotalDecks: number, blackjackFormat: BlackjackFormat = "shoe") {
  return createInvestigation({
    casino: "",
    tableNumber: "",
    dealerName: "",
    investigationDate: "2026-08-22",
    operatorName: "",
    countingSystem: "Hi-Lo",
    shoeTotalDecks,
    blackjackFormat,
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

async function dealN(investigationId: string, roundId: string, n: number, rank: CardCode["rank"] = "2") {
  for (let i = 0; i < n; i++) {
    await dealerAdd(investigationId, roundId, rank);
  }
}

describe("CASE A — single-deck pitch: 1 physical/1 active deck, 52 active cards", () => {
  it("starts at exactly 1 deck / 52 cards remaining", async () => {
    const inv = await freshInvestigation(1, "single-deck");
    const snapshot = calculateCountSnapshot([], inv.shoeTotalDecks);
    expect(snapshot.decksRemaining).toBe(1);
    expect(computeCardsRemaining(inv.shoeTotalDecks, 0)).toBe(52);
  });
});

describe("CASE B — CRITICAL: alternating pitch, one active deck + one inactive (shuffling) deck", () => {
  it("a table with TWO physical single decks (Red dealt, Blue shuffling), format=single-deck, must count as a 52-card active pack — never 104", async () => {
    const inv = await freshInvestigation(1, "single-deck");
    const round = inv.rounds[0];

    // The inactive Blue deck contributes NOTHING — there is no field for it
    // to occupy in this data model, and shoeTotalDecks stays 1 regardless.
    await dealN(inv.localId, round.id, 26);

    const events = await getCardEventsForInvestigation(inv.localId);
    const snapshot = calculateCountSnapshot(eventsInShoe(events, round.shoeNumber), inv.shoeTotalDecks);

    expect(snapshot.exposedCardCount).toBe(26);
    expect(computeCardsRemaining(inv.shoeTotalDecks, snapshot.exposedCardCount)).toBe(26);
    expect(snapshot.decksRemaining).toBe(0.5);

    // The acceptance test's explicit counter-example: must NOT be computed
    // as if Red+Blue formed a 104-card shoe.
    expect(computeCardsRemaining(inv.shoeTotalDecks, snapshot.exposedCardCount)).not.toBe(78);
    expect(snapshot.decksRemaining).not.toBe(1.5);
  });

  it("Hi-Lo true count at 0.5 decks remaining uses 0.5 as the denominator, not 1.5", async () => {
    const inv = await freshInvestigation(1, "single-deck");
    const round = inv.rounds[0];
    // 26 low cards (2-6) => Hi-Lo running count +26.
    await dealN(inv.localId, round.id, 26, "2");

    const events = await getCardEventsForInvestigation(inv.localId);
    const snapshot = calculateCountSnapshot(eventsInShoe(events, round.shoeNumber), inv.shoeTotalDecks);

    expect(snapshot["Hi-Lo"].running).toBe(26);
    expect(snapshot.decksRemaining).toBe(0.5);
    expect(snapshot["Hi-Lo"].trueCount).toBeCloseTo(26 / 0.5, 10); // 52, not 26/1.5
  });
});

describe("CASE C — double-deck game: both physical decks form ONE active pack, 104 active cards", () => {
  it("starts at exactly 2 decks / 104 cards remaining", async () => {
    const inv = await freshInvestigation(2, "double-deck");
    const snapshot = calculateCountSnapshot([], inv.shoeTotalDecks);
    expect(snapshot.decksRemaining).toBe(2);
    expect(computeCardsRemaining(inv.shoeTotalDecks, 0)).toBe(104);
  });

  it("104 cards observed from the SAME active pack correctly depletes both decks together (legitimate, unlike Case B)", async () => {
    const inv = await freshInvestigation(2, "double-deck");
    const round = inv.rounds[0];
    await dealN(inv.localId, round.id, 104);
    const events = await getCardEventsForInvestigation(inv.localId);
    const snapshot = calculateCountSnapshot(eventsInShoe(events, round.shoeNumber), inv.shoeTotalDecks);
    expect(computeCardsRemaining(inv.shoeTotalDecks, snapshot.exposedCardCount)).toBe(0);
  });
});

describe("CASE D/E — multi-deck shoe games", () => {
  it("6-deck shoe starts at 312 active cards", async () => {
    const inv = await freshInvestigation(6, "shoe");
    expect(computeCardsRemaining(inv.shoeTotalDecks, 0)).toBe(312);
  });

  it("8-deck shoe starts at 416 active cards", async () => {
    const inv = await freshInvestigation(8, "shoe");
    expect(computeCardsRemaining(inv.shoeTotalDecks, 0)).toBe(416);
  });

  it("104 cards observed from a 6-deck shoe leaves 208 cards / 4 decks remaining — all six decks legitimately share one active shoe", async () => {
    expect(computeCardsRemaining(6, 104)).toBe(208);
    expect(computeDecksRemaining(6, 104)).toBe(4);
  });
});

describe("CASE F — count works from the configured active shoe size regardless of any notion of physical inventory", () => {
  it("nothing in the engine reads or requires a physical-deck-inventory value — decksInPlay is the only input", () => {
    // calculateCountSnapshot's signature itself is the proof: it takes only
    // (events, decksInPlay). There is no second "physical inventory"
    // parameter anywhere for it to be confused by.
    expect(calculateCountSnapshot.length).toBe(2);
  });
});

describe("CASE H — active pack transition: Red ends, Blue becomes active with fresh state", () => {
  it("New Shoe/New Deck (advanceRound newShoe:true) starts the next pack at full cards, independent of the prior pack's depletion", async () => {
    const inv = await freshInvestigation(1, "single-deck");
    const round1 = inv.rounds[0];
    await dealN(inv.localId, round1.id, 26); // Red depleted halfway

    await advanceRound(inv.localId, { newShoe: true }); // Blue becomes active
    const afterTransition = await getInvestigation(inv.localId);
    const round2 = afterTransition!.rounds[afterTransition!.rounds.length - 1];
    expect(round2.shoeNumber).toBe(round1.shoeNumber + 1);

    const events = await getCardEventsForInvestigation(inv.localId);
    const blueSnapshot = calculateCountSnapshot(eventsInShoe(events, round2.shoeNumber), afterTransition!.shoeTotalDecks);

    // Blue starts as its own fresh 52-card active pack — Red's 26 exposed
    // cards must NOT carry over.
    expect(blueSnapshot.exposedCardCount).toBe(0);
    expect(blueSnapshot.decksRemaining).toBe(1);
    expect(blueSnapshot["Hi-Lo"].running).toBe(0);

    // Red's own history is untouched, still queryable by its own shoeNumber.
    const redSnapshot = calculateCountSnapshot(eventsInShoe(events, round1.shoeNumber), afterTransition!.shoeTotalDecks);
    expect(redSnapshot.exposedCardCount).toBe(26);
  });
});

describe("CASE I — Undo restores cards/decks remaining exactly, single-deck lifecycle", () => {
  it("52 -> observe 5 -> 51 remaining -> observe King -> 50 remaining -> Undo -> 51 remaining", async () => {
    const inv = await freshInvestigation(1, "single-deck");
    const round = inv.rounds[0];

    await dealerAdd(inv.localId, round.id, "5");
    let events = await getCardEventsForInvestigation(inv.localId);
    let snapshot = calculateCountSnapshot(eventsInShoe(events, round.shoeNumber), inv.shoeTotalDecks);
    expect(computeCardsRemaining(inv.shoeTotalDecks, snapshot.exposedCardCount)).toBe(51);

    const { cardEvent: kingEvent } = await dealerAdd(inv.localId, round.id, "K");
    events = await getCardEventsForInvestigation(inv.localId);
    snapshot = calculateCountSnapshot(eventsInShoe(events, round.shoeNumber), inv.shoeTotalDecks);
    expect(computeCardsRemaining(inv.shoeTotalDecks, snapshot.exposedCardCount)).toBe(50);

    // LIFO: undo the most recently dealt card (the King), matching the
    // spec's exact acceptance sequence.
    await undoTargetCard(inv.localId, round.id, kingEvent.id, "dealer", "dealer");
    events = await getCardEventsForInvestigation(inv.localId);
    snapshot = calculateCountSnapshot(eventsInShoe(events, round.shoeNumber), inv.shoeTotalDecks);
    expect(computeCardsRemaining(inv.shoeTotalDecks, snapshot.exposedCardCount)).toBe(51);
  });

  it("Undo never modifies the investigation's active-pack configuration (shoeTotalDecks/blackjackFormat)", async () => {
    const inv = await freshInvestigation(1, "single-deck");
    const round = inv.rounds[0];
    const { cardEvent } = await dealerAdd(inv.localId, round.id, "5");
    await undoTargetCard(inv.localId, round.id, cardEvent.id, "dealer", "dealer");

    const after = await getInvestigation(inv.localId);
    expect(after!.shoeTotalDecks).toBe(1);
    expect(after!.blackjackFormat).toBe("single-deck");
  });
});

describe("CASE J — Ace tracking resets cleanly across an active-pack transition", () => {
  it("an Ace exposed in the outgoing pack does not count toward the new pack's Aces Seen", async () => {
    const inv = await freshInvestigation(1, "single-deck");
    const round1 = inv.rounds[0];
    await dealerAdd(inv.localId, round1.id, "A");

    await advanceRound(inv.localId, { newShoe: true });
    const afterTransition = await getInvestigation(inv.localId);
    const round2 = afterTransition!.rounds[afterTransition!.rounds.length - 1];

    const events = await getCardEventsForInvestigation(inv.localId);
    const acesInNewPack = eventsInShoe(events, round2.shoeNumber).filter((e) => e.rank === "A" && e.status === "active");
    expect(acesInNewPack).toHaveLength(0);

    const acesInOldPack = eventsInShoe(events, round1.shoeNumber).filter((e) => e.rank === "A" && e.status === "active");
    expect(acesInOldPack).toHaveLength(1);
  });
});

describe("CASE M — Floor/Quick investigation creation never silently assumes an unrelated deck count", () => {
  it("shoeTotalDecks is stored exactly as passed in — createInvestigation never substitutes a hidden fallback (e.g. 5) when a real value is given", async () => {
    const inv = await createInvestigation({
      casino: "",
      tableNumber: "",
      dealerName: "",
      investigationDate: "2026-08-22",
      operatorName: "",
      countingSystem: "Hi-Lo",
      shoeTotalDecks: 1,
      blackjackFormat: "single-deck",
      status: "active",
    });
    expect(inv.shoeTotalDecks).toBe(1);
    expect(inv.shoeTotalDecks).not.toBe(5);
  });
});

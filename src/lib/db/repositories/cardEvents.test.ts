// @vitest-environment jsdom
import { v4 as uuidv4 } from "uuid";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import {
  addCardToRound,
  ensureLegacyLedger,
  getCardEventsForInvestigation,
  redoTargetCard,
  undoTargetCard,
} from "@/lib/db/repositories/cardEvents";
import {
  advanceRound,
  completeInvestigation,
  completeRound,
  createInvestigation,
  getInvestigation,
  markSeatEmpty,
  occupySeat,
} from "@/lib/db/repositories/investigations";
import { calculateCountSnapshot } from "@/lib/counting-engine/calculateCounts";
import type { CardCode, Investigation } from "@/types/investigation";

async function freshInvestigation(shoeTotalDecks = 6) {
  return createInvestigation({
    casino: "",
    tableNumber: "",
    dealerName: "",
    investigationDate: "2026-07-30",
    operatorName: "",
    countingSystem: "Hi-Lo",
    shoeTotalDecks,
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

function seatAdd(investigationId: string, roundId: string, seatNumber: number, rank: CardCode["rank"]) {
  return addCardToRound({
    investigationLocalId: investigationId,
    roundId,
    targetType: "seat",
    targetId: seatNumber,
    rank,
    applyToRound: (round) => {
      const seat = round.seats[seatNumber];
      if (!seat) return round;
      return { ...round, seats: { ...round.seats, [seatNumber]: { ...seat, playerCards: [...seat.playerCards, { rank, suit: "unspecified" }] } } };
    },
    event: { type: "card", message: `Seat ${seatNumber}: ${rank}` },
  });
}

describe("cardEvents repository — idempotency", () => {
  it("writing the same event id twice via Dexie's primary key produces exactly one stored row", async () => {
    const inv = await freshInvestigation();
    const round = inv.rounds[0];
    const { cardEvent } = await dealerAdd(inv.localId, round.id, "10");

    // Simulate a retried write of the exact same logical event (same id).
    await getDb().cardEvents.put({ ...cardEvent });
    await getDb().cardEvents.put({ ...cardEvent });

    const events = await getCardEventsForInvestigation(inv.localId);
    expect(events.filter((e) => e.id === cardEvent.id)).toHaveLength(1);
    const snapshot = calculateCountSnapshot(events, inv.shoeTotalDecks);
    expect(snapshot["Hi-Lo"].running).toBe(-1); // one "10", not two
  });
});

describe("cardEvents repository — seat removal preserves exposed cards", () => {
  it("marking a seat empty never deletes or excludes its already-exposed CardEvents", async () => {
    const inv = await freshInvestigation();
    const round = inv.rounds[0];
    await occupySeat(inv.localId, 3);
    await seatAdd(inv.localId, round.id, 3, "5");
    await seatAdd(inv.localId, round.id, 3, "6");

    const before = calculateCountSnapshot(await getCardEventsForInvestigation(inv.localId), inv.shoeTotalDecks);
    expect(before["Hi-Lo"].running).toBe(2); // +1 + +1

    await markSeatEmpty(inv.localId, 3);
    const afterInvestigation = await getInvestigation(inv.localId);
    expect(afterInvestigation!.rounds[0].seats[3]).toBeUndefined(); // display record is gone…

    const after = calculateCountSnapshot(await getCardEventsForInvestigation(inv.localId), inv.shoeTotalDecks);
    expect(after["Hi-Lo"].running).toBe(2); // …but the ledger, and therefore the count, is unchanged
    expect(after.exposedCardCount).toBe(before.exposedCardCount);
  });
});

describe("cardEvents repository — undo/redo via the real transactional path", () => {
  it("undo flips the specific CardEvent to undone; redo restores exactly that one", async () => {
    const inv = await freshInvestigation();
    const round = inv.rounds[0];
    const { cardEvent: first } = await dealerAdd(inv.localId, round.id, "10");
    const { cardEvent: second } = await dealerAdd(inv.localId, round.id, "5");

    const undone = await undoTargetCard(inv.localId, round.id, second.id, "dealer", "dealer");
    expect(undone.dealerHand.cards.map((c) => c.rank)).toEqual(["10"]);
    let snapshot = calculateCountSnapshot(await getCardEventsForInvestigation(inv.localId), inv.shoeTotalDecks);
    expect(snapshot["Hi-Lo"].running).toBe(-1); // only the "10" is active

    const redone = await redoTargetCard(inv.localId, round.id, second.id, "dealer", "dealer", "5");
    expect(redone.dealerHand.cards.map((c) => c.rank)).toEqual(["10", "5"]);
    snapshot = calculateCountSnapshot(await getCardEventsForInvestigation(inv.localId), inv.shoeTotalDecks);
    expect(snapshot["Hi-Lo"].running).toBe(0); // "10" (-1) + "5" (+1)

    void first; // (first event's id — not directly asserted beyond being distinct from the second)
  });

  it("undoing an earlier target's card leaves a later, unrelated target's card completely untouched (interleaved multi-seat entry)", async () => {
    // Regression coverage for the reported bug: Undo must reverse the
    // specific event it's told to, never "whatever else happens to be
    // globally last" — even though Seat 5's card was added after Seat 3's.
    const inv = await freshInvestigation();
    const round = inv.rounds[0];
    await occupySeat(inv.localId, 1);
    await occupySeat(inv.localId, 3);
    await occupySeat(inv.localId, 5);

    await seatAdd(inv.localId, round.id, 1, "2"); // Seat 1
    const seat3Card = await seatAdd(inv.localId, round.id, 3, "3"); // Seat 3 — the one we'll undo
    await seatAdd(inv.localId, round.id, 5, "4"); // Seat 5 — globally the most recent card

    const afterUndo = await undoTargetCard(inv.localId, round.id, seat3Card.cardEvent.id, "seat", 3);

    expect(afterUndo.seats[3]!.playerCards).toEqual([]);
    expect(afterUndo.seats[1]!.playerCards.map((c) => c.rank)).toEqual(["2"]); // untouched
    expect(afterUndo.seats[5]!.playerCards.map((c) => c.rank)).toEqual(["4"]); // untouched — this is exactly what a whole-round-snapshot restore would have corrupted

    const events = await getCardEventsForInvestigation(inv.localId);
    expect(events.find((e) => e.id === seat3Card.cardEvent.id)?.status).toBe("undone");
    expect(events.filter((e) => e.status === "active")).toHaveLength(2); // seat 1's and seat 5's events only

    // Counts reverse only for the event actually undone — Seat 1's "2"
    // (+1) and Seat 5's "4" (+1) stay counted; Seat 3's "3" (+1) does not.
    const snapshot = calculateCountSnapshot(events, inv.shoeTotalDecks);
    expect(snapshot["Hi-Lo"].running).toBe(2);
  });
});

describe("cardEvents repository — new shoe / round completion / reload", () => {
  it("New Shoe begins an independent sequence and never deletes the prior shoe's ledger", async () => {
    const inv = await freshInvestigation();
    const round1 = inv.rounds[0];
    await dealerAdd(inv.localId, round1.id, "10");
    await advanceRound(inv.localId, { newShoe: true });

    const afterInvestigation = await getInvestigation(inv.localId);
    const round2 = afterInvestigation!.rounds[afterInvestigation!.rounds.length - 1];
    expect(round2.shoeNumber).toBe(2);

    const allEvents = await getCardEventsForInvestigation(inv.localId);
    const shoe1Events = allEvents.filter((e) => e.shoeNumber === 1);
    const shoe2Events = allEvents.filter((e) => e.shoeNumber === 2);
    expect(shoe1Events).toHaveLength(1); // preserved, untouched
    expect(shoe2Events).toHaveLength(0); // fresh, independent sequence

    const shoe2Snapshot = calculateCountSnapshot(shoe2Events, inv.shoeTotalDecks);
    expect(shoe2Snapshot["Hi-Lo"].running).toBe(0);
  });

  it("Complete Round does not change the count", async () => {
    const inv = await freshInvestigation();
    const round = inv.rounds[0];
    await occupySeat(inv.localId, 1);
    await seatAdd(inv.localId, round.id, 1, "5");
    const before = calculateCountSnapshot(await getCardEventsForInvestigation(inv.localId), inv.shoeTotalDecks);

    await completeRound(inv.localId, round.id);

    const after = calculateCountSnapshot(await getCardEventsForInvestigation(inv.localId), inv.shoeTotalDecks);
    expect(after["Hi-Lo"].running).toBe(before["Hi-Lo"].running);
  });

  it("Page reload / reconstruction (a fresh read from storage) produces the identical count", async () => {
    const inv = await freshInvestigation();
    const round = inv.rounds[0];
    await occupySeat(inv.localId, 1);
    await dealerAdd(inv.localId, round.id, "10");
    await seatAdd(inv.localId, round.id, 1, "5");

    const first = calculateCountSnapshot(await getCardEventsForInvestigation(inv.localId), inv.shoeTotalDecks);
    // Simulate "reload": brand-new queries against the same underlying storage, nothing cached.
    const second = calculateCountSnapshot(await getCardEventsForInvestigation(inv.localId), inv.shoeTotalDecks);
    expect(second).toEqual(first);
  });

  it("Close and reopen the investigation: counts remain unchanged", async () => {
    const inv = await freshInvestigation();
    const round = inv.rounds[0];
    await dealerAdd(inv.localId, round.id, "9");
    const before = calculateCountSnapshot(await getCardEventsForInvestigation(inv.localId), inv.shoeTotalDecks);

    await completeInvestigation(inv.localId); // "Close"
    const reopened = await getInvestigation(inv.localId); // "Reopen" — load it again
    const after = calculateCountSnapshot(await getCardEventsForInvestigation(reopened!.localId), inv.shoeTotalDecks);

    expect(after).toEqual(before);
  });
});

describe("cardEvents repository — legacy migration end-to-end", () => {
  it("backfills a ledger for an investigation written directly to Dexie before the ledger existed, then never runs again", async () => {
    const localId = uuidv4();
    const legacyInvestigation = {
      localId,
      displayId: "BJ-LEGACY-00001",
      status: "active",
      isDemo: false,
      casino: "", tableNumber: "", dealerName: "", investigationDate: "2026-01-01", operatorName: "",
      occupiedSeats: [],
      playerGroups: {},
      seatPlayerGroups: {},
      activeTarget: "dealer",
      countingSystem: "Hi-Lo",
      shoeTotalDecks: 6,
      gameType: "blackjack",
      blackjackFormat: "shoe",
      ruleProfile: { id: "standard", label: "Standard", blackjackPayout: "3:2", dealerHitsSoft17: false, customNotes: "" },
      entryDirection: "ltr",
      entryMode: "guided",
      playerSpotCount: 7,
      practiceMode: false,
      pitArea: "",
      investigationLabel: "",
      rounds: [
        {
          id: "legacy-round-1",
          roundNumber: 1,
          shoeNumber: 1,
          startTime: "2026-01-01T00:00:00.000Z",
          videoTimestamp: null,
          dealerHand: { cards: [{ rank: "10", suit: "unspecified" }] },
          seats: {},
          splitHands: {},
          runningCount: null,
          trueCount: null,
          operatorNote: "",
          eventLog: [{ id: "e1", timestamp: "2026-01-01T00:00:00.000Z", type: "card", message: "Dealer: 10" }],
          completed: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      executiveSummary: "", surveillanceMemo: "", operatorNotes: [], correlationScores: {},
      pausedDurationMs: 0, pausedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      deviceId: "device-1", syncStatus: "local-only", deletedAt: null, schemaVersion: 2,
    };

    await getDb().investigations.add(legacyInvestigation as unknown as Investigation);

    const fresh = (await getInvestigation(localId))!;
    const ambiguities = await ensureLegacyLedger(fresh);
    expect(ambiguities).toEqual([]); // dealer cards are always structured — nothing ambiguous here

    const events = await getCardEventsForInvestigation(localId);
    expect(events).toHaveLength(1);
    expect(calculateCountSnapshot(events, 6)["Hi-Lo"].running).toBe(-1);

    // Calling it again must never duplicate — the "zero rows" gate is now closed.
    await ensureLegacyLedger(fresh);
    const eventsAfterSecondCall = await getCardEventsForInvestigation(localId);
    expect(eventsAfterSecondCall).toHaveLength(1);
  });
});

describe("mandatory acceptance sequence (run through the real repository/ledger, single deck so KO's IRC is 0)", () => {
  let investigationId: string;
  let roundId: string;

  beforeEach(async () => {
    const inv = await freshInvestigation(1); // single deck -> KO's initialRunningCount is 0
    investigationId = inv.localId;
    roundId = inv.rounds[0].id;
    await occupySeat(investigationId, 1);
  });

  function expectAll(snapshot: ReturnType<typeof calculateCountSnapshot>, values: { hiLo: number; ko: number; zen: number; omegaII: number }) {
    expect(snapshot["Hi-Lo"].running).toBe(values.hiLo);
    expect(snapshot.KO.running).toBe(values.ko);
    expect(snapshot.Zen.running).toBe(values.zen);
    expect(snapshot["Omega II"].running).toBe(values.omegaII);
  }

  it("runs the exact mandatory sequence end to end", async () => {
    const snapshotNow = async () => calculateCountSnapshot(await getCardEventsForInvestigation(investigationId), 1);

    const dealer10 = await dealerAdd(investigationId, roundId, "10");
    expectAll(await snapshotNow(), { hiLo: -1, ko: -1, zen: -2, omegaII: -2 });

    const player2 = await seatAdd(investigationId, dealer10.round.id, 1, "2");
    expectAll(await snapshotNow(), { hiLo: 0, ko: 0, zen: -1, omegaII: -1 });

    const player5 = await seatAdd(investigationId, player2.round.id, 1, "5");
    expectAll(await snapshotNow(), { hiLo: 1, ko: 1, zen: 1, omegaII: 1 });

    const dealerA = await dealerAdd(investigationId, player5.round.id, "A");
    expectAll(await snapshotNow(), { hiLo: 0, ko: 0, zen: 0, omegaII: 1 });

    // Undo Dealer A
    const afterUndoDealerA = await undoTargetCard(investigationId, roundId, dealerA.cardEvent.id, "dealer", "dealer");
    expectAll(await snapshotNow(), { hiLo: 1, ko: 1, zen: 1, omegaII: 1 });

    // Undo Player 5 (seat 1)
    await undoTargetCard(investigationId, roundId, player5.cardEvent.id, "seat", 1);
    expectAll(await snapshotNow(), { hiLo: 0, ko: 0, zen: -1, omegaII: -1 });

    // Redo Player 5
    await redoTargetCard(investigationId, roundId, player5.cardEvent.id, "seat", 1, "5");
    expectAll(await snapshotNow(), { hiLo: 1, ko: 1, zen: 1, omegaII: 1 });

    // Mark the player seat empty — all counts must remain unchanged.
    await markSeatEmpty(investigationId, 1);
    expectAll(await snapshotNow(), { hiLo: 1, ko: 1, zen: 1, omegaII: 1 });

    // Refresh the application — a fresh read from storage, unchanged.
    const refreshed = await snapshotNow();
    expectAll(refreshed, { hiLo: 1, ko: 1, zen: 1, omegaII: 1 });

    // Close and reopen the investigation — unchanged.
    await completeInvestigation(investigationId);
    await getInvestigation(investigationId);
    expectAll(await snapshotNow(), { hiLo: 1, ko: 1, zen: 1, omegaII: 1 });

    void afterUndoDealerA;
  });
});

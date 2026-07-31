import { describe, expect, it } from "vitest";
import { calculateCountSnapshot } from "./calculateCounts";
import { hasLegacyCardActivity, recoverLegacyLedger } from "./migration";
import type { Investigation, Round, SeatRoundRecord } from "@/types/investigation";

function emptySeat(seatNumber: number): SeatRoundRecord {
  return {
    seatNumber,
    startingWagerAmount: null,
    betAmount: null,
    wagerChange: { direction: "first", amount: null, overridden: false },
    insuranceAmount: null,
    doubled: false,
    doubledAtCardCount: null,
    playerCards: [],
    actions: [],
    outcome: null,
    deviationNote: "",
    observationNote: "",
  };
}

function investigationWith(rounds: Round[]): Investigation {
  return {
    localId: "inv-1",
    displayId: "BJ-20260729-00002",
    status: "active",
    isDemo: false,
    casino: "",
    tableNumber: "",
    dealerName: "",
    investigationDate: "2026-07-29",
    operatorName: "",
    occupiedSeats: [2],
    playerGroups: {},
    seatPlayerGroups: {},
    activeTarget: 2,
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
    rounds,
    executiveSummary: "",
    surveillanceMemo: "",
    operatorNotes: [],
    correlationScores: {},
    pausedDurationMs: 0,
    pausedAt: null,
    createdAt: "2026-07-29T05:29:46.929Z",
    updatedAt: "2026-07-31T02:11:57.673Z",
    deviceId: "device-1",
    syncStatus: "local-only",
    deletedAt: null,
    schemaVersion: 2,
  };
}

/**
 * Reduced regression fixture from the uploaded investigation export
 * (BJ-20260729-00002, round 1): dealer A,7,7,9; Seat 6 dealt A,2 then
 * marked empty; Seat 7 dealt 4,9,4,5 then marked empty; Seat 2 occupied
 * afterward with no cards yet. Seats 6/7's structured playerCards are gone
 * (markSeatEmpty clears them), but every card is still described in the
 * round's eventLog — exactly the legacy-recovery scenario.
 */
function legacyRoundFixture(): Round {
  return {
    id: "round-1",
    roundNumber: 1,
    shoeNumber: 1,
    startTime: "2026-07-29T05:29:46.932Z",
    videoTimestamp: null,
    dealerHand: { cards: [{ rank: "A", suit: "unspecified" }, { rank: "7", suit: "unspecified" }, { rank: "7", suit: "unspecified" }, { rank: "9", suit: "unspecified" }] },
    seats: { 2: emptySeat(2) },
    splitHands: {},
    runningCount: null,
    trueCount: null,
    operatorNote: "",
    eventLog: [
      { id: "e1", timestamp: "2026-07-29T05:29:46.929Z", type: "round-saved", message: "Round 1 started (Shoe 1)" },
      { id: "e2", timestamp: "2026-07-29T05:30:12.228Z", type: "seat-select", message: "Seat 7 occupied — P1" },
      { id: "e3", timestamp: "2026-07-29T05:31:07.252Z", type: "seat-select", message: "Seat 6 occupied — P2" },
      { id: "e4", timestamp: "2026-07-29T05:31:09.617Z", type: "card", message: "Seat 6: A" },
      { id: "e5", timestamp: "2026-07-29T05:31:09.956Z", type: "card", message: "Seat 6: 2" },
      { id: "e6", timestamp: "2026-07-29T05:31:12.198Z", type: "card", message: "Dealer: A" },
      { id: "e7", timestamp: "2026-07-29T05:31:15.660Z", type: "card", message: "Dealer: 7" },
      { id: "e8", timestamp: "2026-07-29T05:31:15.884Z", type: "card", message: "Dealer: 7" },
      { id: "e9", timestamp: "2026-07-29T05:31:19.468Z", type: "card", message: "Dealer: 9" },
      { id: "e10", timestamp: "2026-07-29T05:31:21.679Z", type: "card", message: "Seat 7: 4" },
      { id: "e11", timestamp: "2026-07-29T05:31:22.029Z", type: "card", message: "Seat 7: 9" },
      { id: "e12", timestamp: "2026-07-29T05:31:23.404Z", type: "card", message: "Seat 7: 4" },
      { id: "e13", timestamp: "2026-07-29T05:31:25.012Z", type: "card", message: "Seat 7: 5" },
      { id: "e14", timestamp: "2026-07-31T02:11:51.110Z", type: "seat-select", message: "Seat 6 marked empty" },
      { id: "e15", timestamp: "2026-07-31T02:11:53.285Z", type: "seat-select", message: "Seat 7 marked empty" },
      { id: "e16", timestamp: "2026-07-31T02:11:57.667Z", type: "seat-select", message: "Seat 2 occupied — P3" },
    ],
    completed: false,
    createdAt: "2026-07-29T05:29:46.932Z",
    updatedAt: "2026-07-31T02:11:57.667Z",
  };
}

describe("legacy recovery — regression fixture from the uploaded investigation export", () => {
  it("hasLegacyCardActivity is true", () => {
    expect(hasLegacyCardActivity(investigationWith([legacyRoundFixture()]))).toBe(true);
  });

  it("recovers exactly one CardEvent per historical card (dealer 4 + seat 6's 2 + seat 7's 4 = 10), never fewer, never doubled", () => {
    const { events } = recoverLegacyLedger(investigationWith([legacyRoundFixture()]));
    expect(events).toHaveLength(10);
  });

  it("flags Seat 6 and Seat 7 as ambiguous (event-log recovered), and nothing else", () => {
    const { ambiguities } = recoverLegacyLedger(investigationWith([legacyRoundFixture()]));
    const flaggedSeats = ambiguities.map((a) => a.targetId).sort();
    expect(flaggedSeats).toEqual([6, 7]);
    expect(ambiguities.every((a) => a.targetType === "seat")).toBe(true);
  });

  it("the recovered ledger's Hi-Lo running count matches the true historical value (+2), not null", () => {
    const { events } = recoverLegacyLedger(investigationWith([legacyRoundFixture()]));
    const snapshot = calculateCountSnapshot(events, 6);
    expect(snapshot["Hi-Lo"].running).toBe(2);
  });

  it("does not double-count Seat 2 (currently occupied, structured, empty — no event-log cards for it either)", () => {
    const { events, ambiguities } = recoverLegacyLedger(investigationWith([legacyRoundFixture()]));
    expect(events.some((e) => e.targetId === 2)).toBe(false);
    expect(ambiguities.some((a) => a.targetId === 2)).toBe(false);
  });

  it("prefers structured data and never re-derives from the event log when a seat's structured hand is present and non-empty", () => {
    const round = legacyRoundFixture();
    // Simulate a seat that's still occupied AND still has its structured cards.
    round.seats[2] = { ...emptySeat(2), playerCards: [{ rank: "K", suit: "unspecified" }] };
    round.eventLog.push({ id: "e17", timestamp: "2026-07-31T02:12:00.000Z", type: "card", message: "Seat 2: K" });
    const { events } = recoverLegacyLedger(investigationWith([round]));
    // Exactly one event for seat 2 (from structured data), not two (which
    // would happen if the event log were also parsed for a present seat).
    expect(events.filter((e) => e.targetId === 2)).toHaveLength(1);
  });
});

describe("hasLegacyCardActivity — the gate for whether recovery has anything to do", () => {
  it("is false for a brand-new investigation with an empty first round", () => {
    const round: Round = {
      id: "r",
      roundNumber: 1,
      shoeNumber: 1,
      startTime: "2026-01-01T00:00:00.000Z",
      videoTimestamp: null,
      dealerHand: { cards: [] },
      seats: {},
      splitHands: {},
      runningCount: null,
      trueCount: null,
      operatorNote: "",
      eventLog: [{ id: "e", timestamp: "2026-01-01T00:00:00.000Z", type: "round-saved", message: "Round 1 started (Shoe 1)" }],
      completed: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(hasLegacyCardActivity(investigationWith([round]))).toBe(false);
  });
});

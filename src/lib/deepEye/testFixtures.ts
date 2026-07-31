// Shared fixtures for Deep Eye diagnostic tests — not itself a test file
// (vitest only picks up *.test.ts), just the Investigation/Round/CardEvent
// builders every diagnostic test in this directory needs.
import type { CardEvent, CardEventStatus, CardEventTargetType, Rank } from "@/lib/counting-engine/types";
import type { Investigation, Round, SeatRoundRecord } from "@/types/investigation";

let seq = 0;

export function resetEventSequence(): void {
  seq = 0;
}

export function fixtureEvent(rank: Rank, overrides: Partial<CardEvent> = {}): CardEvent {
  seq += 1;
  return {
    id: overrides.id ?? `evt-${seq}`,
    investigationId: overrides.investigationId ?? "inv-1",
    shoeNumber: overrides.shoeNumber ?? 1,
    roundId: overrides.roundId ?? "round-1",
    sequence: overrides.sequence ?? seq,
    targetType: overrides.targetType ?? ("dealer" as CardEventTargetType),
    targetId: overrides.targetId ?? "dealer",
    rank,
    status: overrides.status ?? ("active" as CardEventStatus),
    createdAt: overrides.createdAt ?? new Date(2026, 0, 1, 0, 0, seq).toISOString(),
    source: overrides.source,
  };
}

export function fixtureEmptySeat(seatNumber: number): SeatRoundRecord {
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

export function fixtureRound(overrides: Partial<Round> = {}): Round {
  return {
    id: overrides.id ?? "round-1",
    roundNumber: overrides.roundNumber ?? 1,
    shoeNumber: overrides.shoeNumber ?? 1,
    startTime: "2026-07-29T05:29:46.932Z",
    videoTimestamp: null,
    dealerHand: overrides.dealerHand ?? { cards: [] },
    seats: overrides.seats ?? {},
    splitHands: overrides.splitHands ?? {},
    runningCount: null,
    trueCount: null,
    operatorNote: "",
    eventLog: overrides.eventLog ?? [],
    completed: overrides.completed ?? false,
    createdAt: overrides.createdAt ?? "2026-07-29T05:29:46.929Z",
    updatedAt: overrides.updatedAt ?? "2026-07-29T05:29:46.929Z",
  };
}

export function fixtureInvestigation(overrides: Partial<Investigation> = {}): Investigation {
  return {
    localId: overrides.localId ?? "inv-1",
    displayId: overrides.displayId ?? "BJ-20260729-00002",
    status: overrides.status ?? "active",
    isDemo: false,
    casino: overrides.casino ?? "Fixture Casino",
    tableNumber: "12",
    dealerName: overrides.dealerName ?? "Jane Dealer",
    investigationDate: "2026-07-29",
    operatorName: overrides.operatorName ?? "Op Operator",
    occupiedSeats: overrides.occupiedSeats ?? [],
    playerGroups: overrides.playerGroups ?? {},
    seatPlayerGroups: overrides.seatPlayerGroups ?? {},
    activeTarget: "dealer",
    countingSystem: "Hi-Lo",
    shoeTotalDecks: overrides.shoeTotalDecks ?? 6,
    gameType: "blackjack",
    blackjackFormat: "shoe",
    ruleProfile: { id: "standard", label: "Standard", blackjackPayout: "3:2", dealerHitsSoft17: false, customNotes: "" },
    entryDirection: "ltr",
    entryMode: "guided",
    playerSpotCount: 7,
    practiceMode: false,
    pitArea: overrides.pitArea ?? "Pit 3",
    investigationLabel: overrides.investigationLabel ?? "Suspected shuffle tracker",
    rounds: overrides.rounds ?? [],
    executiveSummary: overrides.executiveSummary ?? "Confidential summary text.",
    surveillanceMemo: overrides.surveillanceMemo ?? "Confidential memo text.",
    operatorNotes: overrides.operatorNotes ?? [],
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

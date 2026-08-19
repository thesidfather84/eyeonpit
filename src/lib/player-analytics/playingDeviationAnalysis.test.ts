import { describe, expect, it } from "vitest";
import {
  buildSituationKey,
  computePlayingDeviationSummary,
  evaluateFirstDecisionOpportunity,
  type IndexDeviationTable,
} from "./playingDeviationAnalysis";
import type { PlayerObservation } from "./playerObservation";
import type { CardCode } from "@/types/investigation";

function card(rank: CardCode["rank"]): CardCode {
  return { rank, suit: "unspecified" };
}

function obs(overrides: Partial<PlayerObservation> = {}): PlayerObservation {
  return {
    schemaVersion: 1,
    id: "o1",
    investigationId: "inv-1",
    investigationDisplayId: "BJ-1",
    playerGroupId: null,
    tableIdentifier: "BJ-1",
    spotNumber: 1,
    shoeNumber: 1,
    roundNumber: 1,
    handSequenceNumber: 1,
    timestamp: new Date().toISOString(),
    isSplitHand: false,
    wagerAmount: 10,
    startingWagerAmount: 10,
    wagerChangeDirection: "same",
    wagerChangeAmount: 0,
    runningCountAtWager: 0,
    trueCountAtWager: 0,
    countMethodRef: { id: "builtin-hi-lo", version: 1 },
    playerCards: [card("10"), card("6")],
    dealerUpcard: "10",
    actions: ["hit"],
    outcome: null,
    insuranceOffered: false,
    insuranceTaken: null,
    insuranceAmount: null,
    isFirstHandOfEntry: false,
    isLastHandBeforeExit: false,
    observerNotes: [],
    ...overrides,
  };
}

describe("buildSituationKey", () => {
  it("builds a hard-total key", () => {
    expect(buildSituationKey([card("10"), card("6")], "10")).toBe("16v10");
  });

  it("builds a soft-total key for a 2-card ace hand", () => {
    expect(buildSituationKey([card("A"), card("7")], "9")).toBe("soft-18v9");
  });

  it("builds a pair key", () => {
    expect(buildSituationKey([card("8"), card("8")], "6")).toBe("pair-8v6");
  });
});

describe("evaluateFirstDecisionOpportunity — basic-strategy consistency (real, verified chart)", () => {
  it("flags a deviation when hard 16 vs dealer 10 is hit instead of the chart's surrender", () => {
    const opportunity = evaluateFirstDecisionOpportunity(obs({ playerCards: [card("10"), card("6")], dealerUpcard: "10", actions: ["hit"] }));
    expect(opportunity).not.toBeNull();
    expect(opportunity!.basicStrategyAction).toBe("surrender");
    expect(opportunity!.observedAction).toBe("hit");
    expect(opportunity!.isDeviation).toBe(true);
  });

  it("shows no deviation when the observed action matches the chart", () => {
    // hard 12 vs dealer 6 -> stand is correct per the chart (upcard 4-6 stands)
    const opportunity = evaluateFirstDecisionOpportunity(obs({ playerCards: [card("10"), card("2")], dealerUpcard: "6", actions: ["stand"] }));
    expect(opportunity!.basicStrategyAction).toBe("stand");
    expect(opportunity!.isDeviation).toBe(false);
  });

  it("returns null when there is no recorded first action", () => {
    expect(evaluateFirstDecisionOpportunity(obs({ actions: [] }))).toBeNull();
  });

  it("returns null when there is no dealer upcard recorded", () => {
    expect(evaluateFirstDecisionOpportunity(obs({ dealerUpcard: null }))).toBeNull();
  });

  it("returns null for a non-comparable first action (insurance)", () => {
    expect(evaluateFirstDecisionOpportunity(obs({ actions: ["insurance", "stand"] }))).toBeNull();
  });
});

describe("evaluateFirstDecisionOpportunity — index-deviation consistency (FOUNDATION ONLY without a supplied table)", () => {
  it("indexConsistent stays null with no table supplied, even for a real deviation", () => {
    const opportunity = evaluateFirstDecisionOpportunity(obs({ playerCards: [card("10"), card("6")], dealerUpcard: "10", actions: ["stand"] }));
    expect(opportunity!.indexConsistent).toBeNull();
    expect(opportunity!.indexEntryUsed).toBeNull();
  });

  it("with a real supplied table, correctly evaluates the well-known 16v10 Illustrious-18-style entry", () => {
    const table: IndexDeviationTable = [
      { situationKey: "16v10", deviationAction: "stand", trueCountThreshold: 0, thresholdDirection: "at-or-above", source: "test fixture — Illustrious 18 (widely published)" },
    ];
    const standsAtHighCount = evaluateFirstDecisionOpportunity(
      obs({ playerCards: [card("10"), card("6")], dealerUpcard: "10", actions: ["stand"], trueCountAtWager: 2 }),
      undefined,
      table
    );
    expect(standsAtHighCount!.indexConsistent).toBe(true);

    const hitsAtHighCount = evaluateFirstDecisionOpportunity(
      obs({ playerCards: [card("10"), card("6")], dealerUpcard: "10", actions: ["hit"], trueCountAtWager: 2 }),
      undefined,
      table
    );
    expect(hitsAtHighCount!.indexConsistent).toBe(false);

    // Below the index threshold, basic strategy (surrender) applies instead
    // of the index's "stand" — hitting matches neither, so this is NOT
    // index-consistent either.
    const hitsAtLowCount = evaluateFirstDecisionOpportunity(
      obs({ playerCards: [card("10"), card("6")], dealerUpcard: "10", actions: ["hit"], trueCountAtWager: -3 }),
      undefined,
      table
    );
    expect(hitsAtLowCount!.indexConsistent).toBe(false);

    const surrendersAtLowCount = evaluateFirstDecisionOpportunity(
      obs({ playerCards: [card("10"), card("6")], dealerUpcard: "10", actions: ["surrender"], trueCountAtWager: -3 }),
      undefined,
      table
    );
    expect(surrendersAtLowCount!.indexConsistent).toBe(true);
  });
});

describe("computePlayingDeviationSummary", () => {
  it("aggregates deviation rate across many observations, excludes split hands", () => {
    const observations = [
      obs({ id: "1", playerCards: [card("10"), card("6")], dealerUpcard: "10", actions: ["hit"] }), // deviation (surrender expected)
      obs({ id: "2", playerCards: [card("10"), card("2")], dealerUpcard: "6", actions: ["stand"] }), // correct
      obs({ id: "3", playerCards: [card("8"), card("8")], dealerUpcard: "6", actions: ["stand"], isSplitHand: true }), // excluded
    ];
    const summary = computePlayingDeviationSummary(observations);
    expect(summary.totalOpportunities).toBe(2);
    expect(summary.totalDeviations).toBe(1);
    expect(summary.deviationRate).toBe(0.5);
    expect(summary.indexTableProvided).toBe(false);
    expect(summary.indexConsistentDeviationRate).toBeNull();
  });

  it("returns a valid empty summary (never throws) for zero observations", () => {
    const summary = computePlayingDeviationSummary([]);
    expect(summary.totalOpportunities).toBe(0);
    expect(summary.deviationRate).toBeNull();
  });
});

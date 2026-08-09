import { describe, expect, it } from "vitest";
import {
  appendCardForTarget,
  cardFromRank,
  describeLedgerTarget,
  ledgerTargetFor,
  popLastCardForTarget,
} from "./cardEventTarget";
import type { Round, SeatRoundRecord } from "@/types/investigation";

function baseSeat(overrides: Partial<SeatRoundRecord> = {}): SeatRoundRecord {
  return {
    seatNumber: 1,
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
    ...overrides,
  };
}

function baseRound(overrides: Partial<Round> = {}): Round {
  return {
    id: "round-1",
    roundNumber: 1,
    shoeNumber: 1,
    startTime: new Date().toISOString(),
    videoTimestamp: null,
    dealerHand: { cards: [] },
    seats: {},
    splitHands: {},
    runningCount: null,
    trueCount: null,
    operatorNote: "",
    eventLog: [],
    completed: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("ledgerTargetFor", () => {
  it("maps the dealer target", () => {
    expect(ledgerTargetFor("dealer")).toEqual({ targetType: "dealer", targetId: "dealer" });
  });

  it("maps a positive seat number to a seat target", () => {
    expect(ledgerTargetFor(3)).toEqual({ targetType: "seat", targetId: 3 });
  });

  it("maps a negative seat number to a split target with the positive seat id", () => {
    expect(ledgerTargetFor(-3)).toEqual({ targetType: "split", targetId: 3 });
  });
});

describe("describeLedgerTarget", () => {
  it("labels the dealer", () => {
    expect(describeLedgerTarget("dealer", "dealer")).toBe("Dealer");
  });

  it("labels a seat", () => {
    expect(describeLedgerTarget("seat", 3)).toBe("Seat 3");
  });

  it("labels a split hand distinctly from its primary seat", () => {
    expect(describeLedgerTarget("split", 3)).toBe("Seat 3 (Split)");
  });
});

describe("popLastCardForTarget / appendCardForTarget — inverse operations", () => {
  it("dealer: pop removes the last card; append is its exact inverse", () => {
    const round = baseRound({ dealerHand: { cards: [{ rank: "10", suit: "unspecified" }, { rank: "5", suit: "unspecified" }] } });
    const popped = popLastCardForTarget(round, "dealer", "dealer");
    expect(popped.dealerHand.cards.map((c) => c.rank)).toEqual(["10"]);

    const restored = appendCardForTarget(popped, "dealer", "dealer", cardFromRank("5"));
    expect(restored.dealerHand.cards.map((c) => c.rank)).toEqual(["10", "5"]);
  });

  it("seat: pop/append only ever touch that seat's own playerCards, never a different seat's", () => {
    const round = baseRound({
      seats: {
        1: baseSeat({ seatNumber: 1, playerCards: [{ rank: "2", suit: "unspecified" }] }),
        3: baseSeat({ seatNumber: 3, playerCards: [{ rank: "3", suit: "unspecified" }] }),
        5: baseSeat({ seatNumber: 5, playerCards: [{ rank: "4", suit: "unspecified" }] }),
      },
    });

    const popped = popLastCardForTarget(round, "seat", 3);
    expect(popped.seats[3]!.playerCards).toEqual([]);
    expect(popped.seats[1]!.playerCards.map((c) => c.rank)).toEqual(["2"]); // untouched
    expect(popped.seats[5]!.playerCards.map((c) => c.rank)).toEqual(["4"]); // untouched — the exact bug this exists to prevent

    const restored = appendCardForTarget(popped, "seat", 3, cardFromRank("3"));
    expect(restored.seats[3]!.playerCards.map((c) => c.rank)).toEqual(["3"]);
    expect(restored.seats[1]!.playerCards.map((c) => c.rank)).toEqual(["2"]);
    expect(restored.seats[5]!.playerCards.map((c) => c.rank)).toEqual(["4"]);
  });

  it("split: resolves to the split-hand map, distinct from the seat's primary hand", () => {
    const round = baseRound({
      seats: { 3: baseSeat({ seatNumber: 3, playerCards: [{ rank: "3", suit: "unspecified" }] }) },
      splitHands: { 3: baseSeat({ seatNumber: 3, playerCards: [{ rank: "8", suit: "unspecified" }] }) },
    });

    const popped = popLastCardForTarget(round, "split", 3);
    expect(popped.splitHands[3]!.playerCards).toEqual([]);
    expect(popped.seats[3]!.playerCards.map((c) => c.rank)).toEqual(["3"]); // primary hand untouched
  });

  it("popping a nonexistent seat is a no-op (mirrors updateSeatAtTarget's own guard)", () => {
    const round = baseRound();
    expect(popLastCardForTarget(round, "seat", 9)).toBe(round);
  });
});

import { describe, expect, it } from "vitest";
import { basicStrategyDecision, type BasicStrategyContext } from "./basicStrategy";
import type { CardCode, Rank } from "@/types/investigation";

function card(rank: Rank): CardCode {
  return { rank, suit: "unspecified" };
}

function ctx(playerRanks: Rank[], dealerUpcard: Rank, overrides: Partial<BasicStrategyContext> = {}): BasicStrategyContext {
  return {
    playerCards: playerRanks.map(card),
    dealerUpcard,
    dealerSoft17: "S17",
    doublingRule: "any-two-cards",
    canDouble: true,
    canSplit: true,
    canSurrender: true,
    ...overrides,
  };
}

describe("basicStrategyDecision — standard multi-deck S17 chart, hard totals", () => {
  it("hard 16 vs dealer 10 -> surrender (when allowed)", () => {
    expect(basicStrategyDecision(ctx(["10", "6"], "10"))).toBe("surrender");
  });

  it("hard 16 vs dealer 10 -> hit when surrender is not allowed", () => {
    expect(basicStrategyDecision(ctx(["10", "6"], "10", { canSurrender: false }))).toBe("hit");
  });

  it("hard 16 vs dealer 6 -> stand", () => {
    expect(basicStrategyDecision(ctx(["10", "6"], "6"))).toBe("stand");
  });

  it("hard 12 vs dealer 4 -> stand; vs dealer 2 -> hit", () => {
    expect(basicStrategyDecision(ctx(["10", "2"], "4"))).toBe("stand");
    expect(basicStrategyDecision(ctx(["10", "2"], "2"))).toBe("hit");
  });

  it("hard 11 vs dealer 6 -> double; vs dealer A -> hit", () => {
    expect(basicStrategyDecision(ctx(["6", "5"], "6"))).toBe("double");
    expect(basicStrategyDecision(ctx(["6", "5"], "A"))).toBe("hit");
  });

  it("hard 11 downgrades to hit when doubling isn't currently legal", () => {
    expect(basicStrategyDecision(ctx(["6", "5"], "6", { canDouble: false }))).toBe("hit");
  });

  it("hard 9 vs dealer 3 -> double; vs dealer 2 -> hit", () => {
    expect(basicStrategyDecision(ctx(["5", "4"], "3"))).toBe("double");
    expect(basicStrategyDecision(ctx(["5", "4"], "2"))).toBe("hit");
  });

  it("hard 17+ always stands", () => {
    expect(basicStrategyDecision(ctx(["10", "7"], "A"))).toBe("stand");
  });

  it("hard 8 or less always hits", () => {
    expect(basicStrategyDecision(ctx(["3", "4"], "6"))).toBe("hit");
  });

  it("doubling total is restricted by GameDefinition's doublingRule", () => {
    expect(basicStrategyDecision(ctx(["4", "4"], "5", { doublingRule: "10-11-only", canSplit: false }))).toBe("hit"); // hard 8, always hit anyway
    expect(basicStrategyDecision(ctx(["5", "4"], "3", { doublingRule: "10-11-only" }))).toBe("hit"); // hard 9 would double, but rule forbids it
  });
});

describe("basicStrategyDecision — soft totals", () => {
  it("soft 18 (A,7) vs dealer 9 -> hit; vs dealer 2 -> stand; vs dealer 6 -> double", () => {
    expect(basicStrategyDecision(ctx(["A", "7"], "9"))).toBe("hit");
    expect(basicStrategyDecision(ctx(["A", "7"], "2"))).toBe("stand");
    expect(basicStrategyDecision(ctx(["A", "7"], "6"))).toBe("double");
  });

  it("soft 19/20 always stand", () => {
    expect(basicStrategyDecision(ctx(["A", "8"], "6"))).toBe("stand");
    expect(basicStrategyDecision(ctx(["A", "9"], "6"))).toBe("stand");
  });

  it("soft 13 (A,2) vs dealer 5 -> double; vs dealer 7 -> hit", () => {
    expect(basicStrategyDecision(ctx(["A", "2"], "5"))).toBe("double");
    expect(basicStrategyDecision(ctx(["A", "2"], "7"))).toBe("hit");
  });
});

describe("basicStrategyDecision — pairs", () => {
  it("always splits A,A and 8,8", () => {
    expect(basicStrategyDecision(ctx(["A", "A"], "6"))).toBe("split");
    expect(basicStrategyDecision(ctx(["8", "8"], "A"))).toBe("split");
  });

  it("never splits 10,10 — always stands", () => {
    expect(basicStrategyDecision(ctx(["10", "10"], "6"))).toBe("stand");
    expect(basicStrategyDecision(ctx(["K", "Q"], "6"))).toBe("stand");
  });

  it("5,5 is never split — treated as hard 10 (doubles vs 2-9)", () => {
    expect(basicStrategyDecision(ctx(["5", "5"], "6"))).toBe("double");
    expect(basicStrategyDecision(ctx(["5", "5"], "10"))).toBe("hit");
  });

  it("2,2/3,3 split vs 2-7, hit otherwise", () => {
    expect(basicStrategyDecision(ctx(["2", "2"], "7"))).toBe("split");
    expect(basicStrategyDecision(ctx(["2", "2"], "8"))).toBe("hit");
  });

  it("does not offer split when canSplit is false — falls through to the hard/soft total decision", () => {
    // 8,8 = hard 16 vs dealer 6 -> stand (per hard-total rule) when split unavailable
    expect(basicStrategyDecision(ctx(["8", "8"], "6", { canSplit: false }))).toBe("stand");
  });
});

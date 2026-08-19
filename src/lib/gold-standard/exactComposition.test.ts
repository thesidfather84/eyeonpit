import { describe, expect, it } from "vitest";
import { createCardEvent } from "@/lib/counting-engine/ledger";
import type { CardEvent, Rank } from "@/lib/counting-engine/types";
import { computeExactComposition, freshShoeComposition, totalCardsRemaining, validateCardConservation } from "./exactComposition";

function buildEvents(ranks: Rank[], shoeNumber = 1): CardEvent[] {
  const events: CardEvent[] = [];
  for (const rank of ranks) {
    events.push(createCardEvent({ investigationId: "inv-1", shoeNumber, roundId: "r1", targetType: "dealer", targetId: "dealer", rank }, events));
  }
  return events;
}

describe("freshShoeComposition", () => {
  it("gives 4 of each rank per deck", () => {
    const composition = freshShoeComposition(6);
    expect(composition.A).toBe(24);
    expect(composition.K).toBe(24);
    expect(totalCardsRemaining(composition)).toBe(6 * 52);
  });
});

describe("computeExactComposition", () => {
  it("removes exactly the active cards dealt this shoe", () => {
    const events = buildEvents(["A", "A", "K", "5"]);
    const composition = computeExactComposition(events, 1, 6);
    expect(composition.A).toBe(24 - 2);
    expect(composition.K).toBe(24 - 1);
    expect(composition["5"]).toBe(24 - 1);
    expect(totalCardsRemaining(composition)).toBe(6 * 52 - 4);
  });

  it("ignores cards from a different shoe", () => {
    const shoe1 = buildEvents(["A"], 1);
    const shoe2 = buildEvents(["K"], 2);
    const composition = computeExactComposition([...shoe1, ...shoe2], 1, 6);
    expect(composition.A).toBe(23);
    expect(composition.K).toBe(24);
  });

  it("never goes negative even if given more of a rank than physically possible (defensive floor)", () => {
    const manyAces = buildEvents(Array(30).fill("A") as Rank[]);
    const composition = computeExactComposition(manyAces, 1, 1); // single deck only has 4 aces
    expect(composition.A).toBe(0);
  });

  it("undone cards are excluded — matches the same activeEventsInOrder semantics the trusted ledger uses", () => {
    const events = buildEvents(["A", "K"]);
    const undone = events.map((e, i) => (i === 0 ? { ...e, status: "undone" as const } : e));
    const composition = computeExactComposition(undone, 1, 6);
    expect(composition.A).toBe(24); // the undone ace is NOT removed
    expect(composition.K).toBe(23);
  });
});

describe("validateCardConservation", () => {
  it("passes for a valid fresh shoe", () => {
    expect(validateCardConservation(freshShoeComposition(6), 6)).toEqual([]);
  });

  it("flags a rank exceeding the fresh-shoe maximum", () => {
    const composition = freshShoeComposition(1);
    composition.A = 5; // single deck only has 4 aces
    expect(validateCardConservation(composition, 1).length).toBeGreaterThan(0);
  });

  it("flags a negative remaining count", () => {
    const composition = freshShoeComposition(1);
    composition.K = -1;
    expect(validateCardConservation(composition, 1).length).toBeGreaterThan(0);
  });
});

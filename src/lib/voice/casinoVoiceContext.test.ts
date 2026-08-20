// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildHotwordList } from "./casinoVoiceContext";

describe("buildHotwordList", () => {
  it("produces a non-empty, weighted list with no context at all (defaults apply)", () => {
    const entries = buildHotwordList();
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.weight >= 1 && e.weight <= 10)).toBe(true);
  });

  it('never blindly biases every word equally — weights differ across the vocabulary', () => {
    const entries = buildHotwordList();
    const weights = new Set(entries.map((e) => e.weight));
    expect(weights.size).toBeGreaterThan(1);
  });

  it('defaults to "spot" preferred over "seat" when no terminology is specified', () => {
    const entries = buildHotwordList();
    const spot = entries.find((e) => e.phrase === "spot")!;
    const seat = entries.find((e) => e.phrase === "seat")!;
    expect(spot.weight).toBeGreaterThan(seat.weight);
  });

  it('flips the preference when terminology is explicitly "seat"', () => {
    const entries = buildHotwordList({ terminology: "seat" });
    const spot = entries.find((e) => e.phrase === "spot")!;
    const seat = entries.find((e) => e.phrase === "seat")!;
    expect(seat.weight).toBeGreaterThan(spot.weight);
  });

  it("boosts the active Spot's own number word above its base weight", () => {
    const withoutActive = buildHotwordList();
    const withActive = buildHotwordList({ activeTarget: { kind: "seat", seat: 5 } });
    const baseFive = withoutActive.find((e) => e.phrase === "five")!;
    const boostedFive = withActive.find((e) => e.phrase === "five")!;
    expect(boostedFive.weight).toBeGreaterThan(baseFive.weight);
  });

  it("dealer as active target does not boost any position-number word", () => {
    const withoutActive = buildHotwordList();
    const withDealerActive = buildHotwordList({ activeTarget: { kind: "dealer" } });
    // Every rank/position weight must be unchanged.
    for (const entry of withoutActive) {
      const same = withDealerActive.find((e) => e.phrase === entry.phrase);
      expect(same?.weight).toBe(entry.weight);
    }
  });

  it("includes real casino/blackjack vocabulary from the spec: targets, ranks, actions, workflow", () => {
    const phrases = buildHotwordList().map((e) => e.phrase);
    for (const expected of [
      "dealer",
      "player",
      "spot",
      "seat",
      "hit",
      "hits",
      "stand",
      "stands",
      "split",
      "splits",
      "double",
      "doubles",
      "surrender",
      "insurance",
      "done",
      "next hand",
      "ace",
      "king",
      "queen",
      "jack",
      "ten",
      "nine",
      "eight",
      "seven",
      "six",
      "five",
      "four",
      "three",
      "two",
    ]) {
      expect(phrases).toContain(expected);
    }
  });

  it("is a pure function — the same context always produces an identical list", () => {
    const context = { terminology: "seat" as const, activeTarget: { kind: "seat" as const, seat: 3 as const } };
    expect(buildHotwordList(context)).toEqual(buildHotwordList(context));
  });

  it("accepts (but does not yet act on) reserved future-context fields without throwing", () => {
    expect(() =>
      buildHotwordList({
        gameFamily: "blackjack",
        splitState: { hasActiveSplit: true },
        legalNextActions: ["hit", "stand"],
        locale: "es",
      })
    ).not.toThrow();
  });
});

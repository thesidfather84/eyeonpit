import { describe, expect, it } from "vitest";
import { activeEventsInOrder, calculateCountSnapshot } from "./calculateCounts";
import type { CardEvent, CardEventStatus, CardEventTargetType, Rank } from "./types";

let seq = 0;
function event(
  rank: Rank,
  overrides: Partial<CardEvent> = {}
): CardEvent {
  seq += 1;
  return {
    id: overrides.id ?? `evt-${seq}`,
    investigationId: "inv-1",
    shoeNumber: 1,
    roundId: "round-1",
    sequence: overrides.sequence ?? seq,
    targetType: overrides.targetType ?? ("dealer" as CardEventTargetType),
    targetId: overrides.targetId ?? "dealer",
    rank,
    status: overrides.status ?? ("active" as CardEventStatus),
    createdAt: overrides.createdAt ?? new Date(2026, 0, 1, 0, 0, seq).toISOString(),
  };
}

describe("activeEventsInOrder", () => {
  it("dedupes by id (last write wins), keeps only active, sorted by sequence", () => {
    const events: CardEvent[] = [
      event("5", { id: "a", sequence: 2 }),
      event("2", { id: "b", sequence: 1 }),
      event("K", { id: "a", sequence: 2, status: "undone" }), // same id as "a" but later status
      event("A", { id: "c", sequence: 3, status: "undone" }),
    ];
    const ordered = activeEventsInOrder(events);
    expect(ordered.map((e) => e.id)).toEqual(["b"]); // "a" ended up undone, "c" is undone
    expect(ordered[0].rank).toBe("2");
  });

  it("writing the same event id twice produces exactly one counted event (idempotency)", () => {
    const events: CardEvent[] = [event("5", { id: "same" }), event("5", { id: "same" })];
    expect(activeEventsInOrder(events)).toHaveLength(1);
  });

  it("two separate events for the identical rank are each counted", () => {
    const events: CardEvent[] = [event("5", { id: "x" }), event("5", { id: "y" })];
    expect(activeEventsInOrder(events)).toHaveLength(2);
  });
});

describe("calculateCountSnapshot — the one authoritative calculation", () => {
  it("returns explicit numeric zero for an empty ledger, never null/undefined/NaN", () => {
    const snapshot = calculateCountSnapshot([], 6);
    for (const system of ["Hi-Lo", "Zen", "Omega II"] as const) {
      expect(snapshot[system].running).toBe(0);
      expect(Number.isNaN(snapshot[system].running)).toBe(false);
    }
    expect(snapshot.KO.running).toBe(-20); // IRC for 6 decks
    expect(snapshot.exposedCardCount).toBe(0);
  });

  it("applies every active card to all four systems from the same single ordered pass", () => {
    const events = [event("10"), event("5"), event("A")];
    const snapshot = calculateCountSnapshot(events, 6);
    // Hi-Lo: -1 + 1 + -1 = -1
    expect(snapshot["Hi-Lo"].running).toBe(-1);
    // Zen: -2 + 2 + -1 = -1
    expect(snapshot.Zen.running).toBe(-1);
    // Omega II: -2 + 2 + 0 = 0
    expect(snapshot["Omega II"].running).toBe(0);
    // KO: IRC(-20) + -1 + 1 + -1 = -21
    expect(snapshot.KO.running).toBe(-21);
    expect(snapshot.exposedCardCount).toBe(3);
  });

  it("dealer, seat, and split targets all contribute to the same count", () => {
    const events = [
      event("10", { targetType: "dealer", targetId: "dealer" }),
      event("5", { targetType: "seat", targetId: 3 }),
      event("2", { targetType: "split", targetId: 3 }),
    ];
    const snapshot = calculateCountSnapshot(events, 6);
    expect(snapshot["Hi-Lo"].running).toBe(-1 + 1 + 1); // -1 + 1 + 1 = 1
  });

  it("a double-down's extra card is just another active event and counts normally", () => {
    const withoutDouble = calculateCountSnapshot([event("5", { targetType: "seat", targetId: 1 })], 6);
    const withDouble = calculateCountSnapshot(
      [event("5", { targetType: "seat", targetId: 1 }), event("6", { targetType: "seat", targetId: 1, sequence: 2 })],
      6
    );
    expect(withDouble["Hi-Lo"].running).toBe(withoutDouble["Hi-Lo"].running + 1);
  });

  it("undone events (undo) are excluded entirely", () => {
    const events = [event("10"), event("5", { status: "undone" })];
    const snapshot = calculateCountSnapshot(events, 6);
    expect(snapshot["Hi-Lo"].running).toBe(-1); // only the "10"
    expect(snapshot.exposedCardCount).toBe(1);
  });

  it("void events are excluded entirely, same as undone", () => {
    const events = [event("10"), event("5", { status: "void" })];
    const snapshot = calculateCountSnapshot(events, 6);
    expect(snapshot["Hi-Lo"].running).toBe(-1);
  });

  it("never returns null/undefined/NaN for any running count, only trueCount may be null (KO)", () => {
    const snapshot = calculateCountSnapshot([event("9")], 6);
    for (const system of ["Hi-Lo", "KO", "Zen", "Omega II"] as const) {
      expect(snapshot[system].running).not.toBeNull();
      expect(snapshot[system].running).not.toBeUndefined();
      expect(Number.isNaN(snapshot[system].running)).toBe(false);
    }
    expect(snapshot.KO.trueCount).toBeNull();
    expect(snapshot["Hi-Lo"].trueCount).not.toBeNull();
  });
});

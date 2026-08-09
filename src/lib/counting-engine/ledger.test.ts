import { describe, expect, it } from "vitest";
import {
  createCardEvent,
  eventsInShoe,
  eventsThroughRound,
  mostRecentActiveEvent,
  mostRecentActiveEventForTarget,
  nextSequence,
  withEventStatus,
} from "./ledger";
import type { CardEvent } from "./types";

function baseEvent(overrides: Partial<CardEvent>): CardEvent {
  return {
    id: "id",
    investigationId: "inv-1",
    shoeNumber: 1,
    roundId: "round-1",
    sequence: 1,
    targetType: "dealer",
    targetId: "dealer",
    rank: "5",
    status: "active",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("nextSequence", () => {
  it("starts at 1 for a shoe with zero events", () => {
    expect(nextSequence([], 1)).toBe(1);
  });

  it("increments from the highest existing sequence within that shoe only", () => {
    const events = [baseEvent({ sequence: 1, shoeNumber: 1 }), baseEvent({ sequence: 2, shoeNumber: 1 })];
    expect(nextSequence(events, 1)).toBe(3);
  });

  it("a new shoe begins an independent sequence — never continues the previous shoe's numbering", () => {
    const events = [
      baseEvent({ sequence: 1, shoeNumber: 1 }),
      baseEvent({ sequence: 2, shoeNumber: 1 }),
      baseEvent({ sequence: 5, shoeNumber: 1 }),
    ];
    expect(nextSequence(events, 2)).toBe(1);
  });
});

describe("createCardEvent", () => {
  it("builds an active event with a fresh, unique id and the next sequence", () => {
    const existing = [baseEvent({ sequence: 1, shoeNumber: 1 })];
    const created = createCardEvent(
      { investigationId: "inv-1", shoeNumber: 1, roundId: "round-2", targetType: "seat", targetId: 4, rank: "A" },
      existing
    );
    expect(created.sequence).toBe(2);
    expect(created.status).toBe("active");
    expect(created.rank).toBe("A");
    expect(created.targetType).toBe("seat");
    expect(created.targetId).toBe(4);
    expect(typeof created.id).toBe("string");
    expect(created.id.length).toBeGreaterThan(0);
  });

  it("two calls produce two different ids — a genuinely separate entry always gets a new id", () => {
    const a = createCardEvent(
      { investigationId: "inv-1", shoeNumber: 1, roundId: "r", targetType: "dealer", targetId: "dealer", rank: "5" },
      []
    );
    const b = createCardEvent(
      { investigationId: "inv-1", shoeNumber: 1, roundId: "r", targetType: "dealer", targetId: "dealer", rank: "5" },
      [a]
    );
    expect(a.id).not.toBe(b.id);
    expect(b.sequence).toBe(2);
  });
});

describe("withEventStatus — pure undo/redo transitions", () => {
  it("undo flips exactly one event to undone, never deleting the row", () => {
    const events = [baseEvent({ id: "a", sequence: 1 }), baseEvent({ id: "b", sequence: 2 })];
    const afterUndo = withEventStatus(events, "b", "undone");
    expect(afterUndo).toHaveLength(2);
    expect(afterUndo.find((e) => e.id === "b")?.status).toBe("undone");
    expect(afterUndo.find((e) => e.id === "a")?.status).toBe("active");
  });

  it("redo restores the specific undone event back to active", () => {
    const events = [baseEvent({ id: "a", status: "undone" })];
    const afterRedo = withEventStatus(events, "a", "active");
    expect(afterRedo[0].status).toBe("active");
  });
});

describe("mostRecentActiveEvent", () => {
  it("returns the highest-sequence active event in a shoe", () => {
    const events = [
      baseEvent({ id: "a", sequence: 1, shoeNumber: 1 }),
      baseEvent({ id: "b", sequence: 2, shoeNumber: 1 }),
      baseEvent({ id: "c", sequence: 3, shoeNumber: 1, status: "undone" }),
    ];
    expect(mostRecentActiveEvent(events, 1)?.id).toBe("b");
  });

  it("returns undefined when a shoe has no active events", () => {
    expect(mostRecentActiveEvent([baseEvent({ status: "undone" })], 1)).toBeUndefined();
  });
});

describe("mostRecentActiveEventForTarget — context-aware Undo's lookup", () => {
  it("returns the highest-sequence active event for that exact target, ignoring a later event for a different target", () => {
    const events = [
      baseEvent({ id: "seat1-a", sequence: 1, targetType: "seat", targetId: 1 }),
      baseEvent({ id: "seat3-a", sequence: 2, targetType: "seat", targetId: 3 }),
      baseEvent({ id: "seat5-a", sequence: 3, targetType: "seat", targetId: 5 }), // globally last, but a different seat
    ];
    expect(mostRecentActiveEventForTarget(events, 1, "seat", 3)?.id).toBe("seat3-a");
  });

  it("distinguishes seat vs. split for the same seat number", () => {
    const events = [
      baseEvent({ id: "seat3-primary", sequence: 1, targetType: "seat", targetId: 3 }),
      baseEvent({ id: "seat3-split", sequence: 2, targetType: "split", targetId: 3 }),
    ];
    expect(mostRecentActiveEventForTarget(events, 1, "seat", 3)?.id).toBe("seat3-primary");
    expect(mostRecentActiveEventForTarget(events, 1, "split", 3)?.id).toBe("seat3-split");
  });

  it("ignores an undone event for the target and returns undefined if that was its only card", () => {
    const events = [baseEvent({ id: "dealer-a", sequence: 1, status: "undone", targetType: "dealer", targetId: "dealer" })];
    expect(mostRecentActiveEventForTarget(events, 1, "dealer", "dealer")).toBeUndefined();
  });

  it("returns undefined when the target has no events at all", () => {
    const events = [baseEvent({ sequence: 1, targetType: "seat", targetId: 1 })];
    expect(mostRecentActiveEventForTarget(events, 1, "seat", 7)).toBeUndefined();
  });
});

describe("eventsThroughRound", () => {
  it("scopes to only the given round ids within one shoe", () => {
    const events = [
      baseEvent({ id: "a", roundId: "r1", shoeNumber: 1 }),
      baseEvent({ id: "b", roundId: "r2", shoeNumber: 1 }),
      baseEvent({ id: "c", roundId: "r1", shoeNumber: 2 }),
    ];
    const scoped = eventsThroughRound(events, 1, new Set(["r1"]));
    expect(scoped.map((e) => e.id)).toEqual(["a"]);
  });
});

describe("eventsInShoe", () => {
  it("filters strictly by shoeNumber", () => {
    const events = [baseEvent({ shoeNumber: 1 }), baseEvent({ shoeNumber: 2 })];
    expect(eventsInShoe(events, 2)).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";
import { cardEventSource, CARD_EVENT_SOURCE_LABEL, DEFAULT_CARD_EVENT_SOURCE } from "./eventSource";
import { createCardEvent } from "./ledger";
import type { CardEvent } from "./types";

function baseEvent(overrides: Partial<CardEvent> = {}): CardEvent {
  return {
    id: "evt-1",
    investigationId: "inv-1",
    shoeNumber: 1,
    roundId: "round-1",
    sequence: 1,
    targetType: "dealer",
    targetId: "dealer",
    rank: "5",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("cardEventSource — backward compatibility for the additive `source` field", () => {
  it("an event with no `source` property at all (every event ever written before this field existed) reads as manual", () => {
    const legacy = baseEvent();
    delete (legacy as { source?: unknown }).source;
    expect(cardEventSource(legacy)).toBe("manual");
    expect(cardEventSource(legacy)).toBe(DEFAULT_CARD_EVENT_SOURCE);
  });

  it("an event with source explicitly undefined reads the same as one missing the property", () => {
    expect(cardEventSource(baseEvent({ source: undefined }))).toBe("manual");
  });

  it("a real recorded source is read back unchanged", () => {
    expect(cardEventSource(baseEvent({ source: "voice" }))).toBe("voice");
    expect(cardEventSource(baseEvent({ source: "ai" }))).toBe("ai");
    expect(cardEventSource(baseEvent({ source: "import" }))).toBe("import");
  });

  it("has a display label for every source value", () => {
    for (const source of ["manual", "voice", "ai", "import"] as const) {
      expect(CARD_EVENT_SOURCE_LABEL[source]).toBeTruthy();
    }
  });
});

describe("createCardEvent — source defaults without any caller change", () => {
  it("every existing call shape (no `source` passed) still produces a manual event", () => {
    const created = createCardEvent(
      { investigationId: "inv-1", shoeNumber: 1, roundId: "round-1", targetType: "dealer", targetId: "dealer", rank: "A" },
      []
    );
    expect(cardEventSource(created)).toBe("manual");
  });

  it("a caller that opts in gets exactly the source it asked for", () => {
    const created = createCardEvent(
      {
        investigationId: "inv-1",
        shoeNumber: 1,
        roundId: "round-1",
        targetType: "dealer",
        targetId: "dealer",
        rank: "A",
        source: "voice",
      },
      []
    );
    expect(cardEventSource(created)).toBe("voice");
  });
});

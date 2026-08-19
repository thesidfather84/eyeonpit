import { describe, expect, it } from "vitest";
import { ACTIVE_INVESTIGATION_FRESHNESS_WINDOW_MS, resolveActiveInvestigationState } from "./investigationLifecycle";
import type { Investigation } from "@/types/investigation";

const NOW = Date.parse("2026-08-19T12:00:00.000Z");

function inv(overrides: Partial<Investigation>): Investigation {
  return {
    localId: "inv-1",
    displayId: "BJ-20260819-00001",
    status: "active",
    isDemo: false,
    casino: "",
    tableNumber: "",
    dealerName: "",
    investigationDate: "2026-08-19",
    operatorName: "",
    occupiedSeats: [],
    playerGroups: {},
    seatPlayerGroups: {},
    activeTarget: "dealer",
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
    rounds: [],
    executiveSummary: "",
    surveillanceMemo: "",
    operatorNotes: [],
    correlationScores: {},
    pausedDurationMs: 0,
    pausedAt: null,
    createdAt: "2026-08-19T10:00:00.000Z",
    updatedAt: "2026-08-19T10:00:00.000Z",
    deviceId: "test-device",
    deletedAt: null,
    syncStatus: "local-only",
    schemaVersion: 2,
    ...overrides,
  } as Investigation;
}

describe("resolveActiveInvestigationState", () => {
  it("returns 'none' for zero candidates — clean READY state", () => {
    expect(resolveActiveInvestigationState([], NOW)).toEqual({ kind: "none" });
  });

  it("returns 'fresh' for a single investigation updated moments ago", () => {
    const recent = inv({ localId: "a", updatedAt: new Date(NOW - 5 * 60 * 1000).toISOString() });
    const result = resolveActiveInvestigationState([recent], NOW);
    expect(result).toEqual({ kind: "fresh", investigation: recent });
  });

  it("returns 'fresh' for a single investigation right at the edge of the freshness window", () => {
    const edge = inv({ localId: "a", updatedAt: new Date(NOW - ACTIVE_INVESTIGATION_FRESHNESS_WINDOW_MS + 1000).toISOString() });
    expect(resolveActiveInvestigationState([edge], NOW).kind).toBe("fresh");
  });

  it("returns 'recoverable' (never silently entered) for a single STALE investigation past the freshness window", () => {
    const stale = inv({ localId: "a", updatedAt: new Date(NOW - ACTIVE_INVESTIGATION_FRESHNESS_WINDOW_MS - 60 * 1000).toISOString() });
    const result = resolveActiveInvestigationState([stale], NOW);
    expect(result.kind).toBe("recoverable");
    if (result.kind === "recoverable") {
      expect(result.investigation).toEqual(stale);
      expect(result.otherCandidateCount).toBe(0);
    }
  });

  it("returns 'recoverable' for a genuinely old (days-old) investigation, never auto-resumed", () => {
    const ancient = inv({ localId: "a", updatedAt: new Date(NOW - 30 * 24 * 60 * 60 * 1000).toISOString() });
    expect(resolveActiveInvestigationState([ancient], NOW).kind).toBe("recoverable");
  });

  it("returns 'recoverable' when MULTIPLE active/paused investigations exist, even if one is fresh — ambiguity, never a silent pick", () => {
    const fresh = inv({ localId: "a", updatedAt: new Date(NOW - 1000).toISOString() });
    const forgotten = inv({ localId: "b", updatedAt: new Date(NOW - 20 * 24 * 60 * 60 * 1000).toISOString() });
    const result = resolveActiveInvestigationState([fresh, forgotten], NOW);
    expect(result.kind).toBe("recoverable");
    if (result.kind === "recoverable") {
      // Names the most-recently-updated one as the one to offer resuming.
      expect(result.investigation.localId).toBe("a");
      expect(result.otherCandidateCount).toBe(1);
    }
  });

  it("never throws and treats a malformed updatedAt as not-fresh", () => {
    const malformed = inv({ localId: "a", updatedAt: "not-a-date" });
    const result = resolveActiveInvestigationState([malformed], NOW);
    expect(result.kind).toBe("recoverable");
  });

  it("defaults `now` to the real current time when omitted", () => {
    const recent = inv({ localId: "a", updatedAt: new Date().toISOString() });
    expect(resolveActiveInvestigationState([recent]).kind).toBe("fresh");
  });
});

// AGENTS.md 1.14a §9/§12 — formatLiveStatusLine is the always-visible,
// at-a-glance Table/Dealer/Active-pack readout for Live and Floor headers.
import { describe, expect, it } from "vitest";
import { formatLiveStatusLine } from "./gameConfig";
import type { Investigation } from "@/types/investigation";

function inv(overrides: Partial<Investigation>): Investigation {
  return {
    localId: "inv-1",
    displayId: "BJ-20260822-00001",
    status: "active",
    isDemo: false,
    casino: "",
    tableNumber: "111",
    dealerName: "",
    investigationDate: "2026-08-22",
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
    createdAt: "2026-08-22T10:00:00.000Z",
    updatedAt: "2026-08-22T10:00:00.000Z",
    deviceId: "test-device",
    deletedAt: null,
    syncStatus: "local-only",
    schemaVersion: 2,
    ...overrides,
  } as Investigation;
}

describe("formatLiveStatusLine", () => {
  it("shows table, dealer, and active shoe size for a shoe game", () => {
    expect(formatLiveStatusLine(inv({ tableNumber: "111", dealerName: "Dealer A", blackjackFormat: "shoe", shoeTotalDecks: 6 }))).toBe(
      "T111 · Dealer A · 6D SHOE"
    );
  });

  it("shows the active pack size for single-deck, never a physical-inventory number", () => {
    expect(formatLiveStatusLine(inv({ blackjackFormat: "single-deck", shoeTotalDecks: 1 }))).toBe("T111 · No Dealer Set · 1D");
  });

  it("shows the active pack size for double-deck", () => {
    expect(formatLiveStatusLine(inv({ blackjackFormat: "double-deck", shoeTotalDecks: 2 }))).toBe("T111 · No Dealer Set · 2D");
  });

  it("falls back to placeholders when table/dealer are unset — never a hidden default value", () => {
    expect(formatLiveStatusLine(inv({ tableNumber: "", dealerName: "" }))).toBe("T— · No Dealer Set · 6D SHOE");
  });

  it("whitespace-only dealer name is treated as unset", () => {
    expect(formatLiveStatusLine(inv({ dealerName: "   " }))).toBe("T111 · No Dealer Set · 6D SHOE");
  });
});

import { describe, expect, it } from "vitest";
import { checkInvestigationHealth } from "./investigationHealth";
import { fixtureEmptySeat, fixtureEvent, fixtureInvestigation, fixtureRound, resetEventSequence } from "./testFixtures";

describe("checkInvestigationHealth", () => {
  it("a clean investigation with no rounds is trivially healthy", () => {
    const investigation = fixtureInvestigation({ rounds: [] });
    const result = checkInvestigationHealth(investigation, []);
    expect(result.ok).toBe(true);
    expect(result.summary.roundCount).toBe(0);
    expect(result.summary.shoeCount).toBe(0);
  });

  it("passes with contiguous shoe/round numbering and no completed rounds", () => {
    const investigation = fixtureInvestigation({
      rounds: [
        fixtureRound({ id: "r1", shoeNumber: 1, roundNumber: 1 }),
        fixtureRound({ id: "r2", shoeNumber: 1, roundNumber: 2 }),
        fixtureRound({ id: "r3", shoeNumber: 2, roundNumber: 1 }),
      ],
    });
    const result = checkInvestigationHealth(investigation, []);
    expect(result.ok).toBe(true);
    expect(result.summary.shoeCount).toBe(2);
    expect(result.summary.roundCount).toBe(3);
  });

  it("flags a gap in round numbering within a shoe", () => {
    const investigation = fixtureInvestigation({
      rounds: [
        fixtureRound({ id: "r1", shoeNumber: 1, roundNumber: 1 }),
        fixtureRound({ id: "r2", shoeNumber: 1, roundNumber: 3 }), // 2 is missing
      ],
    });
    const result = checkInvestigationHealth(investigation, []);
    expect(result.ok).toBe(false);
    const check = result.checks.find((c) => c.id === "round-numbers-contiguous-shoe-1");
    expect(check?.status).toBe("fail");
  });

  it("flags a gap in shoe numbering", () => {
    const investigation = fixtureInvestigation({
      rounds: [
        fixtureRound({ id: "r1", shoeNumber: 1, roundNumber: 1 }),
        fixtureRound({ id: "r2", shoeNumber: 3, roundNumber: 1 }), // shoe 2 is missing
      ],
    });
    const result = checkInvestigationHealth(investigation, []);
    expect(result.ok).toBe(false);
    const check = result.checks.find((c) => c.id === "shoe-numbers-contiguous");
    expect(check?.status).toBe("fail");
  });

  it("a completed round with dealer cards and no occupied seats always still validates", () => {
    const investigation = fixtureInvestigation({
      occupiedSeats: [],
      rounds: [
        fixtureRound({
          id: "r1",
          completed: true,
          dealerHand: { cards: [{ rank: "10", suit: "unspecified" }] },
        }),
      ],
    });
    const result = checkInvestigationHealth(investigation, []);
    const check = result.checks.find((c) => c.id === "completed-rounds-still-valid");
    expect(check?.status).toBe("pass");
  });

  it("warns (does not fail) when a completed round no longer satisfies today's canCompleteRound — a signal, not a blocker", () => {
    const investigation = fixtureInvestigation({
      occupiedSeats: [2],
      rounds: [
        fixtureRound({
          id: "r1",
          completed: true,
          dealerHand: { cards: [] }, // dealer cards missing — canCompleteRound would refuse this today
          seats: { 2: { ...fixtureEmptySeat(2), betAmount: 25, startingWagerAmount: 25 } },
        }),
      ],
    });
    const result = checkInvestigationHealth(investigation, []);
    const check = result.checks.find((c) => c.id === "completed-rounds-still-valid");
    expect(check?.status).toBe("warn");
    expect(result.ok).toBe(true); // warn alone must never fail the report
  });

  it("reports zero legacy ambiguities when the investigation already has a real card-event ledger", () => {
    resetEventSequence();
    const investigation = fixtureInvestigation({
      rounds: [fixtureRound({ id: "r1", dealerHand: { cards: [{ rank: "10", suit: "unspecified" }] } })],
    });
    const events = [fixtureEvent("10", { roundId: "r1" })];
    const result = checkInvestigationHealth(investigation, events);
    const check = result.checks.find((c) => c.id === "legacy-ledger-ambiguities");
    expect(check?.status).toBe("pass");
  });

  it("surfaces legacy-recovery ambiguities without writing anything, when a seat was cleared before a ledger existed", () => {
    const investigation = fixtureInvestigation({
      occupiedSeats: [],
      rounds: [
        fixtureRound({
          id: "r1",
          dealerHand: { cards: [] },
          seats: {}, // seat 6's structured record is already gone (markSeatEmpty)
          eventLog: [
            { id: "e1", timestamp: "2026-07-29T05:31:09.617Z", type: "card", message: "Seat 6: A" },
            { id: "e2", timestamp: "2026-07-29T05:31:10.000Z", type: "card", message: "Seat 6: 7" },
          ],
        }),
      ],
    });
    // No real CardEvents recorded — this is exactly ensureLegacyLedger's
    // gate for "has legacy activity to recover".
    const result = checkInvestigationHealth(investigation, []);
    const check = result.checks.find((c) => c.id === "legacy-ledger-ambiguities");
    expect(check?.status).toBe("warn");
    expect(result.ok).toBe(true);
  });

  it("summary counts reflect the investigation and the active (not undone/void) card events", () => {
    resetEventSequence();
    const investigation = fixtureInvestigation({
      occupiedSeats: [1, 2],
      operatorNotes: [{ id: "n1", timestamp: "2026-01-01T00:00:00Z", text: "note" }],
      rounds: [fixtureRound({ id: "r1" })],
    });
    const events = [
      fixtureEvent("10", { roundId: "r1" }),
      fixtureEvent("5", { roundId: "r1", status: "undone" }),
    ];
    const result = checkInvestigationHealth(investigation, events);
    expect(result.summary).toEqual({
      shoeCount: 1,
      roundCount: 1,
      occupiedSeatCount: 2,
      activeCardEventCount: 1,
      operatorNoteCount: 1,
    });
  });
});

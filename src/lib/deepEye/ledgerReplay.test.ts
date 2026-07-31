import { describe, expect, it } from "vitest";
import { checkLedgerReplay } from "./ledgerReplay";
import { fixtureEvent, fixtureInvestigation, fixtureRound, resetEventSequence } from "./testFixtures";
import type { CardEvent, CardEventStatus } from "@/lib/counting-engine/types";

describe("checkLedgerReplay", () => {
  it("passes on a clean, contiguous single-shoe ledger", () => {
    resetEventSequence();
    const investigation = fixtureInvestigation({ rounds: [fixtureRound({ id: "round-1" })] });
    const events = [
      fixtureEvent("10", { sequence: 1, roundId: "round-1" }),
      fixtureEvent("5", { sequence: 2, roundId: "round-1" }),
      fixtureEvent("A", { sequence: 3, roundId: "round-1" }),
    ];
    const report = checkLedgerReplay(investigation, events);
    expect(report.ok).toBe(true);
  });

  it("an undone event still permanently consumes its sequence slot — contiguity holds across active+undone together", () => {
    resetEventSequence();
    const investigation = fixtureInvestigation({ rounds: [fixtureRound({ id: "round-1" })] });
    const events = [
      fixtureEvent("10", { sequence: 1, roundId: "round-1" }),
      fixtureEvent("5", { sequence: 2, roundId: "round-1", status: "undone" }),
      fixtureEvent("A", { sequence: 3, roundId: "round-1" }),
    ];
    const report = checkLedgerReplay(investigation, events);
    const check = report.checks.find((c) => c.id === "sequence-contiguous-shoe-1");
    expect(check?.status).toBe("pass");
  });

  it("flags a gap in sequence numbers within a shoe", () => {
    resetEventSequence();
    const investigation = fixtureInvestigation({ rounds: [fixtureRound({ id: "round-1" })] });
    const events = [
      fixtureEvent("10", { sequence: 1, roundId: "round-1" }),
      fixtureEvent("A", { sequence: 3, roundId: "round-1" }), // 2 is missing
    ];
    const report = checkLedgerReplay(investigation, events);
    expect(report.ok).toBe(false);
    const check = report.checks.find((c) => c.id === "sequence-contiguous-shoe-1");
    expect(check?.status).toBe("fail");
  });

  it("flags a repeated sequence number within a shoe", () => {
    resetEventSequence();
    const investigation = fixtureInvestigation({ rounds: [fixtureRound({ id: "round-1" })] });
    const events = [
      fixtureEvent("10", { sequence: 1, roundId: "round-1" }),
      fixtureEvent("A", { sequence: 1, roundId: "round-1" }),
    ];
    const report = checkLedgerReplay(investigation, events);
    expect(report.ok).toBe(false);
  });

  it("each shoe's sequence numbering is independent — shoe 2 starting fresh at 1 is not a gap", () => {
    resetEventSequence();
    const investigation = fixtureInvestigation({
      rounds: [fixtureRound({ id: "round-1", shoeNumber: 1 }), fixtureRound({ id: "round-2", shoeNumber: 2, roundNumber: 1 })],
    });
    const events = [
      fixtureEvent("10", { sequence: 1, shoeNumber: 1, roundId: "round-1" }),
      fixtureEvent("A", { sequence: 2, shoeNumber: 1, roundId: "round-1" }),
      fixtureEvent("9", { sequence: 1, shoeNumber: 2, roundId: "round-2" }),
    ];
    const report = checkLedgerReplay(investigation, events);
    expect(report.ok).toBe(true);
  });

  it("flags an event whose roundId does not correspond to any round on the investigation", () => {
    resetEventSequence();
    const investigation = fixtureInvestigation({ rounds: [fixtureRound({ id: "round-1" })] });
    const events = [fixtureEvent("10", { sequence: 1, roundId: "round-does-not-exist" })];
    const report = checkLedgerReplay(investigation, events);
    expect(report.ok).toBe(false);
    const check = report.checks.find((c) => c.id === "no-orphaned-events");
    expect(check?.status).toBe("fail");
  });

  it("flags an unrecognized status value", () => {
    resetEventSequence();
    const investigation = fixtureInvestigation({ rounds: [fixtureRound({ id: "round-1" })] });
    const events: CardEvent[] = [
      fixtureEvent("10", { sequence: 1, roundId: "round-1", status: "corrupted" as CardEventStatus }),
    ];
    const report = checkLedgerReplay(investigation, events);
    expect(report.ok).toBe(false);
    const check = report.checks.find((c) => c.id === "all-statuses-recognized");
    expect(check?.status).toBe("fail");
  });

  it("activeEventsInOrder is stable under a second pass (idempotency)", () => {
    resetEventSequence();
    const investigation = fixtureInvestigation({ rounds: [fixtureRound({ id: "round-1" })] });
    const events = [
      fixtureEvent("10", { sequence: 1, roundId: "round-1" }),
      fixtureEvent("5", { sequence: 2, roundId: "round-1", status: "undone" }),
    ];
    const report = checkLedgerReplay(investigation, events);
    const check = report.checks.find((c) => c.id === "active-events-in-order-idempotent");
    expect(check?.status).toBe("pass");
  });

  it("an investigation with no card events at all is trivially healthy (nothing to replay)", () => {
    const investigation = fixtureInvestigation({ rounds: [] });
    const report = checkLedgerReplay(investigation, []);
    expect(report.ok).toBe(true);
  });
});

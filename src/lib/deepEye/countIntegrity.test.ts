import { describe, expect, it } from "vitest";
import { checkCountIntegrity } from "./countIntegrity";
import { fixtureEvent, resetEventSequence } from "./testFixtures";
import type { CardEvent, Rank } from "@/lib/counting-engine/types";

describe("checkCountIntegrity", () => {
  it("passes every check on an empty ledger", () => {
    const report = checkCountIntegrity([], 6);
    expect(report.ok).toBe(true);
    expect(report.checks.every((c) => c.status === "pass")).toBe(true);
  });

  it("the independent recompute agrees with calculateCountSnapshot across all four systems for a mixed hand", () => {
    resetEventSequence();
    const events = [fixtureEvent("10"), fixtureEvent("5"), fixtureEvent("A"), fixtureEvent("7")];
    const report = checkCountIntegrity(events, 6);
    expect(report.ok).toBe(true);
    for (const system of ["Hi-Lo", "KO", "Zen", "Omega II"]) {
      const check = report.checks.find((c) => c.id === `running-count-agrees-${system}`);
      expect(check?.status).toBe("pass");
    }
  });

  it("still agrees when undone/void events are mixed in (they must be excluded identically by both paths)", () => {
    resetEventSequence();
    const events = [
      fixtureEvent("10"),
      fixtureEvent("5", { status: "undone" }),
      fixtureEvent("A", { status: "void" }),
      fixtureEvent("9"),
    ];
    const report = checkCountIntegrity(events, 6);
    expect(report.ok).toBe(true);
  });

  it("still agrees across a range of deck counts (decksRemaining / true count path)", () => {
    resetEventSequence();
    const events = [fixtureEvent("10"), fixtureEvent("2"), fixtureEvent("6")];
    for (const decks of [1, 2, 6, 8]) {
      const report = checkCountIntegrity(events, decks);
      expect(report.ok).toBe(true);
    }
  });

  it("flags a duplicate event id — a live Dexie read can never produce this, so it only fires on suspect data", () => {
    resetEventSequence();
    const events: CardEvent[] = [
      fixtureEvent("5", { id: "dup" }),
      fixtureEvent("6", { id: "dup", sequence: 2 }),
    ];
    const report = checkCountIntegrity(events, 6);
    expect(report.ok).toBe(false);
    const check = report.checks.find((c) => c.id === "no-duplicate-event-ids");
    expect(check?.status).toBe("fail");
  });

  it("flags an unrecognized rank value (corrupted/hand-edited data)", () => {
    resetEventSequence();
    const events: CardEvent[] = [fixtureEvent("5"), fixtureEvent("??" as Rank)];
    const report = checkCountIntegrity(events, 6);
    expect(report.ok).toBe(false);
    const check = report.checks.find((c) => c.id === "all-ranks-valid");
    expect(check?.status).toBe("fail");
  });
});

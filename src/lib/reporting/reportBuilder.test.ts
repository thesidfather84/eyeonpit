// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { addCardToRound, getCardEventsForInvestigation } from "@/lib/db/repositories/cardEvents";
import { createInvestigation, getInvestigation, resetAllData } from "@/lib/db/repositories/investigations";
import { buildPropertyMetadata } from "./propertyMetadata";
import { buildReportFromInvestigation } from "./reportBuilder";
import type { CardCode } from "@/types/investigation";

beforeEach(async () => {
  await resetAllData();
});

async function freshInvestigation() {
  return createInvestigation({
    casino: "Test Casino",
    tableNumber: "BJ-4",
    dealerName: "",
    investigationDate: "2026-08-19",
    operatorName: "J. Smith",
    countingSystem: "Hi-Lo",
    shoeTotalDecks: 6,
    status: "active",
  });
}

function dealerAdd(investigationId: string, roundId: string, rank: CardCode["rank"]) {
  return addCardToRound({
    investigationLocalId: investigationId,
    roundId,
    targetType: "dealer",
    targetId: "dealer",
    rank,
    applyToRound: (round) => ({ ...round, dealerHand: { cards: [...round.dealerHand.cards, { rank, suit: "unspecified" }] } }),
    event: { type: "card", message: `Dealer: ${rank}` },
  });
}

describe("buildReportFromInvestigation — derives a Report from authoritative investigation data, never fabricates", () => {
  it("copies property/game/timing fields straight from the investigation, no invention", async () => {
    const inv = await freshInvestigation();
    const property = buildPropertyMetadata({ code: "TESTCO", name: "Test Casino Property" });

    const report = buildReportFromInvestigation({ investigation: inv, cardEvents: [], property });

    expect(report.property.propertyCode).toBe("TESTCO");
    expect(report.property.propertyName).toBe("Test Casino Property");
    expect(report.property.investigatorName).toBe("J. Smith");
    expect(report.gameConfig.countingSystem).toBe("Hi-Lo");
    expect(report.gameConfig.shoeTotalDecks).toBe(6);
    expect(report.timing.investigationDate).toBe("2026-08-19");
    expect(report.status).toBe("draft");
    expect(report.humanId).toMatch(/^TESTCO-20260819-[A-F0-9]{6}$/);
    expect(report.versionInfo.investigationId).toBe(inv.localId);
    expect(report.versionInfo.investigationDisplayId).toBe(inv.displayId);
  });

  it("uses UNKNOWN property code/name when no PropertyMetadata is given, rather than throwing", async () => {
    const inv = await freshInvestigation();
    const report = buildReportFromInvestigation({ investigation: inv, cardEvents: [] });
    expect(report.property.propertyCode).toBe("UNKNOWN");
    expect(report.humanId).toMatch(/^UNKNOWN-20260819-[A-F0-9]{6}$/);
  });

  it("count history is derived from the real ledger via calculateRoundCountSnapshot, matching a hand-verified value", async () => {
    const inv = await freshInvestigation();
    const roundId = inv.rounds[0].id;
    await dealerAdd(inv.localId, roundId, "K"); // Hi-Lo -1
    await dealerAdd(inv.localId, roundId, "5"); // Hi-Lo +1 -> running 0

    const fresh = await getInvestigation(inv.localId);
    const cardEvents = await getCardEventsForInvestigation(inv.localId);
    const report = buildReportFromInvestigation({ investigation: fresh!, cardEvents });

    expect(report.observedPlay.countHistory).toHaveLength(1);
    expect(report.observedPlay.countHistory[0].runningCount).toBe(0);
    expect(report.observedPlay.roundEvidence[0].dealerCards).toEqual(["K", "5"]);
  });

  it("omits the analysis section entirely when no seat has any wager data — never a fabricated empty analysis block", async () => {
    const inv = await freshInvestigation();
    const cardEvents = await getCardEventsForInvestigation(inv.localId);
    const report = buildReportFromInvestigation({ investigation: inv, cardEvents });
    expect(report.analysis).toBeUndefined();
  });

  it("players and significant events start empty — never invented from ledger data alone", async () => {
    const inv = await freshInvestigation();
    const report = buildReportFromInvestigation({ investigation: inv, cardEvents: [] });
    expect(report.players).toEqual([]);
    expect(report.observedPlay.significantEvents).toEqual([]);
  });

  it("timing.endedAt/durationMs stay null for an open investigation — never a fabricated end time", async () => {
    const inv = await freshInvestigation();
    const report = buildReportFromInvestigation({ investigation: inv, cardEvents: [] });
    expect(report.timing.endedAt).toBeNull();
    expect(report.timing.durationMs).toBeNull();
  });

  it("narrative fields are copied verbatim from the investigation's own operator-authored text", async () => {
    const inv = await freshInvestigation();
    const report = buildReportFromInvestigation({
      investigation: { ...inv, executiveSummary: "Summary text", surveillanceMemo: "Memo text" },
      cardEvents: [],
    });
    expect(report.narrative.executiveSummary).toBe("Summary text");
    expect(report.narrative.surveillanceMemo).toBe("Memo text");
    expect(report.narrative.aiAssist).toBeUndefined();
  });

  it("versionInfo always includes the current report schema and counting engine versions", async () => {
    const inv = await freshInvestigation();
    const report = buildReportFromInvestigation({ investigation: inv, cardEvents: [] });
    expect(report.versionInfo.reportSchemaVersion).toBe(1);
    expect(report.versionInfo.countingEngineVersion).toBeTruthy();
    expect(report.versionInfo.generatedAt).toBeTruthy();
  });
});

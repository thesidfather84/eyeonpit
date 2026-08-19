// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createInvestigation, getInvestigation, mutateRound, resetAllData, createEmptySeatRecord } from "@/lib/db/repositories/investigations";
import { getCardEventsForInvestigation } from "@/lib/db/repositories/cardEvents";
import { buildReportFromInvestigation } from "@/lib/reporting/reportBuilder";
import { extractPlayerObservations } from "./extractObservations";
import { attachPlayerAnalytics, groupObservationsBySeat } from "./reportIntegration";

beforeEach(async () => {
  await resetAllData();
});

async function freshInvestigation() {
  return createInvestigation({
    casino: "Test Casino",
    tableNumber: "BJ-9",
    dealerName: "",
    investigationDate: "2026-08-19",
    operatorName: "J. Smith",
    countingSystem: "Hi-Lo",
    shoeTotalDecks: 6,
    status: "active",
  });
}

async function seatSeat(investigationId: string, roundId: string, seatNumber: number, patch: Partial<ReturnType<typeof createEmptySeatRecord>>) {
  await mutateRound(
    investigationId,
    roundId,
    (round) => ({ ...round, seats: { ...round.seats, [seatNumber]: { ...createEmptySeatRecord(seatNumber), ...patch, seatNumber } } }),
    { type: "bet-change", message: `Seat ${seatNumber} test setup` }
  );
}

describe("attachPlayerAnalytics — opt-in Report analytics attachment (Priority 9)", () => {
  it("does not add an analysis section when there is no seat data at all", async () => {
    const inv = await freshInvestigation();
    const report = buildReportFromInvestigation({ investigation: inv, cardEvents: [] });
    const attached = attachPlayerAnalytics(report, []);
    expect(attached.analysis).toBeUndefined();
  });

  it("adds counterAnalysisBySeat/bettingAnalysisBySeat/methodology when real seat observations are supplied", async () => {
    const inv = await freshInvestigation();
    const roundId = inv.rounds[0].id;
    await seatSeat(inv.localId, roundId, 3, { betAmount: 25, startingWagerAmount: 25 });

    const fresh = await getInvestigation(inv.localId);
    const cardEvents = await getCardEventsForInvestigation(inv.localId);
    const report = buildReportFromInvestigation({ investigation: fresh!, cardEvents });
    const observations = extractPlayerObservations({ investigation: fresh!, cardEvents });
    const bySeat = groupObservationsBySeat(observations);

    const attached = attachPlayerAnalytics(
      report,
      [...bySeat.entries()].map(([seatNumber, obs]) => ({ seatNumber, observations: obs, confidenceOptions: { insuranceTrueCountThreshold: 3 } }))
    );

    expect(attached.analysis?.counterAnalysisBySeat).toHaveLength(1);
    expect(attached.analysis?.counterAnalysisBySeat![0].seatNumber).toBe(3);
    expect(attached.analysis?.counterAnalysisBySeat![0].classification).toBe("INSUFFICIENT_DATA");
    expect(attached.analysis?.bettingAnalysisBySeat).toHaveLength(1);
    expect(attached.analysis?.methodology?.validationStatus).toBe("EXPERIMENTAL_NOT_VALIDATED");
    expect(attached.analysis?.methodology?.limitations.length).toBeGreaterThan(0);
  });

  it("never mutates the input report — returns a new object when real analytics are attached", async () => {
    const inv = await freshInvestigation();
    const roundId = inv.rounds[0].id;
    await seatSeat(inv.localId, roundId, 4, { betAmount: 15, startingWagerAmount: 15 });
    const fresh = await getInvestigation(inv.localId);
    const cardEvents = await getCardEventsForInvestigation(inv.localId);
    const report = buildReportFromInvestigation({ investigation: fresh!, cardEvents });
    const observations = extractPlayerObservations({ investigation: fresh!, cardEvents });
    const bySeat = groupObservationsBySeat(observations);
    const attached = attachPlayerAnalytics(
      report,
      [...bySeat.entries()].map(([seatNumber, obs]) => ({ seatNumber, observations: obs, confidenceOptions: { insuranceTrueCountThreshold: 3 } }))
    );
    expect(attached).not.toBe(report);
    expect(report.analysis).toBeUndefined(); // original untouched
  });

  it("is a true no-op (same reference) when no seat has any observations", async () => {
    const inv = await freshInvestigation();
    const report = buildReportFromInvestigation({ investigation: inv, cardEvents: [] });
    const attached = attachPlayerAnalytics(report, []);
    expect(attached).toBe(report);
  });

  it("preserves any pre-existing analysis fields (e.g. betCountCorrelationBySeat) rather than overwriting them", async () => {
    const inv = await freshInvestigation();
    const roundId = inv.rounds[0].id;
    await seatSeat(inv.localId, roundId, 2, { betAmount: 10, startingWagerAmount: 10 });
    const fresh = await getInvestigation(inv.localId);
    const cardEvents = await getCardEventsForInvestigation(inv.localId);
    const report = { ...buildReportFromInvestigation({ investigation: fresh!, cardEvents }), analysis: { betCountCorrelationBySeat: [{ seatNumber: 2, correlation: 0.5, sampleSize: 5, level: "moderate" as const }] } };

    const observations = extractPlayerObservations({ investigation: fresh!, cardEvents });
    const bySeat = groupObservationsBySeat(observations);
    const attached = attachPlayerAnalytics(
      report,
      [...bySeat.entries()].map(([seatNumber, obs]) => ({ seatNumber, observations: obs, confidenceOptions: { insuranceTrueCountThreshold: 3 } }))
    );

    expect(attached.analysis?.betCountCorrelationBySeat).toEqual([{ seatNumber: 2, correlation: 0.5, sampleSize: 5, level: "moderate" }]);
    expect(attached.analysis?.counterAnalysisBySeat).toHaveLength(1);
  });
});

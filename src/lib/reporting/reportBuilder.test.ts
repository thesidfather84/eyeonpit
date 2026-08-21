// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { addCardToRound, getCardEventsForInvestigation } from "@/lib/db/repositories/cardEvents";
import {
  createInvestigation,
  getInvestigation,
  mutateRound,
  occupySeat,
  resetAllData,
  splitSeat,
  updateSeatBet,
} from "@/lib/db/repositories/investigations";
import { appendCardForTarget } from "@/lib/utils/cardEventTarget";
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

/** Adds a card to a seat's PRIMARY hand via the exact same ledger-backed path production code uses (addCardToRound + appendCardForTarget) — never a synthetic object mutation. */
function seatAdd(investigationId: string, roundId: string, seatNumber: number, rank: CardCode["rank"]) {
  return addCardToRound({
    investigationLocalId: investigationId,
    roundId,
    targetType: "seat",
    targetId: seatNumber,
    rank,
    applyToRound: (round) => appendCardForTarget(round, "seat", seatNumber, { rank, suit: "unspecified" }),
    event: { type: "card", message: `Seat ${seatNumber}: ${rank}` },
  });
}

/** Adds a card to a seat's SPLIT hand via the exact same ledger-backed path production code uses. */
function splitAdd(investigationId: string, roundId: string, seatNumber: number, rank: CardCode["rank"]) {
  return addCardToRound({
    investigationLocalId: investigationId,
    roundId,
    targetType: "split",
    targetId: seatNumber,
    rank,
    applyToRound: (round) => appendCardForTarget(round, "split", seatNumber, { rank, suit: "unspecified" }),
    event: { type: "card", message: `Seat ${seatNumber} (split): ${rank}` },
  });
}

/** Marks a seat's primary or split hand as doubled — the exact same mutation PlayerActionsRow.tsx's handleDouble performs (betAmount doubled, doubled flag set, doubledAtCardCount snapshotted, "double" appended to actions), via the real repository mutateRound, never a synthetic object edit. */
async function doubleHand(investigationId: string, roundId: string, target: number) {
  const isSplit = target < 0;
  const seatNumber = Math.abs(target);
  await mutateRound(
    investigationId,
    roundId,
    (round) => {
      const key = isSplit ? "splitHands" : "seats";
      const seat = round[key][seatNumber];
      if (!seat) return round;
      return {
        ...round,
        [key]: {
          ...round[key],
          [seatNumber]: {
            ...seat,
            betAmount: seat.betAmount != null ? seat.betAmount * 2 : seat.betAmount,
            doubled: true,
            doubledAtCardCount: seat.playerCards.length,
            actions: [...seat.actions, "double" as const],
          },
        },
      };
    },
    { type: "action", message: `Spot ${seatNumber}${isSplit ? " (split)" : ""}: Double` }
  );
}

/** Sets a hand's outcome directly via mutateRound — the real repository function every outcome-setting UI action ultimately calls through. */
async function setOutcome(investigationId: string, roundId: string, target: number, outcome: "win" | "loss" | "push") {
  const isSplit = target < 0;
  const seatNumber = Math.abs(target);
  await mutateRound(
    investigationId,
    roundId,
    (round) => {
      const key = isSplit ? "splitHands" : "seats";
      const seat = round[key][seatNumber];
      if (!seat) return round;
      return { ...round, [key]: { ...round[key], [seatNumber]: { ...seat, outcome } } };
    },
    { type: "correction", message: `Spot ${seatNumber}${isSplit ? " (split)" : ""}: outcome ${outcome}` }
  );
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
    expect(report.versionInfo.reportSchemaVersion).toBe(3);
    expect(report.versionInfo.countingEngineVersion).toBeTruthy();
    expect(report.versionInfo.generatedAt).toBeTruthy();
  });
});

// EyeOnPit 1.10 Phase 1 — split-hand representation in generated reports.
// Every scenario below goes through the real, ledger-backed repository
// functions (occupySeat/updateSeatBet/addCardToRound/splitSeat/mutateRound)
// — never a synthetic Investigation object — so a passing test here proves
// the fix works against the exact same code path a live investigation uses.
describe("buildReportFromInvestigation — split-hand representation (1.10 Phase 1)", () => {
  it("(a) a normal, never-split round is completely unchanged in substance — one entry per seat, handIndex 1, doubled false", async () => {
    const inv = await freshInvestigation();
    const roundId = inv.rounds[0].id;
    await occupySeat(inv.localId, 3);
    await updateSeatBet(inv.localId, roundId, 3, 25, { direction: "first", amount: 25, overridden: false });
    await seatAdd(inv.localId, roundId, 3, "K");
    await seatAdd(inv.localId, roundId, 3, "9");
    await setOutcome(inv.localId, roundId, 3, "win");

    const fresh = await getInvestigation(inv.localId);
    const cardEvents = await getCardEventsForInvestigation(inv.localId);
    const report = buildReportFromInvestigation({ investigation: fresh!, cardEvents });

    const seatEntries = report.observedPlay.roundEvidence[0].seats;
    expect(seatEntries).toHaveLength(1);
    expect(seatEntries[0]).toEqual({
      seatNumber: 3,
      handIndex: 1,
      betAmount: 25,
      doubled: false,
      cards: ["K", "9"],
      outcome: "win",
    });
  });

  it("(b)+(c) a split seat produces exactly two entries — Hand 1 and Hand 2, both present", async () => {
    const inv = await freshInvestigation();
    const roundId = inv.rounds[0].id;
    await occupySeat(inv.localId, 5);
    await updateSeatBet(inv.localId, roundId, 5, 50, { direction: "first", amount: 50, overridden: false });
    await seatAdd(inv.localId, roundId, 5, "8");
    await seatAdd(inv.localId, roundId, 5, "8");
    await splitSeat(inv.localId, roundId, 5);

    const fresh = await getInvestigation(inv.localId);
    const cardEvents = await getCardEventsForInvestigation(inv.localId);
    const report = buildReportFromInvestigation({ investigation: fresh!, cardEvents });

    const seatEntries = report.observedPlay.roundEvidence[0].seats.filter((s) => s.seatNumber === 5);
    expect(seatEntries).toHaveLength(2);
    expect(seatEntries.map((s) => s.handIndex).sort()).toEqual([1, 2]);
  });

  it("(d) cards are associated with the correct hand — never merged or swapped between Hand 1 and Hand 2", async () => {
    const inv = await freshInvestigation();
    const roundId = inv.rounds[0].id;
    await occupySeat(inv.localId, 2);
    await updateSeatBet(inv.localId, roundId, 2, 20, { direction: "first", amount: 20, overridden: false });
    await seatAdd(inv.localId, roundId, 2, "6");
    await seatAdd(inv.localId, roundId, 2, "6");
    await splitSeat(inv.localId, roundId, 2);
    // Hand 1 gets a 10 next; Hand 2 gets a King next — real, distinct cards.
    await seatAdd(inv.localId, roundId, 2, "10");
    await splitAdd(inv.localId, roundId, 2, "K");

    const fresh = await getInvestigation(inv.localId);
    const cardEvents = await getCardEventsForInvestigation(inv.localId);
    const report = buildReportFromInvestigation({ investigation: fresh!, cardEvents });

    const seatEntries = report.observedPlay.roundEvidence[0].seats.filter((s) => s.seatNumber === 2);
    const hand1 = seatEntries.find((s) => s.handIndex === 1)!;
    const hand2 = seatEntries.find((s) => s.handIndex === 2)!;
    expect(hand1.cards).toEqual(["6", "6", "10"]);
    expect(hand2.cards).toEqual(["K"]);
  });

  it("(e) outcomes are associated with the correct hand — a split's two hands can resolve differently", async () => {
    const inv = await freshInvestigation();
    const roundId = inv.rounds[0].id;
    await occupySeat(inv.localId, 4);
    await updateSeatBet(inv.localId, roundId, 4, 15, { direction: "first", amount: 15, overridden: false });
    await seatAdd(inv.localId, roundId, 4, "7");
    await seatAdd(inv.localId, roundId, 4, "7");
    await splitSeat(inv.localId, roundId, 4);
    await setOutcome(inv.localId, roundId, 4, "win");
    await setOutcome(inv.localId, roundId, -4, "loss");

    const fresh = await getInvestigation(inv.localId);
    const cardEvents = await getCardEventsForInvestigation(inv.localId);
    const report = buildReportFromInvestigation({ investigation: fresh!, cardEvents });

    const seatEntries = report.observedPlay.roundEvidence[0].seats.filter((s) => s.seatNumber === 4);
    expect(seatEntries.find((s) => s.handIndex === 1)!.outcome).toBe("win");
    expect(seatEntries.find((s) => s.handIndex === 2)!.outcome).toBe("loss");
  });

  it("(f) doubled state and wager survive independently per hand", async () => {
    const inv = await freshInvestigation();
    const roundId = inv.rounds[0].id;
    await occupySeat(inv.localId, 6);
    await updateSeatBet(inv.localId, roundId, 6, 10, { direction: "first", amount: 10, overridden: false });
    await seatAdd(inv.localId, roundId, 6, "5");
    await seatAdd(inv.localId, roundId, 6, "5");
    await splitSeat(inv.localId, roundId, 6);
    // Only Hand 2 doubles — Hand 1 must NOT show doubled/inflated wager.
    await doubleHand(inv.localId, roundId, -6);

    const fresh = await getInvestigation(inv.localId);
    const cardEvents = await getCardEventsForInvestigation(inv.localId);
    const report = buildReportFromInvestigation({ investigation: fresh!, cardEvents });

    const seatEntries = report.observedPlay.roundEvidence[0].seats.filter((s) => s.seatNumber === 6);
    const hand1 = seatEntries.find((s) => s.handIndex === 1)!;
    const hand2 = seatEntries.find((s) => s.handIndex === 2)!;
    expect(hand1.doubled).toBe(false);
    expect(hand1.betAmount).toBe(10);
    expect(hand2.doubled).toBe(true);
    expect(hand2.betAmount).toBe(20);
  });

  it("(g) no card or count duplication occurs when a seat splits", async () => {
    const inv = await freshInvestigation();
    const roundId = inv.rounds[0].id;
    await occupySeat(inv.localId, 1);
    await updateSeatBet(inv.localId, roundId, 1, 10, { direction: "first", amount: 10, overridden: false });
    await seatAdd(inv.localId, roundId, 1, "9");
    await seatAdd(inv.localId, roundId, 1, "9");
    await splitSeat(inv.localId, roundId, 1);
    await seatAdd(inv.localId, roundId, 1, "2");
    await splitAdd(inv.localId, roundId, 1, "3");

    const fresh = await getInvestigation(inv.localId);
    const cardEvents = await getCardEventsForInvestigation(inv.localId);

    // Exactly 4 physical cards were ever added — the ledger must show exactly 4 events, never more.
    expect(cardEvents).toHaveLength(4);

    const report = buildReportFromInvestigation({ investigation: fresh!, cardEvents });
    const seatEntries = report.observedPlay.roundEvidence[0].seats.filter((s) => s.seatNumber === 1);
    const allReportedCards = seatEntries.flatMap((s) => s.cards);
    // Every reported card appears exactly once across both hands combined — no card counted twice.
    expect(allReportedCards.sort()).toEqual(["2", "3", "9", "9"].sort());
    expect(allReportedCards).toHaveLength(4);

    // The count itself is computed from the ledger, independent of hand count — Hi-Lo tags: 9=0, 9=0, 2=+1, 3=+1 -> running count 2, verifying it reflects exactly these 4 cards, not 8 (which would show 4).
    expect(report.observedPlay.countHistory[0].runningCount).toBe(2);
  });
});

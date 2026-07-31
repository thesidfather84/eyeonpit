// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { buildSupportPackage } from "./supportPackage";
import { addCardToRound } from "@/lib/db/repositories/cardEvents";
import { createInvestigation, getInvestigation, linkSeats, occupySeat } from "@/lib/db/repositories/investigations";
import type { CardCode } from "@/types/investigation";

async function freshInvestigation() {
  return createInvestigation({
    casino: "Real Casino Name",
    tableNumber: "12",
    dealerName: "Real Dealer Name",
    investigationDate: "2026-07-31",
    operatorName: "Real Operator Name",
    countingSystem: "Hi-Lo",
    shoeTotalDecks: 6,
    status: "active",
  });
}

beforeEach(async () => {
  await getDb().delete();
  await getDb().open();
});

describe("buildSupportPackage", () => {
  it("redacts every name/free-text field and includes none of the original values anywhere in the output", async () => {
    const inv = await freshInvestigation();
    const roundId = inv.rounds[0].id;
    const rank: CardCode["rank"] = "10";
    await addCardToRound({
      investigationLocalId: inv.localId,
      roundId,
      targetType: "dealer",
      targetId: "dealer",
      rank,
      applyToRound: (round) => ({ ...round, dealerHand: { cards: [{ rank, suit: "unspecified" }] } }),
      event: { type: "card", message: `Dealer: ${rank}` },
    });
    const loaded = await getInvestigation(inv.localId);
    const pkg = await buildSupportPackage(loaded!);

    expect(pkg.investigation.casino).toBeNull();
    expect(pkg.investigation.dealerName).toBeNull();
    expect(pkg.investigation.operatorName).toBeNull();

    const serialized = JSON.stringify(pkg);
    expect(serialized).not.toContain("Real Casino Name");
    expect(serialized).not.toContain("Real Dealer Name");
    expect(serialized).not.toContain("Real Operator Name");
  });

  it("replaces player-group labels but preserves which seats are linked together", async () => {
    const inv = await freshInvestigation();
    await occupySeat(inv.localId, 1);
    await occupySeat(inv.localId, 2);
    await linkSeats(inv.localId, 1, 2);
    const loaded = await getInvestigation(inv.localId);
    const pkg = await buildSupportPackage(loaded!);

    const groupIds = Object.keys(pkg.investigation.playerGroups);
    expect(groupIds.length).toBeGreaterThan(0);
    for (const id of groupIds) {
      expect(pkg.investigation.playerGroups[id].label).toMatch(/^Group \d+$/);
    }
    // Same group id for both seats — the structural link survives redaction.
    expect(loaded!.seatPlayerGroups[1]).toBe(loaded!.seatPlayerGroups[2]);
    expect(pkg.investigation.playerGroups[loaded!.seatPlayerGroups[1]!]).toBeDefined();
  });

  it("keeps operator note count but never the note text itself", async () => {
    const inv = await freshInvestigation();
    const { addOperatorNote } = await import("@/lib/db/repositories/investigations");
    await addOperatorNote(inv.localId, "This note names a specific player — sensitive.");
    const loaded = await getInvestigation(inv.localId);
    const pkg = await buildSupportPackage(loaded!);

    expect(pkg.investigation.operatorNoteCount).toBe(1);
    expect(JSON.stringify(pkg)).not.toContain("sensitive");
  });

  it("includes the full card-event ledger and all three diagnostics, unredacted (structural data, not PII)", async () => {
    const inv = await freshInvestigation();
    const roundId = inv.rounds[0].id;
    const rank: CardCode["rank"] = "5";
    await addCardToRound({
      investigationLocalId: inv.localId,
      roundId,
      targetType: "dealer",
      targetId: "dealer",
      rank,
      applyToRound: (round) => ({ ...round, dealerHand: { cards: [{ rank, suit: "unspecified" }] } }),
      event: { type: "card", message: `Dealer: ${rank}` },
    });
    const loaded = await getInvestigation(inv.localId);
    const pkg = await buildSupportPackage(loaded!);

    expect(pkg.cardEvents).toHaveLength(1);
    expect(pkg.diagnostics.countIntegrity.ok).toBe(true);
    expect(pkg.diagnostics.ledgerReplay.ok).toBe(true);
    expect(pkg.diagnostics.investigationHealth.ok).toBe(true);
    expect(pkg.supportPackageSchemaVersion).toBe(1);
  });
});

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createInvestigation } from "@/lib/db/repositories/investigations";
import { addCardToRound } from "@/lib/db/repositories/cardEvents";
import { EXPORT_SCHEMA_VERSION, investigationToJson, type InvestigationExportBundle } from "./toJson";

describe("investigationToJson", () => {
  it("bundles the investigation together with its full card-event ledger — never just the bare investigation", async () => {
    const inv = await createInvestigation({
      casino: "",
      tableNumber: "",
      dealerName: "",
      investigationDate: "2026-07-30",
      operatorName: "",
      countingSystem: "Hi-Lo",
      shoeTotalDecks: 6,
      status: "active",
    });
    const round = inv.rounds[0];
    await addCardToRound({
      investigationLocalId: inv.localId,
      roundId: round.id,
      targetType: "dealer",
      targetId: "dealer",
      rank: "10",
      applyToRound: (r) => ({ ...r, dealerHand: { cards: [...r.dealerHand.cards, { rank: "10", suit: "unspecified" }] } }),
      event: { type: "card", message: "Dealer: 10" },
    });

    const json = await investigationToJson(inv);
    const bundle: InvestigationExportBundle = JSON.parse(json);

    expect(bundle.exportSchemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(bundle.investigation.localId).toBe(inv.localId);
    expect(bundle.cardEvents).toHaveLength(1);
    expect(bundle.cardEvents[0].rank).toBe("10");
    expect(bundle.cardEvents[0].investigationId).toBe(inv.localId);
  });

  it("exports an empty (but present) cardEvents array for an investigation with no cards yet", async () => {
    const inv = await createInvestigation({
      casino: "",
      tableNumber: "",
      dealerName: "",
      investigationDate: "2026-07-30",
      operatorName: "",
      countingSystem: "Hi-Lo",
      shoeTotalDecks: 6,
      status: "active",
    });
    const bundle: InvestigationExportBundle = JSON.parse(await investigationToJson(inv));
    expect(bundle.cardEvents).toEqual([]);
  });
});

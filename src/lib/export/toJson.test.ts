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

  it("attaches currentCountSnapshot computed fresh from cardEvents — never relies on the current round's own (always-null) runningCount/trueCount cache fields", async () => {
    const inv = await createInvestigation({
      casino: "",
      tableNumber: "",
      dealerName: "",
      investigationDate: "2026-08-10",
      operatorName: "",
      countingSystem: "Hi-Lo",
      shoeTotalDecks: 6,
      status: "active",
    });
    const round = inv.rounds[0];
    // Three low cards -> Hi-Lo +3, still on the current (never-superseded) round.
    for (const rank of ["2", "3", "4"] as const) {
      await addCardToRound({
        investigationLocalId: inv.localId,
        roundId: round.id,
        targetType: "dealer",
        targetId: "dealer",
        rank,
        applyToRound: (r) => ({ ...r, dealerHand: { cards: [...r.dealerHand.cards, { rank, suit: "unspecified" }] } }),
        event: { type: "card", message: `Dealer: ${rank}` },
      });
    }

    const bundle: InvestigationExportBundle = JSON.parse(await investigationToJson(inv));

    // The historical-only cache field is null by design for the still-open
    // round — this is the exact shape a raw export previously left a
    // reader to misread as "the count is missing."
    const currentRound = bundle.investigation.rounds[bundle.investigation.rounds.length - 1];
    expect(currentRound.runningCount).toBeNull();
    expect(currentRound.trueCount).toBeNull();
    // currentCountSnapshot is the authoritative fix: computed fresh, always present.
    expect(bundle.currentCountSnapshot["Hi-Lo"].running).toBe(3);
  });
});

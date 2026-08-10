// @vitest-environment jsdom
//
// Regression coverage for requirement #15 of the operator-loop milestone:
// every blocked/disabled state on the card keypad must explain WHY, so a
// brand-new operator never wonders whether EyeOnPit broke. Drives the real
// CardEntryPad against real investigation state — no mocked disabled/
// locked/notEnabled props.
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InvestigationProvider } from "@/contexts/InvestigationContext";
import {
  createInvestigation,
  occupySeat,
  pauseInvestigation,
  updateInvestigation,
} from "@/lib/db/repositories/investigations";
import { addCardToRound } from "@/lib/db/repositories/cardEvents";
import { CardEntryPad } from "./CardEntryPad";

async function freshInvestigationId(): Promise<string> {
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
  return inv.localId;
}

describe("CardEntryPad — blocked-state messaging explains WHY, never just goes dark", () => {
  it("investigation paused -> keypad disabled AND a clear paused explanation, even with no LiveHeader in view (Floor Mode's own situation)", async () => {
    const investigationId = await freshInvestigationId();
    await pauseInvestigation(investigationId);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <CardEntryPad />
      </InvestigationProvider>
    );

    await waitFor(() => screen.getByText(/Investigation paused — resume to continue/));
    const aceButton = screen.getByRole("button", { name: "A" }) as HTMLButtonElement;
    expect(aceButton.disabled).toBe(true);
  });

  it("active target is an unoccupied seat -> explains it's not enabled and how to fix it (current, accurate wording — not the stale 'double-tap')", async () => {
    const investigationId = await freshInvestigationId();
    await updateInvestigation(investigationId, { activeTarget: 3 }); // seat 3, never occupied

    render(
      <InvestigationProvider investigationId={investigationId}>
        <CardEntryPad />
      </InvestigationProvider>
    );

    await waitFor(() => screen.getByText(/Seat not enabled — tap the seat, or say its name, to enable it/));
    expect(screen.queryByText(/double-tap/)).toBeNull();
  });

  it("round already complete -> explains it and points to Next, rather than silently disabling the keypad", async () => {
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
    await addCardToRound({
      investigationLocalId: inv.localId,
      roundId: round.id,
      targetType: "dealer",
      targetId: "dealer",
      rank: "10",
      applyToRound: (r) => ({ ...r, dealerHand: { cards: [...r.dealerHand.cards, { rank: "10", suit: "unspecified" }] } }),
      event: { type: "card", message: "Dealer: 10" },
    });
    const { completeRound } = await import("@/lib/db/repositories/investigations");
    await completeRound(inv.localId, round.id);

    render(
      <InvestigationProvider investigationId={inv.localId}>
        <CardEntryPad />
      </InvestigationProvider>
    );

    await waitFor(() => screen.getByText(/Round complete — say or tap Next for the next hand/));
  });

  it("a normal, enabled target with a card already entered shows that card's own message, not a block reason", async () => {
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
    await occupySeat(inv.localId, 1);
    await addCardToRound({
      investigationLocalId: inv.localId,
      roundId: inv.rounds[0].id,
      targetType: "dealer",
      targetId: "dealer",
      rank: "5",
      applyToRound: (r) => ({ ...r, dealerHand: { cards: [...r.dealerHand.cards, { rank: "5", suit: "unspecified" }] } }),
      event: { type: "card", message: "Dealer: 5" },
    });

    render(
      <InvestigationProvider investigationId={inv.localId}>
        <CardEntryPad />
      </InvestigationProvider>
    );

    await waitFor(() => screen.getByText("Dealer: 5"));
    const aceButton = screen.getByRole("button", { name: "A" }) as HTMLButtonElement;
    expect(aceButton.disabled).toBe(false);
  });

  it("tapping a card while enabled still works end to end (the keypad itself is unaffected by the new messaging)", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <CardEntryPad />
      </InvestigationProvider>
    );

    const aceButton = await screen.findByRole("button", { name: "A" });
    await act(async () => {
      aceButton.click();
    });

    await waitFor(() => screen.getByText("Dealer: A"));
  });
});

// @vitest-environment jsdom
//
// Count-first UI pass regression coverage: the primary Hi-Lo RC/TC block
// must render as the visually dominant element (large, centered, not
// jammed against the left edge), with restrained semantic coloring on the
// VALUES only (positive/zero/negative), and the secondary chip row must
// never require horizontal scrolling on a phone. This file does not
// recompute or re-verify count MATH — that's the counting-engine's own
// test suite; this only proves CountSummaryPanel renders whatever the
// engine already calculated, correctly labeled and colored.
import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InvestigationProvider } from "@/contexts/InvestigationContext";
import { addCardToRound } from "@/lib/db/repositories/cardEvents";
import { createInvestigation, getInvestigation } from "@/lib/db/repositories/investigations";
import { CountSummaryPanel } from "./CountSummaryPanel";

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

function dealerCard(investigationId: string, roundId: string, rank: "2" | "10" | "A") {
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

describe("CountSummaryPanel — primary count rendering", () => {
  it("renders the primary system's label, and RC/TC both start at 0 on a fresh shoe", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <CountSummaryPanel />
      </InvestigationProvider>
    );

    await screen.findByText("HI-LO");
    await waitFor(() => expect(screen.getByLabelText("HI-LO running count").textContent).toBe("0"));
    const tcWrapper = screen.getByText("TC").parentElement as HTMLElement;
    within(tcWrapper).getByText("0");
  });

  it("every other counting system, Aces Seen, and Decks Remaining render as secondary chips", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <CountSummaryPanel />
      </InvestigationProvider>
    );

    await waitFor(() => screen.getByText("KO"));
    screen.getByText("ZEN");
    screen.getByText("OMEGA");
    screen.getByText("ACES");
    screen.getByText("DECKS");
  });

  it("the secondary chip row wraps instead of scrolling horizontally — no overflow-x-auto anywhere in the strip", async () => {
    const investigationId = await freshInvestigationId();
    const { container } = render(
      <InvestigationProvider investigationId={investigationId}>
        <CountSummaryPanel />
      </InvestigationProvider>
    );

    await waitFor(() => screen.getByText("KO"));
    expect(container.querySelector(".overflow-x-auto")).toBeNull();
    const chipRow = screen.getByText("KO").closest("div");
    expect(chipRow?.className).toMatch(/flex-wrap/);
  });
});

describe("CountSummaryPanel — semantic positive/zero/negative treatment", () => {
  it("a zero count renders in the neutral (foreground) color, not muted and not signed either direction", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <CountSummaryPanel />
      </InvestigationProvider>
    );

    const rc = await screen.findByLabelText("HI-LO running count");
    expect(rc.textContent).toBe("0");
    expect(rc.className).toMatch(/text-foreground/);
    expect(rc.className).not.toMatch(/text-status-green|text-destructive/);
  });

  it("a positive running count renders in the green/teal family (text-status-green)", async () => {
    const investigationId = await freshInvestigationId();
    const inv = await getInvestigation(investigationId);
    const roundId = inv!.rounds[0].id;
    // Low cards (2-6) are +1 each in Hi-Lo.
    await dealerCard(investigationId, roundId, "2");
    await dealerCard(investigationId, roundId, "2");

    render(
      <InvestigationProvider investigationId={investigationId}>
        <CountSummaryPanel />
      </InvestigationProvider>
    );

    const rc = await screen.findByLabelText("HI-LO running count");
    await waitFor(() => expect(rc.textContent).toBe("+2"));
    expect(rc.className).toMatch(/text-status-green/);
    expect(rc.className).not.toMatch(/text-destructive/);
  });

  it("a negative running count renders in the red/orange family (text-destructive)", async () => {
    const investigationId = await freshInvestigationId();
    const inv = await getInvestigation(investigationId);
    const roundId = inv!.rounds[0].id;
    // High cards (10/A) are -1 each in Hi-Lo.
    await dealerCard(investigationId, roundId, "10");
    await dealerCard(investigationId, roundId, "A");

    render(
      <InvestigationProvider investigationId={investigationId}>
        <CountSummaryPanel />
      </InvestigationProvider>
    );

    const rc = await screen.findByLabelText("HI-LO running count");
    await waitFor(() => expect(rc.textContent).toBe("-2"));
    expect(rc.className).toMatch(/text-destructive/);
    expect(rc.className).not.toMatch(/text-status-green/);
  });

  it("a secondary system's running count also picks up the same positive/negative coloring as the primary", async () => {
    // ZEN (a balanced system, unlike KO which seeds a non-zero initial
    // running count for a multi-deck shoe) tags rank 2 as +1, same
    // direction as Hi-Lo, so both land on the green family together.
    const investigationId = await freshInvestigationId();
    const inv = await getInvestigation(investigationId);
    const roundId = inv!.rounds[0].id;
    await dealerCard(investigationId, roundId, "2");
    await dealerCard(investigationId, roundId, "2");

    render(
      <InvestigationProvider investigationId={investigationId}>
        <CountSummaryPanel />
      </InvestigationProvider>
    );

    await waitFor(() => screen.getByText("ZEN"));
    const zenChip = screen.getByText("ZEN").parentElement as HTMLElement;
    const zenValue = within(zenChip).getByText("+2");
    expect(zenValue.className).toMatch(/text-status-green/);
  });
});

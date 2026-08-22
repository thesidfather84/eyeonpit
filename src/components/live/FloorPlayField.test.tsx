// @vitest-environment jsdom
//
// AGENTS.md 1.14b §3-5/§19 — FloorPlayField gained a one-shot Edit Mode
// (reusing SeatOptionsSheet unchanged, exactly like TableMap does) so
// "player leaves" is reachable from Floor, plus a per-seat wager readout.
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InvestigationProvider } from "@/contexts/InvestigationContext";
import { createInvestigation, getInvestigation, occupySeat, updateSeatBet } from "@/lib/db/repositories/investigations";
import { FloorPlayField } from "./FloorPlayField";

async function freshInvestigationId(): Promise<string> {
  const inv = await createInvestigation({
    casino: "",
    tableNumber: "111",
    dealerName: "",
    investigationDate: "2026-08-22",
    operatorName: "",
    countingSystem: "Hi-Lo",
    shoeTotalDecks: 6,
    status: "active",
  });
  return inv.localId;
}

describe("FloorPlayField — tap to occupy (unchanged default behavior)", () => {
  it("tapping an empty spot occupies it", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <FloorPlayField />
      </InvestigationProvider>
    );

    const seat3 = await screen.findByTestId("floor-seat-3");
    await act(async () => {
      seat3.click();
    });

    await waitFor(async () => {
      const updated = await getInvestigation(investigationId);
      expect(updated!.occupiedSeats).toContain(3);
    });
  });
});

describe("FloorPlayField — Edit Mode (AGENTS.md 1.14b §3/§5)", () => {
  it("a normal tap on an occupied spot selects it, NOT mark-empty — Edit Mode must be deliberately entered first", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeat(investigationId, 3);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <FloorPlayField />
      </InvestigationProvider>
    );

    const seat3 = await screen.findByTestId("floor-seat-3");
    await act(async () => {
      seat3.click();
    });

    const stillOccupied = await getInvestigation(investigationId);
    expect(stillOccupied!.occupiedSeats).toContain(3);
    expect(screen.queryByText("Mark Empty")).toBeNull();
  });

  it("toggling Edit Mode then tapping an occupied spot opens SeatOptionsSheet with Mark Empty reachable", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeat(investigationId, 3);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <FloorPlayField />
      </InvestigationProvider>
    );

    const editToggle = await screen.findByTestId("floor-edit-mode-toggle");
    await act(async () => {
      editToggle.click();
    });
    await screen.findByText("EDIT MODE — tap a spot for options");

    const seat3 = await screen.findByTestId("floor-seat-3");
    await act(async () => {
      seat3.click();
    });

    await screen.findByText("Mark Empty");
  });

  it("PLAYER LEAVES: Mark Empty via Edit Mode empties the spot, and Edit Mode auto-exits (one-shot, never lingers)", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeat(investigationId, 3);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <FloorPlayField />
      </InvestigationProvider>
    );

    (await screen.findByTestId("floor-edit-mode-toggle")).click();
    await act(async () => {
      (await screen.findByTestId("floor-seat-3")).click();
    });
    const markEmpty = await screen.findByText("Mark Empty");
    await act(async () => {
      markEmpty.click();
    });

    await waitFor(async () => {
      const updated = await getInvestigation(investigationId);
      expect(updated!.occupiedSeats).not.toContain(3);
    });

    // Edit Mode banner must be gone — a forgotten "still editing" state
    // must never turn the operator's next ordinary tap into a surprise sheet.
    expect(screen.queryByText("EDIT MODE — tap a spot for options")).toBeNull();
  });
});

describe("FloorPlayField — wager visibility (AGENTS.md 1.14b §18)", () => {
  it("an occupied seat with a recorded wager shows its dollar amount on the tile", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeat(investigationId, 1);
    const inv = await getInvestigation(investigationId);
    const round = inv!.rounds[0];
    await updateSeatBet(investigationId, round.id, 1, 75, { direction: "first", amount: null, overridden: false });

    render(
      <InvestigationProvider investigationId={investigationId}>
        <FloorPlayField />
      </InvestigationProvider>
    );

    await waitFor(() => screen.getByText("$75"));
  });

  it("an occupied seat with no wager yet shows no dollar amount", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeat(investigationId, 1);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <FloorPlayField />
      </InvestigationProvider>
    );

    await screen.findByTestId("floor-seat-1");
    expect(screen.queryByText(/^\$/)).toBeNull();
  });
});

describe("CASE K — player movement via Floor's UI: Seat 3 leaves, Seat 5 sits", () => {
  it("deterministic final occupancy — Seat 3 empty, Seat 5 occupied", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeat(investigationId, 3);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <FloorPlayField />
      </InvestigationProvider>
    );

    (await screen.findByTestId("floor-edit-mode-toggle")).click();
    await act(async () => {
      (await screen.findByTestId("floor-seat-3")).click();
    });
    await act(async () => {
      (await screen.findByText("Mark Empty")).click();
    });

    await act(async () => {
      (await screen.findByTestId("floor-seat-5")).click();
    });

    await waitFor(async () => {
      const updated = await getInvestigation(investigationId);
      expect(updated!.occupiedSeats).toEqual([5]);
    });
  });
});

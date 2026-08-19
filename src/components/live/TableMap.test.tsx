// @vitest-environment jsdom
//
// Regression coverage for the per-tile "⋮"/"⋯" option buttons being
// replaced by a single table-level Edit Mode toggle: a normal tap must
// always just select/occupy (never open a sheet by accident), Edit Mode
// must visibly change what the *next* tap does, and opening a sheet from
// Edit Mode must immediately exit it again (one-shot, never a lingering
// "still editing" state).
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InvestigationProvider, useInvestigationContext } from "@/contexts/InvestigationContext";
import { createInvestigation, occupySeat } from "@/lib/db/repositories/investigations";
import { TableMap } from "./TableMap";

async function freshInvestigationId(): Promise<string> {
  const inv = await createInvestigation({
    casino: "",
    tableNumber: "",
    dealerName: "",
    investigationDate: "2026-08-09",
    operatorName: "",
    countingSystem: "Hi-Lo",
    shoeTotalDecks: 6,
    status: "active",
  });
  return inv.localId;
}

function ActiveTargetProbe() {
  const { activeTarget } = useInvestigationContext();
  return <div data-testid="active-target">{String(activeTarget)}</div>;
}

function editToggle() {
  return screen.getByRole("button", { name: /Edit Seats & Dealer|Exit Edit Mode/ });
}

describe("TableMap — normal tap", () => {
  it("tapping an empty seat occupies/selects it, and opens no options sheet", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <TableMap />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    const seat3 = await screen.findByRole("button", { name: "Spot 3" });

    await act(async () => {
      seat3.click();
    });

    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("3"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("tapping an already-occupied seat just selects it — no sheet opens", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeat(investigationId, 2);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <TableMap />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    const seat2 = await screen.findByRole("button", { name: "Spot 2" });

    await act(async () => {
      seat2.click();
    });

    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("2"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("tapping the dealer selects it, and opens no options sheet", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <TableMap />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    const dealer = await screen.findByRole("button", { name: "Dealer" });

    await act(async () => {
      dealer.click();
    });

    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("dealer"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("no per-tile options icon buttons exist anymore — Edit Mode is the only way in", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <TableMap />
      </InvestigationProvider>
    );
    await screen.findByRole("button", { name: "Spot 1" });

    expect(screen.queryByRole("button", { name: "Spot 1 options" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Dealer options" })).toBeNull();
  });
});

describe("TableMap — Edit Mode", () => {
  it("toggling Edit Mode on relabels seats/dealer as '<x> options' and highlights the toggle (aria-pressed)", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <TableMap />
      </InvestigationProvider>
    );
    await screen.findByRole("button", { name: "Spot 1" });

    await act(async () => {
      editToggle().click();
    });

    expect(editToggle().getAttribute("aria-pressed")).toBe("true");
    screen.getByRole("button", { name: "Spot 1 options" });
    screen.getByRole("button", { name: "Dealer options" });
  });

  it("a seat tap while Edit Mode is active opens that seat's options sheet instead of selecting it, and exits Edit Mode immediately", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <TableMap />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await screen.findByRole("button", { name: "Spot 4" });

    await act(async () => {
      editToggle().click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "Spot 4 options" }).click();
    });

    // The sheet opened...
    await waitFor(() => screen.getByRole("dialog", { name: "Spot 4 (empty)" }));
    // ...the seat was never selected as the active target by this tap...
    expect(screen.getByTestId("active-target").textContent).toBe("dealer");
    // ...and Edit Mode is already off again, one-shot.
    expect(editToggle().getAttribute("aria-pressed")).toBe("false");
  });

  it("a dealer tap while Edit Mode is active opens DealerOptionsSheet instead of selecting the dealer, and exits Edit Mode immediately", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeat(investigationId, 1); // start on a seat, so "dealer selected" would be an observable change if it wrongly happened
    render(
      <InvestigationProvider investigationId={investigationId}>
        <TableMap />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await screen.findByRole("button", { name: "Spot 1" });

    await act(async () => {
      editToggle().click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "Dealer options" }).click();
    });

    await waitFor(() => screen.getByRole("dialog", { name: "Dealer Options" }));
    expect(editToggle().getAttribute("aria-pressed")).toBe("false");
  });

  it("toggling Edit Mode off again without tapping a tile leaves normal tap behavior intact", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <TableMap />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await screen.findByRole("button", { name: "Spot 5" });

    await act(async () => {
      editToggle().click(); // on
    });
    await act(async () => {
      editToggle().click(); // off again, no tile tapped in between
    });

    expect(editToggle().getAttribute("aria-pressed")).toBe("false");
    await act(async () => {
      screen.getByRole("button", { name: "Spot 5" }).click();
    });
    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("5"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

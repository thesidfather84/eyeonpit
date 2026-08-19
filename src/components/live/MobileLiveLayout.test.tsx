// @vitest-environment jsdom
//
// Regression coverage for the mobile-layout fix: the count strip
// (CountSummaryPanel) and the primary round controls (Done/Next/Undo) must
// render unconditionally alongside CardEntryPad — never behind a toggle,
// never omitted — and a real tap sequence through the keypad must still
// update the visible Hi-Lo running count. jsdom has no layout engine, so it
// can't assert pixel-level "nothing is clipped" (that was verified against
// a real Chromium render at the required breakpoints); what it can assert,
// and regress-guard, is that these controls are always present in the DOM
// and that the keypad -> ledger -> count-strip wiring still works.
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InvestigationProvider, useInvestigationContext } from "@/contexts/InvestigationContext";
import {
  createInvestigation,
  occupySeat,
  linkSeats,
} from "@/lib/db/repositories/investigations";
import { CountSummaryPanel } from "./CountSummaryPanel";
import { CardEntryPad } from "./CardEntryPad";
import { RoundControlsRow } from "./RoundControlsRow";
import { PlayerDetailSheet } from "./PlayerDetailSheet";

async function freshInvestigationId(): Promise<string> {
  const inv = await createInvestigation({
    casino: "",
    tableNumber: "",
    dealerName: "",
    investigationDate: "2026-07-31",
    operatorName: "",
    countingSystem: "Hi-Lo",
    shoeTotalDecks: 6,
    status: "active",
  });
  return inv.localId;
}

/** Read-only probe: exposes seat 2's current-round bet so the test can
 * confirm "apply to linked spots" actually reached the real ledger, not
 * just that a button rendered. */
function Seat2BetProbe() {
  const { currentRound } = useInvestigationContext();
  return <div data-testid="seat2-bet">{currentRound.seats[2]?.betAmount ?? "none"}</div>;
}

function LiveEntrySurface() {
  return (
    <div>
      <CountSummaryPanel />
      <RoundControlsRow />
      <CardEntryPad />
    </div>
  );
}

describe("live entry surface — mobile layout regression", () => {
  it("count strip and Done/Next/Undo render unconditionally, not behind a menu", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <LiveEntrySurface />
      </InvestigationProvider>
    );

    await waitFor(() => expect(screen.getByLabelText("HI-LO running count").textContent).toBe("0"));

    // Primary round controls must be plain, always-rendered buttons — never
    // gated behind the "More round actions" overflow toggle. getByRole
    // throws if the element isn't found, so reaching the next line proves
    // presence.
    screen.getByRole("button", { name: "Done — complete this round" });
    screen.getByRole("button", { name: "Next" });
    screen.getByRole("button", { name: "Undo" });

    // The keypad must be present with all ten ranks tappable.
    for (const rank of ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"]) {
      const button = screen.getByRole("button", { name: rank }) as HTMLButtonElement;
      expect(button.disabled).toBe(false);
    }
  });

  it("tapping 2, 3, 10 on the dealer keypad updates the visible Hi-Lo running count to +1", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <LiveEntrySurface />
      </InvestigationProvider>
    );

    await waitFor(() => expect(screen.getByLabelText("HI-LO running count").textContent).toBe("0"));

    for (const rank of ["2", "3", "10"]) {
      const button = screen.getByRole("button", { name: rank });
      await act(async () => {
        button.click();
      });
    }

    await waitFor(() => expect(screen.getByLabelText("HI-LO running count").textContent).toBe("+1"));

    const rcTc = screen.getByText("RC").parentElement as HTMLElement;
    within(rcTc).getByText("+1");
  });

  it("Apply to linked spots is reachable from the Player Details sheet (one sheet, both layouts now), and actually applies the bet", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeat(investigationId, 1);
    await occupySeat(investigationId, 2);
    await linkSeats(investigationId, 1, 2);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <PlayerDetailSheet open onClose={() => {}} target={1} />
        <Seat2BetProbe />
      </InvestigationProvider>
    );

    // Set seat 1's bet through the real QuickBetPanel chip tap, now
    // reached through the sheet rather than a standalone render — same
    // underlying component/path an operator uses either way.
    await waitFor(() => screen.getByRole("button", { name: "$25" }));
    await act(async () => {
      screen.getByRole("button", { name: "$25" }).click();
    });
    await waitFor(() => expect(screen.getByTestId("seat2-bet").textContent).toBe("none"));

    const dialog = screen.getByRole("dialog", { name: "Spot 1 — Player Details" });
    const applyButton = await within(dialog).findByRole("button", {
      name: "Apply $25 to all 2 linked spots",
    });
    expect((applyButton as HTMLButtonElement).disabled).toBe(false);

    await act(async () => {
      applyButton.click();
    });

    // Confirms this isn't just a rendered button — it drove the real
    // applyBetToLinkedSpots() and updated seat 2's actual ledger record.
    await waitFor(() => expect(screen.getByTestId("seat2-bet").textContent).toBe("25"));
  });

  it("Apply to linked spots does not render when the active seat has no linked partner", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeat(investigationId, 1);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <PlayerDetailSheet open onClose={() => {}} target={1} />
      </InvestigationProvider>
    );

    const dialog = await screen.findByRole("dialog", { name: "Spot 1 — Player Details" });
    // Proves the sheet actually rendered QuickBetPanel's real controls,
    // not just an empty dialog shell, before asserting the linked-spots
    // button is absent.
    await within(dialog).findByRole("button", { name: "$25" });
    expect(within(dialog).queryByText(/Apply \$/)).toBeNull();
  });
});

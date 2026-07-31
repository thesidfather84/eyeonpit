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
import { InvestigationProvider } from "@/contexts/InvestigationContext";
import { createInvestigation } from "@/lib/db/repositories/investigations";
import { CountSummaryPanel } from "./CountSummaryPanel";
import { CardEntryPad } from "./CardEntryPad";
import { RoundControlsRow } from "./RoundControlsRow";

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
});

// @vitest-environment jsdom
//
// AGENTS.md 1.14a §4/§8 — "Dealer Change" is EyeOnPit's real "Next Dealer"
// transition: beyond logging a table event, it must actually update
// investigation.dealerName, and it must never touch shoeNumber/CardEvents.
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InvestigationProvider } from "@/contexts/InvestigationContext";
import { createInvestigation, getInvestigation } from "@/lib/db/repositories/investigations";
import { getCardEventsForInvestigation } from "@/lib/db/repositories/cardEvents";
import { TableEventsSheet } from "./TableEventsSheet";

// Setting `.value` directly and dispatching a plain "input" event doesn't
// trigger React's onChange — React's value tracker only fires it when the
// value actually changed FROM React's own perspective, which requires going
// through the real HTMLInputElement prototype setter (bypassing whatever
// instrumentation a plain assignment would leave in place).
function typeIntoInput(input: HTMLElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function freshInvestigationId(): Promise<string> {
  const inv = await createInvestigation({
    casino: "",
    tableNumber: "111",
    dealerName: "Dealer A",
    investigationDate: "2026-08-22",
    operatorName: "",
    countingSystem: "Hi-Lo",
    shoeTotalDecks: 6,
    status: "active",
  });
  return inv.localId;
}

describe("TableEventsSheet — Dealer Change", () => {
  it("typing a new dealer name and logging it updates investigation.dealerName", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <TableEventsSheet onClose={() => {}} />
      </InvestigationProvider>
    );

    const dealerButton = await screen.findByText("Dealer Change");
    dealerButton.click();

    typeIntoInput(await screen.findByPlaceholderText("New dealer name/badge #"), "Dealer B");

    const logButton = await screen.findByText("Log");
    logButton.click();

    await waitFor(async () => {
      const updated = await getInvestigation(investigationId);
      expect(updated!.dealerName).toBe("Dealer B");
    });
  });

  it("does not create or affect any CardEvent", async () => {
    const investigationId = await freshInvestigationId();
    const eventsBefore = await getCardEventsForInvestigation(investigationId);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <TableEventsSheet onClose={() => {}} />
      </InvestigationProvider>
    );

    (await screen.findByText("Dealer Change")).click();
    typeIntoInput(await screen.findByPlaceholderText("New dealer name/badge #"), "Dealer B");
    (await screen.findByText("Log")).click();

    await waitFor(async () => {
      const updated = await getInvestigation(investigationId);
      expect(updated!.dealerName).toBe("Dealer B");
    });

    const eventsAfter = await getCardEventsForInvestigation(investigationId);
    expect(eventsAfter).toEqual(eventsBefore);
  });

  it("the Log button stays disabled for Dealer Change until a name is entered — an empty submission can't blank the dealer", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <TableEventsSheet onClose={() => {}} />
      </InvestigationProvider>
    );

    (await screen.findByText("Dealer Change")).click();
    const logButton = (await screen.findByText("Log")) as HTMLButtonElement;
    expect(logButton.disabled).toBe(true);

    const updated = await getInvestigation(investigationId);
    expect(updated!.dealerName).toBe("Dealer A"); // unchanged
  });
});

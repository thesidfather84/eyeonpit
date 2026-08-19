// @vitest-environment jsdom
//
// PRIORITY 1.9-14 — dedicated terminology-leak regression tests. "No
// normal operator-facing surface may display S1...S7" — this file renders
// real operator surfaces (not isolated strings) and scans the RENDERED
// text for the bare internal shorthand, distinct from — and in addition
// to — the per-component assertions already updated throughout
// LiveScreen.test.tsx/FloorScreen.test.tsx/TableMap.test.tsx/etc.
//
// The regex used, `\bS[1-7]\b`, is deliberately word-boundary-anchored so
// it does NOT false-positive on legitimate substrings that happen to
// contain "S" next to a digit 1-7 — most notably "S17" (the dealer-stands-
// on-17 rule label shown in LiveHeader's game config summary): matching
// "S1" inside "S17" requires a word boundary immediately after the "1,"
// but the following "7" is also a word character, so there is no boundary
// there and the pattern correctly does not match. Internal application
// state (seatNumber props, Dexie keys, activeTarget) legitimately still
// contains bare seat numbers — this file never asserts against internal
// state, only rendered DOM text, and separately proves internal IDs still
// work correctly (clicking "Spot 3" still targets seat 3 internally).
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InvestigationProvider } from "@/contexts/InvestigationContext";
import { LockProvider } from "@/contexts/LockContext";
import { EntryLockProvider } from "@/contexts/EntryLockContext";
import { createInvestigation, occupySeat, updateInvestigation } from "@/lib/db/repositories/investigations";
import { LiveScreen } from "./LiveScreen";
import { FloorScreen } from "./FloorScreen";
import { ReportPreview } from "@/components/report/ReportPreview";
import { buildReportFromInvestigation } from "@/lib/reporting/reportBuilder";

const BARE_SEAT_SHORTHAND = /\bS[1-7]\b/;

async function freshOccupiedInvestigation(): Promise<string> {
  const inv = await createInvestigation({
    casino: "Test Casino",
    tableNumber: "BJ-1",
    dealerName: "",
    investigationDate: "2026-08-19",
    operatorName: "",
    countingSystem: "Hi-Lo",
    shoeTotalDecks: 6,
    status: "active",
  });
  // Occupy several seats, including the active one, and a split-eligible
  // one, so every visible seat state (empty/occupied/active/split-capable)
  // gets exercised in one render.
  await occupySeat(inv.localId, 1);
  await occupySeat(inv.localId, 3);
  await occupySeat(inv.localId, 5);
  await updateInvestigation(inv.localId, { activeTarget: 3 });
  return inv.localId;
}

describe("Terminology leak — Surveillance (LiveScreen)", () => {
  it("renders no bare S1-S7 anywhere on screen, and Spot N appears for every occupied/active seat", async () => {
    const investigationId = await freshOccupiedInvestigation();
    const { container } = render(
      <LockProvider>
        <EntryLockProvider>
          <InvestigationProvider investigationId={investigationId}>
            <LiveScreen />
          </InvestigationProvider>
        </EntryLockProvider>
      </LockProvider>
    );

    // "SPOT 3" legitimately renders in more than one place at once (the
    // ActiveSeatHeader AND the SeatTilesRow tile), so a page-wide
    // findByText/getByText — which throws on multiple matches — is the
    // wrong tool here. Wait on the raw container text instead.
    await waitFor(() => expect(container.textContent).toContain("SPOT 3"));
    expect(BARE_SEAT_SHORTHAND.test(container.textContent ?? "")).toBe(false);
    expect(container.textContent).toContain("SPOT 1");
    expect(container.textContent).toContain("SPOT 3");
    expect(container.textContent).toContain("SPOT 5");
    // "S17" (dealer-stands-on-17 rule label) is a legitimate, unrelated
    // substring this test must NOT be tripped up by — confirms it's
    // actually present (so the negative assertion above is meaningful,
    // not vacuously true because the label never rendered).
    expect(container.textContent).toContain("S17");
  });

  it("clicking a Spot tile still activates the correct internal seat number — display text changed, internal IDs did not", async () => {
    const investigationId = await freshOccupiedInvestigation();
    render(
      <LockProvider>
        <EntryLockProvider>
          <InvestigationProvider investigationId={investigationId}>
            <LiveScreen />
          </InvestigationProvider>
        </EntryLockProvider>
      </LockProvider>
    );

    const spot5 = await screen.findByRole("button", { name: "Spot 5" });
    await act(async () => {
      spot5.click();
    });

    const header = await screen.findByTestId("active-seat-header");
    await within(header).findByText(/SPOT 5/);

    const { getInvestigation } = await import("@/lib/db/repositories/investigations");
    const updated = await getInvestigation(investigationId);
    expect(updated!.activeTarget).toBe(5); // the real internal identifier, unaffected by display text
  });
});

describe("Terminology leak — Floor Mode (FloorScreen)", () => {
  it("renders no bare S1-S7 anywhere on screen", async () => {
    const investigationId = await freshOccupiedInvestigation();
    const { container } = render(
      <InvestigationProvider investigationId={investigationId}>
        <FloorScreen />
      </InvestigationProvider>
    );

    await waitFor(() => expect(container.textContent).toContain("SPOT 3"));
    expect(BARE_SEAT_SHORTHAND.test(container.textContent ?? "")).toBe(false);
  });
});

describe("Terminology leak — Report Preview (with 1.7 player-analytics attached)", () => {
  it("renders no bare S1-S7 anywhere in the report, including the experimental Counter Analysis section", async () => {
    const investigationId = await freshOccupiedInvestigation();
    const { getInvestigation } = await import("@/lib/db/repositories/investigations");
    const investigation = await getInvestigation(investigationId);
    const report = buildReportFromInvestigation({ investigation: investigation!, cardEvents: [] });
    const withAnalytics = {
      ...report,
      analysis: {
        counterAnalysisBySeat: [
          {
            seatNumber: 3,
            playerGroupId: null,
            classification: "MODERATE" as const,
            confidenceScore: 0.4,
            reasonCodes: [],
            strongestContributingSignals: [],
            contradictorySignals: [],
            engineVersion: 1,
          },
        ],
        methodology: {
          playerObservationSchemaVersion: 1,
          confidenceEngineVersion: 1,
          validationStatus: "EXPERIMENTAL_NOT_VALIDATED" as const,
          limitations: ["Test limitation."],
        },
      },
    };

    const { container } = render(<ReportPreview report={withAnalytics} />);

    await screen.findByText("Counter Analysis");
    expect(container.textContent).toContain("Spot 3");
    expect(BARE_SEAT_SHORTHAND.test(container.textContent ?? "")).toBe(false);
  });
});

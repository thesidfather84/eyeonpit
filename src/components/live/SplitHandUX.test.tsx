// @vitest-environment jsdom
//
// EyeOnPit 1.10 Phase 3 — split-hand operator UX. Drives the real
// LiveScreen tree (ActiveSeatHeader, PlayerDetailBar, PlayerDetailSheet,
// PlayerActionsRow, SeatTilesRow all wired together exactly as production
// renders them) — not isolated components — so these tests prove the real
// operator-visible behavior, not just each component's own internal logic.
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InvestigationProvider } from "@/contexts/InvestigationContext";
import { LockProvider } from "@/contexts/LockContext";
import { EntryLockProvider } from "@/contexts/EntryLockContext";
import { createInvestigation, occupySeat, splitSeat, updateInvestigation, updateSeatBet } from "@/lib/db/repositories/investigations";
import { LiveScreen } from "./LiveScreen";

async function freshInvestigationId(): Promise<string> {
  const inv = await createInvestigation({
    casino: "",
    tableNumber: "",
    dealerName: "",
    investigationDate: "2026-08-20",
    operatorName: "",
    countingSystem: "Hi-Lo",
    shoeTotalDecks: 6,
    status: "active",
  });
  return inv.localId;
}

async function occupyAndActivate(investigationId: string, seat: number) {
  await occupySeat(investigationId, seat);
  await updateInvestigation(investigationId, { activeTarget: seat });
}

function renderLive(investigationId: string) {
  return render(
    <LockProvider>
      <EntryLockProvider>
        <InvestigationProvider investigationId={investigationId}>
          <LiveScreen />
        </InvestigationProvider>
      </EntryLockProvider>
    </LockProvider>
  );
}

describe("Split-hand UX — unsplit seats are completely unchanged", () => {
  it("an unsplit occupied seat shows plain SPOT n, no HAND 1/HAND 2 switcher, no split badge on the tile", async () => {
    const investigationId = await freshInvestigationId();
    await occupyAndActivate(investigationId, 2);
    renderLive(investigationId);

    const header = await screen.findByTestId("active-seat-header");
    within(header).getByText(/SPOT 2/);
    expect(screen.queryByTestId("select-hand-1")).toBeNull();
    expect(screen.queryByTestId("select-hand-2")).toBeNull();
    expect(screen.queryByText("HAND 1")).toBeNull();
    expect(screen.queryByText("HAND 2")).toBeNull();
  });

  it("the compact player-detail bar and dialog title are unchanged for an unsplit seat (existing behavior preserved)", async () => {
    const investigationId = await freshInvestigationId();
    await occupyAndActivate(investigationId, 1);
    renderLive(investigationId);

    const bar = await screen.findByTestId("player-detail-bar");
    expect(bar.textContent).not.toContain("HAND");

    await act(async () => {
      bar.click();
    });
    await screen.findByRole("dialog", { name: "Spot 1 — Player Details" });
    expect(screen.queryByText(/Actions below apply to/)).toBeNull();
  });
});

describe("Split-hand UX — a split seat clearly shows both hands", () => {
  async function setUp(): Promise<string> {
    const investigationId = await freshInvestigationId();
    await occupyAndActivate(investigationId, 3);
    const round = (await import("@/lib/db/repositories/investigations")).getInvestigation;
    const inv = await round(investigationId);
    await updateSeatBet(investigationId, inv!.rounds[0].id, 3, 25, { direction: "first", amount: 25, overridden: false });
    await splitSeat(investigationId, inv!.rounds[0].id, 3);
    return investigationId;
  }

  it("ActiveSeatHeader shows explicit HAND 1 and HAND 2 controls, spelled out in full — never bare shorthand as the primary label", async () => {
    const investigationId = await setUp();
    renderLive(investigationId);

    const header = await screen.findByTestId("active-seat-header");
    within(header).getByText("HAND 1");
    within(header).getByText("HAND 2");
    // The primary label is never bare "H1"/"H2" — only the fully spelled-out form.
    expect(within(header).queryByText("H1")).toBeNull();
    expect(within(header).queryByText("H2")).toBeNull();
  });

  it("the active hand is clearly represented in the DOM (aria-pressed), not color alone", async () => {
    const investigationId = await setUp();
    renderLive(investigationId);

    const header = await screen.findByTestId("active-seat-header");
    // Hand 1 is the currently active target right after a split (activeTarget stays the primary seat).
    const hand1Button = within(header).getByTestId("select-hand-1");
    const hand2Button = within(header).getByTestId("select-hand-2");
    expect(hand1Button.getAttribute("aria-pressed")).toBe("true");
    expect(hand2Button.getAttribute("aria-pressed")).toBe("false");
  });

  it("selecting HAND 2 makes it the active target — the header, bar, and dialog all reflect it", async () => {
    const investigationId = await setUp();
    renderLive(investigationId);

    const header = await screen.findByTestId("active-seat-header");
    await act(async () => {
      within(header).getByTestId("select-hand-2").click();
    });

    await waitFor(() => expect(within(header).getByTestId("select-hand-2").getAttribute("aria-pressed")).toBe("true"));
    expect(within(header).getByTestId("select-hand-1").getAttribute("aria-pressed")).toBe("false");

    const bar = screen.getByTestId("player-detail-bar");
    expect(bar.textContent).toContain("HAND 2");

    await act(async () => {
      bar.click();
    });
    await screen.findByRole("dialog", { name: "Spot 3 · Hand 2 — Player Details" });
  });

  it("selecting HAND 1 (after having moved to Hand 2) correctly re-targets Hand 1", async () => {
    const investigationId = await setUp();
    renderLive(investigationId);

    const header = await screen.findByTestId("active-seat-header");
    await act(async () => {
      within(header).getByTestId("select-hand-2").click();
    });
    await waitFor(() => expect(within(header).getByTestId("select-hand-2").getAttribute("aria-pressed")).toBe("true"));

    await act(async () => {
      within(header).getByTestId("select-hand-1").click();
    });

    await waitFor(() => expect(within(header).getByTestId("select-hand-1").getAttribute("aria-pressed")).toBe("true"));
    expect(within(header).getByTestId("select-hand-2").getAttribute("aria-pressed")).toBe("false");
    const bar = screen.getByTestId("player-detail-bar");
    expect(bar.textContent).toContain("HAND 1");
  });

  it("the seat tile's own H2 badge is a real, working shortcut directly to Hand 2 from the table overview", async () => {
    const investigationId = await setUp();
    renderLive(investigationId);

    const badge = await screen.findByRole("button", { name: "Spot 3, Hand 2 — select" });
    await act(async () => {
      badge.click();
    });

    const header = await screen.findByTestId("active-seat-header");
    await waitFor(() => expect(within(header).getByTestId("select-hand-2").getAttribute("aria-pressed")).toBe("true"));
  });

  it("Double applies to whichever hand is currently selected, and the caption says so explicitly", async () => {
    const investigationId = await setUp();
    renderLive(investigationId);

    const header = await screen.findByTestId("active-seat-header");
    await act(async () => {
      within(header).getByTestId("select-hand-2").click();
    });
    await waitFor(() => expect(within(header).getByTestId("select-hand-2").getAttribute("aria-pressed")).toBe("true"));

    const bar = screen.getByTestId("player-detail-bar");
    await act(async () => {
      bar.click();
    });
    const dialog = await screen.findByRole("dialog", { name: "Spot 3 · Hand 2 — Player Details" });
    within(dialog).getByText("Actions below apply to Hand 2 only");

    await act(async () => {
      within(dialog).getByRole("button", { name: "Double" }).click();
    });

    // Split copies the primary hand's wager onto the new hand, so Hand 2
    // already carries its own $25 and Double flips its own `doubled` flag.
    // The clearest DOM-level proof the mutation landed on THIS hand only:
    // Hand 2's Double button is now disabled (already doubled).
    await waitFor(() =>
      expect((within(dialog).getByRole("button", { name: "Double" }) as HTMLButtonElement).disabled).toBe(true)
    );

    // Close the sheet and switch to Hand 1 — its own Double button must
    // still be enabled, proving Hand 1's state is completely untouched.
    // (Scoped to the dialog: BottomSheet's backdrop is a second, sibling
    // button that shares the same "Close" accessible name.)
    await act(async () => {
      within(dialog).getByRole("button", { name: "Close" }).click();
    });
    await act(async () => {
      within(header).getByTestId("select-hand-1").click();
    });
    await waitFor(() => expect(within(header).getByTestId("select-hand-1").getAttribute("aria-pressed")).toBe("true"));
    await act(async () => {
      screen.getByTestId("player-detail-bar").click();
    });
    const hand1Dialog = await screen.findByRole("dialog", { name: "Spot 3 · Hand 1 — Player Details" });
    await waitFor(() =>
      expect((within(hand1Dialog).getByRole("button", { name: "Double" }) as HTMLButtonElement).disabled).toBe(false)
    );
  });

  it("both HAND 1 and HAND 2 controls are simultaneously present in the DOM regardless of the short: (landscape) CSS variant — no orientation-specific JS branch drops either one", async () => {
    const investigationId = await setUp();
    renderLive(investigationId);

    // This component never conditionally RENDERS based on orientation —
    // only Tailwind's `short:` variant classes adjust sizing/spacing, which
    // never removes an element from the DOM. Both controls being present
    // and both carrying the same `short:min-h-11` class on the same
    // elements (not a second, orientation-only copy) is the actual
    // guarantee that landscape never loses either hand's control.
    const header = await screen.findByTestId("active-seat-header");
    const hand1 = within(header).getByTestId("select-hand-1");
    const hand2 = within(header).getByTestId("select-hand-2");
    expect(hand1.className).toContain("short:min-h-11");
    expect(hand2.className).toContain("short:min-h-11");
    // Both real touch targets, not just visually hinted at — at least the
    // app-wide accessible minimum in every mode.
    expect(hand1.className).toMatch(/min-h-12/);
    expect(hand2.className).toMatch(/min-h-12/);
  });
});

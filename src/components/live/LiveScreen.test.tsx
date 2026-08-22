// @vitest-environment jsdom
//
// Count-first UI pass regression coverage for LiveScreen itself: no
// permanent deck-preset row, wager/player-action controls collapsed by
// default with a working expansion path, and one unambiguous active-target
// statement (dealer or seat). These tests drive the real LiveScreen tree —
// not isolated sub-components — so a wiring mistake between LiveScreen and
// its children shows up here even if each child's own logic is correct.
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InvestigationProvider } from "@/contexts/InvestigationContext";
import { LockProvider } from "@/contexts/LockContext";
import { EntryLockProvider } from "@/contexts/EntryLockContext";
import { createInvestigation, occupySeat, updateInvestigation } from "@/lib/db/repositories/investigations";
import { LiveScreen } from "./LiveScreen";

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

/** occupySeat (repository level) does not itself change activeTarget — that's
 * a separate concern the context's own occupySeat/setActiveTarget handles.
 * Tests here need the seat to actually be the ACTIVE target too, not just
 * occupied, so this does both explicitly. */
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

describe("LiveScreen — Home navigation (AGENTS.md 1.14b UX correction round §1)", () => {
  it("has a single-tap, clearly labeled Home link back to the main entry point, using the existing lifecycle rather than a new navigation system", async () => {
    const investigationId = await freshInvestigationId();
    renderLive(investigationId);

    const home = await screen.findByRole("link", { name: "Home" });
    expect(home.getAttribute("href")).toBe("/app");
  });

  it("also has an equally obvious link to switch to Floor Mode — mode navigation is symmetric with Floor's own Surveillance link", async () => {
    const investigationId = await freshInvestigationId();
    renderLive(investigationId);

    const floorLink = await screen.findByRole("link", { name: "Switch to Floor Mode" });
    expect(floorLink.getAttribute("href")).toBe(`/investigations/${investigationId}/floor`);
  });

  it("states its own current mode plainly (SURVEILLANCE), always visible, not hidden behind a breakpoint", async () => {
    const investigationId = await freshInvestigationId();
    const { container } = renderLive(investigationId);

    await screen.findByText("SURVEILLANCE");
    // Unlike the brand wordmark, the mode label itself is never `hidden ...
    // sm:inline` — it must read on a narrow phone exactly as it does on desktop.
    const label = Array.from(container.querySelectorAll("span")).find((s) => s.textContent === "SURVEILLANCE");
    expect(label?.className).not.toMatch(/\bhidden\b/);
  });
});

describe("LiveScreen — no permanent deck-preset configuration row", () => {
  it("the old 'Decks' preset row is gone; Decks Remaining (a live count value) is unaffected and Quick Setup still reaches deck configuration", async () => {
    const investigationId = await freshInvestigationId();
    renderLive(investigationId);

    // "DECKS" (all-caps) is CountSummaryPanel's own Decks Remaining chip —
    // a live count value, deliberately unaffected by removing the preset
    // row. "Decks" (title case) was the deleted LiveDeckSelector's own
    // label — distinct literal text, so this also proves it's really gone,
    // not just relabeled.
    await waitFor(() => screen.getByText("DECKS"));
    expect(screen.queryByText("Decks")).toBeNull();

    // The functionality isn't lost — it's reachable through the existing
    // setup/options path (LiveHeader's Quick Setup button), same as every
    // other game-configuration change mid-investigation.
    screen.getByRole("button", { name: "Quick Setup" });
  });
});

describe("LiveScreen — wager/player actions collapse to one compact entry point by default", () => {
  it("with an active, occupied seat, PlayerDetailBar renders but QuickBetPanel/PlayerActionsRow controls are NOT present until opened", async () => {
    const investigationId = await freshInvestigationId();
    await occupyAndActivate(investigationId, 1);
    renderLive(investigationId);

    await waitFor(() => screen.getByTestId("player-detail-bar"));
    // Real wager chips and player-action buttons must not be in the DOM at
    // all by default — collapsed means absent, not just visually hidden,
    // for a screen this constrained on height.
    expect(screen.queryByRole("button", { name: "$25" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Double" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Split" })).toBeNull();
  });

  it("tapping the compact bar opens the SAME existing QuickBetPanel/PlayerActionsRow controls, and they still work end to end", async () => {
    const investigationId = await freshInvestigationId();
    await occupyAndActivate(investigationId, 1);
    renderLive(investigationId);

    const bar = await screen.findByTestId("player-detail-bar");
    await act(async () => {
      bar.click();
    });

    const dialog = await screen.findByRole("dialog", { name: "Spot 1 — Player Details" });
    const chip = within(dialog).getByRole("button", { name: "$25" });
    within(dialog).getByRole("button", { name: "Double" });
    within(dialog).getByRole("button", { name: "Split" });
    within(dialog).getByRole("button", { name: "Insurance" });
    within(dialog).getByRole("button", { name: "Surr." });

    // Not just rendered — actually still drives the real wager mutation.
    await act(async () => {
      chip.click();
    });
    await waitFor(() => within(dialog).getByText("$25"));
  });

  it("a compact bar with no wager yet reads SET BET; once a bet is placed it leads with BET and the amount", async () => {
    const investigationId = await freshInvestigationId();
    await occupyAndActivate(investigationId, 1);
    renderLive(investigationId);

    const bar = await screen.findByTestId("player-detail-bar");
    expect(bar.textContent).toContain("SET BET");
    expect(bar.textContent).not.toContain("$");

    await act(async () => {
      bar.click();
    });
    const dialog = await screen.findByRole("dialog", { name: "Spot 1 — Player Details" });
    await act(async () => {
      within(dialog).getByRole("button", { name: "$25" }).click();
    });

    await waitFor(() => expect(bar.textContent).toContain("BET $25"));
  });
});

describe("LiveScreen — one clear active-target statement (ActiveSeatHeader)", () => {
  it("a fresh investigation defaults to DEALER as the active target, stated exactly once", async () => {
    const investigationId = await freshInvestigationId();
    renderLive(investigationId);

    await waitFor(() => screen.getByText("DEALER"));
    screen.getByText("ENTER CARDS");
    // The old duplicated wording is gone entirely.
    expect(screen.queryByText(/ACTIVE —/)).toBeNull();
  });

  it("once a seat is occupied and active, it reads SPOT n — no repeated 'CURRENT WAGER — SPOT n' title anywhere else on screen (PRIORITY 1.9-10: Spot is now the global default, including Surveillance)", async () => {
    const investigationId = await freshInvestigationId();
    await occupyAndActivate(investigationId, 2);
    renderLive(investigationId);

    // Scoped to ActiveSeatHeader itself, since the seat tile on the table
    // map ALSO legitimately shows "ACTIVE · SPOT 2" (spatial highlight,
    // deliberately preserved — see that component's own doc comment) and
    // would otherwise collide with a page-wide text query. occupySeat
    // auto-creates a player group (e.g. "P1"), so the exact text is
    // "SPOT 2 · P1" — a regex proves the seat identity without
    // over-asserting the group label's exact value.
    const header = await screen.findByTestId("active-seat-header");
    within(header).getByText(/SPOT 2/);
    within(header).getByText("ENTER CARDS");
    expect(screen.queryByText(/CURRENT (BET|WAGER) — SPOT/)).toBeNull();
  });
});

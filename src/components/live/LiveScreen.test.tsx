// @vitest-environment jsdom
//
// Operational UI rebuild coverage for LiveScreen itself: the operational
// header stays minimal (mode/table/live only), Home/mode-switch/Settings
// live in BottomNavigation (never duplicated in the header), the count
// dashboard reads correctly, wager entry/change is discoverable from the
// active seat's own panel (never a hidden "Player Details" tap), and there
// is exactly one active-target statement (dealer or seat). These tests
// drive the real LiveScreen tree — not isolated sub-components — so a
// wiring mistake between LiveScreen and its children shows up here even if
// each child's own logic is correct.
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InvestigationProvider } from "@/contexts/InvestigationContext";
import { LockProvider } from "@/contexts/LockContext";
import { EntryLockProvider } from "@/contexts/EntryLockContext";
import { createInvestigation, occupySeat, updateInvestigation } from "@/lib/db/repositories/investigations";
import { LiveScreen } from "./LiveScreen";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

async function freshInvestigationId(): Promise<string> {
  const inv = await createInvestigation({
    casino: "",
    tableNumber: "111",
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

describe("LiveScreen — the operational header stays minimal (AGENTS.md operational UI rebuild §3)", () => {
  it("states mode, table, and live status — nothing else fights for that row", async () => {
    const investigationId = await freshInvestigationId();
    renderLive(investigationId);

    await screen.findByText("SURVEILLANCE");
    await screen.findByText("TABLE 111");
    await screen.findByText("LIVE");
  });

  it("Home, Settings, and mode-switch are NOT in the header — they live in BottomNavigation instead", async () => {
    const investigationId = await freshInvestigationId();
    renderLive(investigationId);

    await screen.findByText("SURVEILLANCE");
    const header = screen.getByText("SURVEILLANCE").closest("div")!;
    expect(within(header).queryByRole("link", { name: "Home" })).toBeNull();
    expect(within(header).queryByRole("button", { name: "Settings" })).toBeNull();
  });

  it("has a single-tap, clearly labeled Home link back to the main entry point, using the existing lifecycle rather than a new navigation system", async () => {
    const investigationId = await freshInvestigationId();
    renderLive(investigationId);

    const home = await screen.findByRole("link", { name: "Home" });
    expect(home.getAttribute("href")).toBe("/app");
  });

  it("also has an equally obvious link to switch to Floor Mode — mode navigation is symmetric with Floor's own Surveillance link", async () => {
    const investigationId = await freshInvestigationId();
    renderLive(investigationId);

    const floorLink = await screen.findByRole("link", { name: "Switch to Floor" });
    expect(floorLink.getAttribute("href")).toBe(`/investigations/${investigationId}/floor`);
  });

  it("Settings is reachable from BottomNavigation, and only from there — never duplicated in the header", async () => {
    const investigationId = await freshInvestigationId();
    renderLive(investigationId);

    const settingsButton = await screen.findByRole("button", { name: "Settings" });
    await act(async () => {
      settingsButton.click();
    });
    await screen.findByRole("dialog", { name: "Settings" });
  });

  it("tapping the table name opens the existing table/game setup sheet — Quick Setup functionality is preserved, just tied to its subject", async () => {
    const investigationId = await freshInvestigationId();
    renderLive(investigationId);

    const tableButton = await screen.findByRole("button", { name: /Table 111/ });
    await act(async () => {
      tableButton.click();
    });
    await screen.findByRole("dialog", { name: "Game Setup" });
  });
});

describe("LiveScreen — the count dashboard (AGENTS.md operational UI rebuild §4)", () => {
  it("shows HI-LO RC/TC prominently and the secondary chip row (KO/ZEN/OMEGA/ACES/DECKS)", async () => {
    const investigationId = await freshInvestigationId();
    renderLive(investigationId);

    await screen.findByTestId("count-dashboard");
    await waitFor(() => screen.getByText("HI-LO"));
    screen.getByText("RC");
    screen.getByText("TC");
    screen.getByText("KO");
    screen.getByText("ZEN");
    screen.getByText("OMEGA");
    screen.getByText("ACES");
    screen.getByText("DECKS");
  });
});

describe("LiveScreen — wager entry is discoverable from the active seat's own panel, never a hidden tap (AGENTS.md operational UI rebuild §8/§9)", () => {
  it("with an active, occupied seat, the BET is always visible and the QuickBetPanel chips are exposed directly in the middle workspace — no tap required to start betting; player-action buttons (Double/Split/...) stay behind CHANGE BET", async () => {
    const investigationId = await freshInvestigationId();
    await occupyAndActivate(investigationId, 1);
    renderLive(investigationId);

    await screen.findByTestId("active-seat-panel");
    screen.getByText("SET BET");
    // The denomination chips are live in the workspace by default — betting
    // must be immediately usable, not hidden behind a tap.
    expect(await screen.findByRole("button", { name: "$25" })).toBeTruthy();
    // Player-action buttons (Double/Split/...) are a different, less
    // frequent operation and stay collapsed behind CHANGE BET/Seat Actions.
    expect(screen.queryByRole("button", { name: "Double" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Split" })).toBeNull();
  });

  it("with the dealer active, no wager controls render anywhere on screen", async () => {
    const investigationId = await freshInvestigationId();
    renderLive(investigationId);

    await screen.findByTestId("active-seat-panel");
    expect(screen.queryByRole("button", { name: "$25" })).toBeNull();
  });

  it("with an active but unoccupied (empty) seat, no wager controls render", async () => {
    const investigationId = await freshInvestigationId();
    const { updateInvestigation } = await import("@/lib/db/repositories/investigations");
    await updateInvestigation(investigationId, { activeTarget: 3 });
    renderLive(investigationId);

    await screen.findByTestId("active-seat-panel");
    expect(screen.queryByRole("button", { name: "$25" })).toBeNull();
  });

  it("tapping CHANGE BET/SET BET opens the SAME existing QuickBetPanel/PlayerActionsRow controls, and they still work end to end", async () => {
    const investigationId = await freshInvestigationId();
    await occupyAndActivate(investigationId, 1);
    renderLive(investigationId);

    const setBetButton = await screen.findByTestId("change-bet-button");
    await act(async () => {
      setBetButton.click();
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

  it("the panel reads SET BET with no wager yet; once a bet is placed it shows the formatted amount directly, no extra tap required to see it", async () => {
    const investigationId = await freshInvestigationId();
    await occupyAndActivate(investigationId, 1);
    renderLive(investigationId);

    const panel = await screen.findByTestId("active-seat-panel");
    expect(within(panel).getByTestId("change-bet-button").textContent).toBe("SET BET");

    const setBetButton = screen.getByTestId("change-bet-button");
    await act(async () => {
      setBetButton.click();
    });
    const dialog = await screen.findByRole("dialog", { name: "Spot 1 — Player Details" });
    await act(async () => {
      within(dialog).getByRole("button", { name: "$25" }).click();
    });

    await waitFor(() => expect(within(panel).getByTestId("change-bet-button").textContent).toBe("CHANGE BET"));
    within(panel).getByText("$25");
  });
});

describe("LiveScreen — one clear active-target statement (ActiveSeatPanel)", () => {
  it("a fresh investigation defaults to DEALER as the active target, stated exactly once", async () => {
    const investigationId = await freshInvestigationId();
    renderLive(investigationId);

    const panel = await screen.findByTestId("active-seat-panel");
    within(panel).getByText("DEALER");
    await screen.findByText("ENTER CARDS FOR DEALER");
  });

  it("once a seat is occupied and active, it reads SPOT n (PRIORITY 1.9-10: Spot is the global default, including Surveillance) and CardEntryPad names the same target", async () => {
    const investigationId = await freshInvestigationId();
    await occupyAndActivate(investigationId, 2);
    renderLive(investigationId);

    // Scoped to ActiveSeatPanel itself, since the seat tile on the table
    // map ALSO legitimately shows "ACTIVE · SPOT 2" (spatial highlight,
    // deliberately preserved) and would otherwise collide with a page-wide
    // text query. occupySeat auto-creates a player group (e.g. "P1"), so
    // the exact text is "SPOT 2 · P1" — a regex proves the seat identity
    // without over-asserting the group label's exact value.
    const panel = await screen.findByTestId("active-seat-panel");
    within(panel).getByText(/SPOT 2/);
    await screen.findByText("ENTER CARDS FOR SPOT 2");
  });
});

describe("LiveScreen — seat/dealer visual vocabulary stays consistent (AGENTS.md operational UI rebuild §6/§20)", () => {
  it("an occupied, non-active seat and an empty seat use visibly different border/fill treatments, not color alone", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeat(investigationId, 1);
    renderLive(investigationId);

    const occupiedSeat = await screen.findByRole("button", { name: "Spot 1" });
    const emptySeat = await screen.findByRole("button", { name: "Spot 2" });
    expect(occupiedSeat.className).toMatch(/border-status-green/);
    expect(occupiedSeat.className).not.toMatch(/border-dashed/);
    expect(emptySeat.className).toMatch(/border-dashed/);
  });
});

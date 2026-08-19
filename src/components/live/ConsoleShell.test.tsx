// @vitest-environment jsdom
//
// PRIORITY 1.9-2/3/4/5/8 — the investigation lifecycle rule, proven at the
// component level: READY when nothing is active/paused, instant resume
// only when fresh, an explicit RESUME/START NEW choice when stale or
// ambiguous, and a COMPLETED investigation is never a candidate to
// silently re-enter, no matter how it got there (including a simulated
// browser reload). See docs/EYEONPIT_1_9_OPERATOR_LIFECYCLE.md.
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleShell } from "./ConsoleShell";
import {
  completeInvestigation,
  createInvestigation,
  listInvestigations,
  resetAllData,
  updateInvestigation,
} from "@/lib/db/repositories/investigations";
import { getDb } from "@/lib/db/client";
import { ACTIVE_INVESTIGATION_FRESHNESS_WINDOW_MS } from "@/lib/investigationLifecycle";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(async () => {
  await resetAllData();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function seedInvestigation(overrides: Partial<{ status: "active" | "paused" | "closed"; updatedAt: string }> = {}) {
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
  if (overrides.status) await updateInvestigation(inv.localId, { status: overrides.status });
  // `updateInvestigation` always overwrites `updatedAt` to "now" — bypass
  // it directly via Dexie to seed a genuinely stale timestamp for these
  // freshness-window tests.
  if (overrides.updatedAt) await getDb().investigations.update(inv.localId, { updatedAt: overrides.updatedAt });
  return inv.localId;
}

describe("ConsoleShell — clean READY state", () => {
  it("shows the clean launch screen (Quick/Floor/Advanced/Practice) when no investigation exists at all", async () => {
    render(<ConsoleShell />);
    expect(await screen.findByRole("button", { name: /QUICK/ })).toBeTruthy();
    expect(screen.queryByText(/RESUME INVESTIGATION/)).toBeNull();
  });

  it("shows the clean launch screen — never the last completed investigation's content — when only a closed investigation exists", async () => {
    await seedInvestigation({ status: "closed" });
    render(<ConsoleShell />);
    expect(await screen.findByRole("button", { name: /QUICK/ })).toBeTruthy();
    expect(screen.queryByText("Round-by-Round Evidence")).toBeNull();
    expect(screen.queryByText(/ENTER CARD/)).toBeNull();
  });
});

describe("ConsoleShell — fresh active investigation auto-resumes instantly", () => {
  it("enters the live console directly, with no confirmation step, for an investigation updated moments ago", async () => {
    await seedInvestigation({ updatedAt: new Date().toISOString() });
    render(<ConsoleShell />);
    await screen.findByText(/ENTER CARD/);
    expect(screen.queryByText(/RESUME INVESTIGATION/)).toBeNull();
  });
});

describe("ConsoleShell — stale/ambiguous investigations require an explicit choice", () => {
  it("offers RESUME / START NEW instead of silently entering a stale (past the freshness window) investigation", async () => {
    const staleTimestamp = new Date(Date.now() - ACTIVE_INVESTIGATION_FRESHNESS_WINDOW_MS - 60 * 60 * 1000).toISOString();
    await seedInvestigation({ updatedAt: staleTimestamp });

    render(<ConsoleShell />);

    await screen.findByText(/RESUME INVESTIGATION/);
    expect(screen.queryByText(/ENTER CARD/)).toBeNull();
    expect(screen.getByRole("button", { name: /START NEW INVESTIGATION/ })).toBeTruthy();
  });

  it("RESUME enters that investigation's live console", async () => {
    const staleTimestamp = new Date(Date.now() - ACTIVE_INVESTIGATION_FRESHNESS_WINDOW_MS - 60 * 60 * 1000).toISOString();
    await seedInvestigation({ updatedAt: staleTimestamp });

    render(<ConsoleShell />);
    const resumeButton = await screen.findByRole("button", { name: /RESUME INVESTIGATION/ });
    await act(async () => {
      resumeButton.click();
    });

    await screen.findByText(/ENTER CARD/);
  });

  it("START NEW shows the clean launch screen and leaves the stale investigation untouched (never destroyed)", async () => {
    const staleTimestamp = new Date(Date.now() - ACTIVE_INVESTIGATION_FRESHNESS_WINDOW_MS - 60 * 60 * 1000).toISOString();
    const staleId = await seedInvestigation({ updatedAt: staleTimestamp });

    render(<ConsoleShell />);
    const startNewButton = await screen.findByRole("button", { name: /START NEW INVESTIGATION/ });
    await act(async () => {
      startNewButton.click();
    });

    expect(await screen.findByRole("button", { name: /QUICK/ })).toBeTruthy();

    // The stale investigation is still there, still active — nothing was
    // destroyed merely because the operator chose to start fresh.
    const all = await listInvestigations();
    const stale = all.find((inv) => inv.localId === staleId);
    expect(stale).toBeTruthy();
    expect(stale!.status).toBe("active");
  });

  it("offers RESUME / START NEW when MULTIPLE active/paused investigations exist, even if one is fresh", async () => {
    await seedInvestigation({ updatedAt: new Date().toISOString() });
    await seedInvestigation({ status: "paused", updatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() });

    render(<ConsoleShell />);

    await screen.findByText(/RESUME INVESTIGATION/);
    expect(screen.queryByText(/ENTER CARD/)).toBeNull();
    screen.getByText(/other unfinished investigation/);
  });
});

describe("ConsoleShell — reload-after-completion regression (PRIORITY 1.9-8)", () => {
  it("a fresh mount never reopens a just-completed investigation as the operational workspace", async () => {
    const id = await seedInvestigation();
    await completeInvestigation(id);

    // Simulates a full browser reload: a brand-new ConsoleShell mount
    // against on-disk state where the investigation the operator just
    // finished is now `closed`.
    render(<ConsoleShell />);

    expect(await screen.findByRole("button", { name: /QUICK/ })).toBeTruthy();
    expect(screen.queryByText(/ENTER CARD/)).toBeNull();
    expect(screen.queryByText(/RESUME INVESTIGATION/)).toBeNull();
  });
});

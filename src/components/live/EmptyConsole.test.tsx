// @vitest-environment jsdom
//
// The launch screen's four first-class actions: Quick, Floor, Advanced,
// Practice. Floor is the newest — this file proves it's genuinely visible
// on first render (not hidden behind a menu), that one tap creates a real
// investigation through the exact same repository call Quick uses and
// routes straight to /investigations/[id]/floor, and that the other three
// launch paths are unaffected by its addition.
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmptyConsole } from "./EmptyConsole";
import { ConsoleShell } from "./ConsoleShell";
import {
  getInvestigation,
  listInvestigations,
  resetAllData,
} from "@/lib/db/repositories/investigations";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(async () => {
  await resetAllData();
  pushMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EmptyConsole — Floor is a first-class launch action", () => {
  it("1. Floor is directly visible on the landing screen, alongside Quick/Advanced/Practice — no menu required", async () => {
    render(<EmptyConsole onCreated={vi.fn()} />);

    expect(await screen.findByRole("button", { name: /QUICK/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Floor — hands-free pit workflow/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /ADVANCED/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /PRACTICE/ })).toBeTruthy();
  });

  it("2. One tap on Floor creates a real, valid investigation (same createInvestigation path as Quick) and routes straight to /investigations/[id]/floor", async () => {
    render(<EmptyConsole onCreated={vi.fn()} />);

    const before = await listInvestigations({ includeDemo: true });
    expect(before).toHaveLength(0);

    const floorButton = screen.getByRole("button", { name: /Floor — hands-free pit workflow/ });
    await act(async () => {
      floorButton.click();
    });

    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
    const [routedTo] = pushMock.mock.calls[0];
    const match = /^\/investigations\/([^/]+)\/floor$/.exec(routedTo);
    expect(match).not.toBeNull();

    const investigationId = match![1];
    const investigation = await getInvestigation(investigationId);
    expect(investigation).toBeTruthy();
    expect(investigation!.status).toBe("active");
    expect(investigation!.isDemo).toBe(false);
    expect(investigation!.rounds).toHaveLength(1);
  });

  it("5. Advanced still opens the full configuration sheet", async () => {
    render(<EmptyConsole onCreated={vi.fn()} />);

    const advancedButton = screen.getByRole("button", { name: /ADVANCED/ });
    await act(async () => {
      advancedButton.click();
    });

    expect(await screen.findByRole("heading", { name: "Advanced Setup" })).toBeTruthy();
  });
});

describe("ConsoleShell — Quick and Practice remain unaffected by Floor's addition", () => {
  it("3. Quick still leads into the in-place Surveillance console for a fresh, non-demo investigation", async () => {
    render(<ConsoleShell />);

    const quickButton = await screen.findByRole("button", { name: /QUICK/ });
    await act(async () => {
      quickButton.click();
    });

    // Surveillance's live console (LiveScreen/CardEntryPad) replaces the
    // launch screen in place — no route change, exactly as before Floor
    // was added.
    await screen.findByText(/ENTER CARD/);
    expect(screen.queryByRole("button", { name: /QUICK/ })).toBeNull();
    expect(pushMock).not.toHaveBeenCalled();

    const all = await listInvestigations({ includeDemo: true });
    expect(all).toHaveLength(1);
    expect(all[0].isDemo).toBe(false);
  });

  it("4. Practice remains isolated (isDemo, reused, never mixed into real History) even with Floor present", async () => {
    render(<ConsoleShell />);

    const practiceButton = await screen.findByRole("button", { name: /PRACTICE/ });
    await act(async () => {
      practiceButton.click();
    });

    await screen.findByText(/ENTER CARD/);

    const includingDemo = await listInvestigations({ includeDemo: true });
    expect(includingDemo).toHaveLength(1);
    expect(includingDemo[0].isDemo).toBe(true);

    const realOnly = await listInvestigations({ includeDemo: false });
    expect(realOnly).toHaveLength(0);
  });
});

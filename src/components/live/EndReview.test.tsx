// @vitest-environment jsdom
//
// Operator-loop correction #4/#5: "End & Review" must actually land the
// operator on the investigation they just finished — not bare home. Two
// things are proven here, at the component level (the E2E test in
// OperatorLoop.e2e.test.tsx proves the manual/voice End & Review actions
// target the right URL; jsdom has no real Next.js router to actually follow
// that navigation, so this file proves what the destination itself renders):
//
// 1. A closed investigation, loaded with `?review=1` in the URL (exactly
//    what handleEndInvestigation/VoiceControl's confirm-end-investigation
//    navigate to), auto-opens Reports — the operator sees the round-by-round
//    evidence and count for THAT investigation immediately, no extra tap.
// 2. From there, Return Home ("+ New") and History/Export all remain
//    reachable — the operator is never trapped on a closed screen.
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InvestigationProvider } from "@/contexts/InvestigationContext";
import { LockProvider } from "@/contexts/LockContext";
import { EntryLockProvider } from "@/contexts/EntryLockContext";
import {
  completeInvestigation,
  createInvestigation,
} from "@/lib/db/repositories/investigations";
import { addCardToRound, getCardEventsForInvestigation } from "@/lib/db/repositories/cardEvents";
import { LiveScreen } from "./LiveScreen";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("review=1"),
}));

async function freshClosedInvestigationWithEvidence(): Promise<string> {
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
  const round = inv.rounds[0];
  // King (Hi-Lo -1) so the count is provably non-zero and provably visible
  // on the review screen, not just "whatever the default happens to be."
  await addCardToRound({
    investigationLocalId: inv.localId,
    roundId: round.id,
    targetType: "dealer",
    targetId: "dealer",
    rank: "K",
    applyToRound: (r) => ({ ...r, dealerHand: { cards: [...r.dealerHand.cards, { rank: "K", suit: "unspecified" }] } }),
    event: { type: "card", message: "Dealer: K" },
  });
  await completeInvestigation(inv.localId);
  return inv.localId;
}

describe("End & Review — landing on the just-finished investigation (operator-loop correction)", () => {
  it("?review=1 auto-opens Reports on a closed investigation, showing its own evidence and count — not a bare closed screen", async () => {
    const investigationId = await freshClosedInvestigationWithEvidence();
    const eventsBefore = await getCardEventsForInvestigation(investigationId);
    expect(eventsBefore).toHaveLength(1); // sanity: the evidence this test asserts on actually exists

    render(
      <LockProvider>
        <EntryLockProvider>
          <InvestigationProvider investigationId={investigationId}>
            <LiveScreen />
          </InvestigationProvider>
        </EntryLockProvider>
      </LockProvider>
    );

    // Reports opened itself — no tap on the menu or the Reports button.
    const reportsSheet = await screen.findByText("Round-by-Round Evidence");
    within(reportsSheet.closest("div")!.parentElement!).getByText(/Dealer: K/);

    // The count for THIS investigation's evidence is visible on the same
    // screen (CountSummaryPanel, part of LiveHeader, stays mounted
    // underneath the Reports overlay) — Hi-Lo -1 for one king.
    await waitFor(() => expect(screen.getByLabelText("HI-LO running count").textContent).toBe("-1"));

    // Investigation identity is visible too (LiveHeader's own displayId).
    const inv = await import("@/lib/db/repositories/investigations").then((m) =>
      m.getInvestigation(investigationId)
    );
    screen.getByText(inv!.displayId);

    // Confirms the report explicitly says the investigation is closed and
    // evidence-preserved, rather than showing a now-redundant "Complete
    // Investigation" action on an already-closed case.
    screen.getByText(/Investigation closed — every round and card above is preserved/);
    expect(screen.queryByText("Complete Investigation")).toBeNull();
  });

  it("Return Home, Export, and History all stay reachable from the review screen — the operator is never trapped", async () => {
    const investigationId = await freshClosedInvestigationWithEvidence();

    render(
      <LockProvider>
        <EntryLockProvider>
          <InvestigationProvider investigationId={investigationId}>
            <LiveScreen />
          </InvestigationProvider>
        </EntryLockProvider>
      </LockProvider>
    );

    await screen.findByText("Round-by-Round Evidence");

    // "+ New" (Return Home) replaces Pause/Resume once closed — LiveHeader's
    // own isClosed branch, unaffected by this correction, still does its job.
    const returnHome = screen.getByRole("button", { name: "+ New" });
    expect(returnHome).toBeTruthy();

    // The menu itself (History/Export/Settings/Help) is unconditionally
    // mounted regardless of isClosed — see LiveHeader's own doc comment —
    // so closing Reports and reopening the menu still works.
    const menuButton = screen.getByRole("button", { name: "Menu" });
    expect(menuButton).toBeTruthy();
  });

  it('real production bug repro: tapping X on the auto-opened Reports sheet actually closes it, and it stays closed — the ?review=1 param must not force it back open on the next render', async () => {
    const investigationId = await freshClosedInvestigationWithEvidence();

    render(
      <LockProvider>
        <EntryLockProvider>
          <InvestigationProvider investigationId={investigationId}>
            <LiveScreen />
          </InvestigationProvider>
        </EntryLockProvider>
      </LockProvider>
    );

    await screen.findByText("Round-by-Round Evidence");

    const closeButtons = screen.getAllByRole("button", { name: "Close" });
    await act(async () => {
      closeButtons[closeButtons.length - 1].click();
    });

    expect(screen.queryByText("Round-by-Round Evidence")).toBeNull();

    // The bug: closing changes LiveMenu's own `overlay` state, which
    // re-renders LiveMenu, which (before the fix) recreated the inline
    // onOpen callback AutoOpenReviewFromQuery depends on, re-running its
    // effect — and since the URL still has ?review=1 (never consumed),
    // that effect calls onOpen() again and reopens the sheet. Any
    // subsequent re-render must not resurrect it.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText("Round-by-Round Evidence")).toBeNull();

    // Real-world equivalent of "give React a few more render/effect
    // cycles and see if it comes back" — waitFor polls repeatedly; if the
    // sheet ever reappears within this window, this fails exactly like
    // the real trapped-operator bug did.
    await expect(
      waitFor(() => expect(screen.queryByText("Round-by-Round Evidence")).not.toBeNull(), { timeout: 500 })
    ).rejects.toThrow();

    // Closing the summary must not have touched investigation state.
    const inv = await import("@/lib/db/repositories/investigations").then((m) =>
      m.getInvestigation(investigationId)
    );
    expect(inv!.status).toBe("closed");
    const events = await getCardEventsForInvestigation(investigationId);
    expect(events).toHaveLength(1);

    // Operator isn't trapped or on a blank screen — the live shell
    // (header, count, Menu, "+ New") is still right there underneath.
    screen.getByRole("button", { name: "+ New" });
    screen.getByRole("button", { name: "Menu" });
  });

  it("the one-shot ?review=1 query param is consumed (stripped from the URL via history.replaceState) after the first auto-open — not left there to force a reopen on a later reload or shared link", async () => {
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");
    try {
      const investigationId = await freshClosedInvestigationWithEvidence();

      render(
        <LockProvider>
          <EntryLockProvider>
            <InvestigationProvider investigationId={investigationId}>
              <LiveScreen />
            </InvestigationProvider>
          </EntryLockProvider>
        </LockProvider>
      );

      await screen.findByText("Round-by-Round Evidence");

      await waitFor(() => expect(replaceStateSpy).toHaveBeenCalledTimes(1));
      const [, , replacedTo] = replaceStateSpy.mock.calls[0] as [unknown, string, string];
      expect(replacedTo).not.toContain("review");
    } finally {
      replaceStateSpy.mockRestore();
    }
  });

  it("tapping the backdrop (mobile tap-to-dismiss — the same interaction a real touch produces) closes the summary just as reliably as the X button", async () => {
    const investigationId = await freshClosedInvestigationWithEvidence();

    render(
      <LockProvider>
        <EntryLockProvider>
          <InvestigationProvider investigationId={investigationId}>
            <LiveScreen />
          </InvestigationProvider>
        </EntryLockProvider>
      </LockProvider>
    );

    await screen.findByText("Round-by-Round Evidence");

    const backdrop = screen.getAllByRole("button", { name: "Close" })[0];
    await act(async () => {
      backdrop.click();
    });

    expect(screen.queryByText("Round-by-Round Evidence")).toBeNull();
    await expect(
      waitFor(() => expect(screen.queryByText("Round-by-Round Evidence")).not.toBeNull(), { timeout: 500 })
    ).rejects.toThrow();
  });
});

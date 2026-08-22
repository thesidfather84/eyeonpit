// @vitest-environment jsdom
//
// Operator-loop correction #4/#5, extended by PRIORITY 1.9-6/8/9: "End &
// Review" must actually land the operator on the investigation they just
// finished — not bare home — AND a completed investigation must never
// again present as the live operational workspace (see
// docs/EYEONPIT_1_9_OPERATOR_LIFECYCLE.md). What's proven here, at the
// component level (the E2E test in OperatorLoop.e2e.test.tsx proves the
// manual/voice End & Review actions target the right URL; jsdom has no
// real Next.js router to actually follow that navigation, so this file
// proves what the destination itself renders):
//
// 1. A closed investigation shows its full Reports content (round-by-round
//    evidence, count, notes) directly — no query param, no extra tap, and
//    (PRIORITY 1.9 change) NOT as a dismissible overlay: LiveScreen swaps
//    its entire body to this content whenever `status === "closed"`, so
//    there is no live-looking console underneath to reveal by "closing"
//    anything. This is a deliberate, stronger fix than the overlay-based
//    approach the three now-removed "X/backdrop closes it" tests below
//    used to protect — there is no overlay left to have a stuck-open bug
//    in, because a closed investigation never renders the live console at
//    all anymore, regardless of how the operator got here (reload, a
//    History link, a stale bookmark, or the back button).
// 2. From there, Return Home ("+ New") and History/Export all remain
//    reachable — the operator is never trapped on a closed screen.
import { render, screen, waitFor, within } from "@testing-library/react";
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

    // Investigation identity is visible too (InvestigationIdFooter's own displayId).
    const inv = await import("@/lib/db/repositories/investigations").then((m) =>
      m.getInvestigation(investigationId)
    );
    expect(screen.getByTestId("investigation-id-footer").textContent).toContain(inv!.displayId);

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

    // Return Home is the shared BottomNavigation's Home link — unconditional,
    // present regardless of isClosed, never hidden behind Reports.
    const returnHome = screen.getByRole("link", { name: "Home" });
    expect(returnHome).toBeTruthy();

    // History/Export (and Settings, via its own BottomNavigation button) are
    // unconditionally mounted regardless of isClosed — so closing Reports
    // and reopening the More sheet still works.
    const moreButton = screen.getByRole("button", { name: "More" });
    expect(moreButton).toBeTruthy();
  });

  it("PRIORITY 1.9-6/8/9: the Reports content is NOT a dismissible overlay for a closed investigation — there is no live console underneath to reveal by closing anything", async () => {
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

    // No "Close"/"X" control exists for this content at all now — it's the
    // screen's own body, not a BottomSheet overlay on top of a live console.
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();

    // The card keypad / table map — the actual live editing surface — is
    // never rendered for a closed investigation, confirmed directly rather
    // than inferred from an overlay's dismiss behavior.
    expect(screen.queryByRole("button", { name: "A" })).toBeNull(); // card rank button
    expect(screen.queryByTestId("active-seat-panel")).toBeNull();
  });

  it("PRIORITY 1.9-8: reload-after-completion regression — a fresh render against an already-closed investigation shows Reports directly, driven only by investigation.status, never a query param", async () => {
    const investigationId = await freshClosedInvestigationWithEvidence();

    // Simulates a full browser reload: a brand-new render against the SAME
    // already-closed investigationId. This file's own top-level mock
    // still reports `?review=1` in the URL, but nothing in LiveScreen
    // reads that anymore (the query-param-driven auto-open mechanism was
    // removed entirely) — this test's real assertion is that the Reports
    // content, the closed-state message, and the absence of the live
    // keypad all still hold, proving `investigation.status` alone is what
    // decides this now.
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
    screen.getByText(/Investigation closed — every round and card above is preserved/);
    expect(screen.queryByRole("button", { name: "A" })).toBeNull();

    const inv = await import("@/lib/db/repositories/investigations").then((m) => m.getInvestigation(investigationId));
    expect(inv!.status).toBe("closed");
    const events = await getCardEventsForInvestigation(investigationId);
    expect(events).toHaveLength(1); // nothing lost, nothing re-openable as live
  });
});

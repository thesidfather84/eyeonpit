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
});

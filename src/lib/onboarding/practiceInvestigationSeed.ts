import {
  createInvestigation,
  getInvestigation,
  listInvestigations,
  occupySeat,
  resetPracticeInvestigationLiveState,
  updateSeatBet,
} from "@/lib/db/repositories/investigations";
import type { Investigation } from "@/types/investigation";

const PRACTICE_SEATS_WITH_BETS: Record<number, number> = { 3: 25, 5: 25 };

/** Occupies the fixed practice seats with their starting bets on whatever the investigation's current (fresh, single) round is — shared by both the brand-new-investigation path and the reused-and-reset path below, so neither can drift out of sync with the other. */
async function seedPracticeSeats(investigation: Investigation): Promise<void> {
  for (const [seatKey, betAmount] of Object.entries(PRACTICE_SEATS_WITH_BETS)) {
    const seatNumber = Number(seatKey);
    await occupySeat(investigation.localId, seatNumber);
    const round = investigation.rounds[investigation.rounds.length - 1];
    await updateSeatBet(investigation.localId, round.id, seatNumber, betAmount, {
      direction: "first",
      amount: null,
      overridden: false,
    });
  }
}

/**
 * One fixed, clearly-labeled (`isDemo: true`) practice investigation —
 * plan.md §4/§12 decision 3. Reuses an existing open practice investigation
 * rather than spawning a new one every time the operator taps the entry
 * point, so History doesn't accumulate duplicate demo records (it's already
 * excluded from the default History view, but there's no reason to let it
 * grow unbounded either).
 *
 * Reusing the *record* must never mean reusing its *live table state* — a
 * practice exercise left mid-shoe (cards dealt, a count in progress) from a
 * previous session must not resurface as if it belonged to a brand-new
 * exercise the operator just started. Every tap of "Practice" wipes the
 * reused investigation's rounds/seats/counts — and its disposable practice
 * CardEvent ledger — back to a single fresh round first
 * (`resetPracticeInvestigationLiveState`, guarded to only ever run on an
 * `isDemo` investigation — see that function's doc comment for why this is
 * NOT the same operation a production investigation reset would use), then
 * re-seeds the same fixed demo seats/bets a genuinely new practice
 * investigation gets. Investigation identity (localId/displayId/createdAt)
 * is preserved either way — this is a live-state reset, not a new record —
 * but there is never stale dealer or player card data on screen when
 * Practice is tapped.
 */
export async function findOrCreatePracticeInvestigation(): Promise<Investigation> {
  const existing = await listInvestigations({ includeDemo: true });
  const openDemo = existing.find(
    (investigation) => investigation.isDemo && investigation.status !== "closed"
  );

  if (openDemo) {
    await resetPracticeInvestigationLiveState(openDemo.localId);
    const reset = await getInvestigation(openDemo.localId);
    if (reset) {
      await seedPracticeSeats(reset);
      const seeded = await getInvestigation(openDemo.localId);
      if (seeded) return seeded;
    }
  }

  const investigation = await createInvestigation({
    casino: "Demo Casino (Practice)",
    tableNumber: "PRACTICE",
    dealerName: "Sample Dealer",
    investigationDate: new Date().toISOString().slice(0, 10),
    operatorName: "Practice Operator",
    countingSystem: "Hi-Lo",
    shoeTotalDecks: 6,
    isDemo: true,
    status: "active",
  });

  await seedPracticeSeats(investigation);

  const withSeats = await getInvestigation(investigation.localId);
  return withSeats ?? investigation;
}

import {
  createInvestigation,
  listInvestigations,
  occupySeat,
  updateSeatBet,
} from "@/lib/db/repositories/investigations";
import type { Investigation } from "@/types/investigation";

const PRACTICE_SEATS_WITH_BETS: Record<number, number> = { 3: 25, 5: 25 };

/**
 * One fixed, clearly-labeled (`isDemo: true`) practice investigation —
 * plan.md §4/§12 decision 3. Reuses an existing open practice investigation
 * rather than spawning a new one every time the operator taps the entry
 * point, so History doesn't accumulate duplicate demo records (it's already
 * excluded from the default History view, but there's no reason to let it
 * grow unbounded either).
 */
export async function findOrCreatePracticeInvestigation(): Promise<Investigation> {
  const existing = await listInvestigations({ includeDemo: true });
  const openDemo = existing.find(
    (investigation) => investigation.isDemo && investigation.status !== "closed"
  );
  if (openDemo) return openDemo;

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

  const withSeats = await listInvestigations({ includeDemo: true });
  return withSeats.find((inv) => inv.localId === investigation.localId) ?? investigation;
}

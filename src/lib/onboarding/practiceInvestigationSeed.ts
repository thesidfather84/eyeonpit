import { createInvestigation, listInvestigations } from "@/lib/db/repositories/investigations";
import type { Investigation } from "@/types/investigation";

const PRACTICE_OCCUPIED_SEATS = [1, 3, 5];
const PRACTICE_TRACKED_SEATS = [3, 5];
const PRACTICE_INITIAL_WAGERS = { 3: 25, 5: 25 };

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

  return createInvestigation({
    casino: "Demo Casino (Practice)",
    tableNumber: "PRACTICE",
    dealerName: "Sample Dealer",
    investigationDate: new Date().toISOString().slice(0, 10),
    operatorName: "Practice Operator",
    occupiedSeats: PRACTICE_OCCUPIED_SEATS,
    trackedSeats: PRACTICE_TRACKED_SEATS,
    initialWagers: PRACTICE_INITIAL_WAGERS,
    isDemo: true,
    status: "active",
  });
}

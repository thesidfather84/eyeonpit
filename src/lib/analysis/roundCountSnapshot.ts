import { calculateCountSnapshot } from "@/lib/counting-engine/calculateCounts";
import { eventsThroughRound } from "@/lib/counting-engine/ledger";
import type { CardEvent, CountSnapshot } from "@/lib/counting-engine/types";
import type { Investigation, Round } from "@/types/investigation";

/**
 * The engine-derived running/true count as of the end of a specific round
 * — not just the current one. `Round.runningCount`/`trueCount` are only
 * ever snapshotted when a round is superseded by the next one
 * (advanceRound's historical cache), so they're null for whichever round
 * is still current — and can be stale/missing for older rounds recovered
 * from a legacy investigation. This recomputes the same value directly
 * from the authoritative card ledger for ANY round, current or historical,
 * so Analysis/AP-correlation never depend on the persisted fields.
 */
export function calculateRoundCountSnapshot(
  investigation: Investigation,
  cardEvents: CardEvent[],
  round: Round
): CountSnapshot {
  const roundIdsThroughThisOne = new Set(
    investigation.rounds
      .filter((r) => r.shoeNumber === round.shoeNumber && r.roundNumber <= round.roundNumber)
      .map((r) => r.id)
  );
  const events = eventsThroughRound(cardEvents, round.shoeNumber, roundIdsThroughThisOne);
  return calculateCountSnapshot(events, investigation.shoeTotalDecks);
}

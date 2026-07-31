import { COUNTING_SYSTEMS, initialRunningCount, tagValue } from "./countTags";
import { calculateTrueCount, computeDecksRemaining } from "./calculateTrueCount";
import type { CardEvent, CountingSystem, CountSnapshot } from "./types";

/**
 * Dedupe by event id (writing the same id twice must contribute exactly
 * once — see idempotency requirement), keep only `active` events, and
 * order by `sequence` — the ledger's real chronology, independent of clock
 * skew between createdAt timestamps. CardEvents are immutable except for
 * `status`, so when the same id appears more than once the later status
 * wins (Map overwrite), which is exactly the undo/redo transition.
 */
export function activeEventsInOrder(events: CardEvent[]): CardEvent[] {
  const byId = new Map<string, CardEvent>();
  for (const event of events) byId.set(event.id, event);
  return Array.from(byId.values())
    .filter((event) => event.status === "active")
    .sort((a, b) => a.sequence - b.sequence);
}

/**
 * The one authoritative running-count calculation. This performs no
 * database access, React access, mutation, UI formatting, or browser
 * access — pure function of its inputs. A single pass over the
 * deduplicated, ordered, active card list applies every card to all four
 * counting systems at once, so no system can ever be computed from a
 * different card list than another.
 *
 * Never returns null/undefined/NaN for the running counts or
 * exposedCardCount — only `trueCount` may be null (unsupported for an
 * unbalanced system).
 */
export function calculateCountSnapshot(events: CardEvent[], decksInPlay: number): CountSnapshot {
  const ordered = activeEventsInOrder(events);

  const running = {} as Record<CountingSystem, number>;
  for (const system of COUNTING_SYSTEMS) {
    running[system] = initialRunningCount(system, decksInPlay);
  }

  for (const event of ordered) {
    for (const system of COUNTING_SYSTEMS) {
      running[system] += tagValue(system, event.rank);
    }
  }

  const exposedCardCount = ordered.length;
  const decksRemaining = computeDecksRemaining(decksInPlay, exposedCardCount);

  const snapshot = { exposedCardCount, decksRemaining } as CountSnapshot;
  for (const system of COUNTING_SYSTEMS) {
    snapshot[system] = {
      running: running[system],
      trueCount: calculateTrueCount(system, running[system], decksRemaining),
    };
  }
  return snapshot;
}

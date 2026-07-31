import { activeEventsInOrder, calculateCountSnapshot } from "@/lib/counting-engine/calculateCounts";
import { calculateTrueCount, computeDecksRemaining } from "@/lib/counting-engine/calculateTrueCount";
import { COUNTING_SYSTEMS, initialRunningCount, tagValue } from "@/lib/counting-engine/countTags";
import type { CardEvent, CountingSystem } from "@/lib/counting-engine/types";
import { buildReport, type DiagnosticReport } from "./types";

const KNOWN_RANKS = new Set(["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]);

/**
 * Recomputes every counting system's running total from the same
 * (deduplicated, ordered, active-only) event list calculateCountSnapshot
 * uses, but via a structurally different pass — reduce() over a fresh
 * accumulator object per system, rather than the mutated-object `for` loop
 * calculateCountSnapshot itself uses. Both call the same already-unit-tested
 * low-level primitives (tagValue, initialRunningCount) from countTags.ts, so
 * this isn't testing whether tagValue is correct — it's testing whether the
 * *orchestration* around it (iteration, accumulation, decksRemaining) is
 * reproducible by an independent implementation. A divergence here means a
 * real bug in one of the two paths, not a data problem.
 */
function independentRecompute(events: CardEvent[], decksInPlay: number): Record<CountingSystem, number> {
  const ordered = activeEventsInOrder(events);
  const totals = Object.fromEntries(
    COUNTING_SYSTEMS.map((system) => [system, initialRunningCount(system, decksInPlay)])
  ) as Record<CountingSystem, number>;

  return ordered.reduce((acc, event) => {
    const next = { ...acc };
    for (const system of COUNTING_SYSTEMS) {
      next[system] = acc[system] + tagValue(system, event.rank);
    }
    return next;
  }, totals);
}

/**
 * Cross-checks the authoritative calculateCountSnapshot() against an
 * independently-implemented recomputation of the same ledger, and validates
 * a handful of structural invariants a corrupted or hand-edited IndexedDB
 * row could violate. Never writes anything — pure read, pure compute.
 *
 * A live Dexie read can never contain two rows sharing an `id` (it's the
 * table's primary key), so the duplicate-id check only ever fires against
 * data that arrived by another path — an import, a merge, a hand-edited
 * fixture — which is exactly the case worth catching before it reaches the
 * live count.
 */
export function checkCountIntegrity(events: CardEvent[], decksInPlay: number): DiagnosticReport {
  const authoritative = calculateCountSnapshot(events, decksInPlay);
  const independent = independentRecompute(events, decksInPlay);

  const checks = COUNTING_SYSTEMS.map((system) => {
    const matches = authoritative[system].running === independent[system];
    return {
      id: `running-count-agrees-${system}`,
      label: `${system} running count — two independent computations agree`,
      status: matches ? ("pass" as const) : ("fail" as const),
      detail: matches
        ? `Both paths compute ${authoritative[system].running >= 0 ? "+" : ""}${authoritative[system].running}.`
        : `calculateCountSnapshot: ${authoritative[system].running}, independent recompute: ${independent[system]} — these must never differ.`,
    };
  });

  const ordered = activeEventsInOrder(events);
  const expectedDecksRemaining = computeDecksRemaining(decksInPlay, ordered.length);
  checks.push({
    id: "decks-remaining-agrees",
    label: "Decks remaining agrees with active card count",
    status: authoritative.decksRemaining === expectedDecksRemaining ? "pass" : "fail",
    detail: `Snapshot reports ${authoritative.decksRemaining} decks remaining for ${ordered.length} active cards.`,
  });

  for (const system of COUNTING_SYSTEMS) {
    const expected = calculateTrueCount(system, authoritative[system].running, authoritative.decksRemaining);
    const actual = authoritative[system].trueCount;
    checks.push({
      id: `true-count-agrees-${system}`,
      label: `${system} true count reproduces from the same running count/decks`,
      status: expected === actual ? "pass" : "fail",
      detail:
        expected === actual
          ? `Reproduces as ${expected ?? "N/A"}.`
          : `Snapshot: ${actual ?? "N/A"}, recomputed: ${expected ?? "N/A"}.`,
    });
  }

  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();
  for (const event of events) {
    if (seenIds.has(event.id)) duplicateIds.add(event.id);
    seenIds.add(event.id);
  }
  checks.push({
    id: "no-duplicate-event-ids",
    label: "No two card events share an id",
    status: duplicateIds.size === 0 ? "pass" : "fail",
    detail:
      duplicateIds.size === 0
        ? `${events.length} events, all ids unique.`
        : `${duplicateIds.size} id(s) appear more than once — a live Dexie read should never produce this; check the data's origin (import/merge).`,
  });

  const invalidRanks = events.filter((e) => !KNOWN_RANKS.has(e.rank));
  checks.push({
    id: "all-ranks-valid",
    label: "Every event's rank is a recognized value",
    status: invalidRanks.length === 0 ? "pass" : "fail",
    detail:
      invalidRanks.length === 0
        ? `${events.length} events, all ranks recognized.`
        : `${invalidRanks.length} event(s) carry an unrecognized rank value.`,
  });

  return buildReport(checks);
}

/**
 * TEST-ONLY INDEPENDENT REFERENCE MODEL.
 *
 * This file computes "what the count SHOULD be" using its own small,
 * explicit implementation — never by calling
 * `src/lib/counting-engine/calculateCounts.ts` or any other production
 * calculation. If this file and production ever disagree, that is exactly
 * the class of bug this harness exists to catch; nothing here may be
 * "reconciled" with production to make a mismatch go away (see
 * docs/EYEONPIT_PRODUCT_SPEC.md and docs/VALIDATION.md).
 *
 * INDEPENDENCE, CONCRETELY: production's `calculateCountSnapshot` keeps
 * every CardEvent ever written (across every status transition), dedupes by
 * id, filters to `status === "active"`, sorts by `sequence`, and sums tags
 * over that filtered list. This oracle takes a structurally different
 * approach that never touches ids, statuses, or sequence numbers at all: it
 * keeps one small integer counter per rank (`activeRankCounts`) that is
 * incremented on every card added and decremented on every card undone,
 * plus one LIFO stack per (targetType, targetId) so it knows which rank to
 * decrement/re-increment when a specific target's card is undone/redone.
 * The running count for a system is always just
 * `IRC(system) + sum(activeRankCounts[rank] * tag[system][rank])` — a
 * one-line reduction over ten counters, not a replay of an event log. Two
 * genuinely different computations arriving at the same answer, on
 * thousands to millions of generated cases, is the actual evidence this
 * harness produces.
 *
 * TAG TABLES: hand-transcribed from the published methodology recorded in
 * docs/counting-systems.md (Thorp/Wong for Hi-Lo, Fuchs & Vancura for KO,
 * Snyder for Zen, Carlson for Omega II) — typed out here independently,
 * not copied from src/lib/counting-engine/countTags.ts. Cross-check by eye
 * against that doc's four tag tables before trusting a harness result.
 */
import type { EntryRank } from "./rng";

export type OracleSystem = "Hi-Lo" | "KO" | "Zen" | "Omega II";
export const ORACLE_SYSTEMS: OracleSystem[] = ["Hi-Lo", "KO", "Zen", "Omega II"];

/**
 * | Rank    | Hi-Lo | KO | Zen | Omega II |
 * |---------|-------|----|----|----------|
 * | A       |  -1   | -1 | -1 |    0     |
 * | 2       |  +1   | +1 | +1 |   +1     |
 * | 3       |  +1   | +1 | +1 |   +1     |
 * | 4       |  +1   | +1 | +2 |   +2     |
 * | 5       |  +1   | +1 | +2 |   +2     |
 * | 6       |  +1   | +1 | +2 |   +2     |
 * | 7       |   0   | +1 | +1 |   +1     |
 * | 8       |   0   |  0 |  0 |    0     |
 * | 9       |   0   |  0 |  0 |   -1     |
 * | 10      |  -1   | -1 | -2 |   -2     |
 *
 * Transcribed by hand from docs/counting-systems.md's four published tag
 * tables. Note rank 9 = -1 for Omega II specifically (every other system
 * has 9 = 0) — the one value that most easily gets typo'd into 0, which is
 * exactly why it's worth a comment here.
 */
const ORACLE_TAGS: Record<OracleSystem, Record<EntryRank, number>> = {
  "Hi-Lo": { A: -1, "2": 1, "3": 1, "4": 1, "5": 1, "6": 1, "7": 0, "8": 0, "9": 0, "10": -1 },
  KO: { A: -1, "2": 1, "3": 1, "4": 1, "5": 1, "6": 1, "7": 1, "8": 0, "9": 0, "10": -1 },
  Zen: { A: -1, "2": 1, "3": 1, "4": 2, "5": 2, "6": 2, "7": 1, "8": 0, "9": 0, "10": -2 },
  "Omega II": { A: 0, "2": 1, "3": 1, "4": 2, "5": 2, "6": 2, "7": 1, "8": 0, "9": -1, "10": -2 },
};

/**
 * Standard KO Initial Running Count: -4 x (decksInPlay - 1). KO is the only
 * unbalanced system of the four (its tags sum to +4 per 52-card deck), and
 * published KO methodology seeds the running count with this offset before
 * any card is seen so the running count itself — not a converted true
 * count — is the number an operator acts on. `|| 0` only exists to turn a
 * single-deck `-4 * 0 === -0` into plain `0` for clean equality checks.
 */
function oracleInitialRunningCount(system: OracleSystem, deckCount: number): number {
  return system === "KO" ? -4 * (deckCount - 1) || 0 : 0;
}

export const ORACLE_MIN_DECKS_REMAINING = 0.25;

/** decksRemaining = max(0.25, (deckCount*52 - exposedCardCount) / 52) — independently transcribed from docs/counting-systems.md's published formula. */
export function oracleDecksRemaining(deckCount: number, exposedCardCount: number): number {
  const remainingCards = deckCount * 52 - exposedCardCount;
  return Math.max(ORACLE_MIN_DECKS_REMAINING, remainingCards / 52);
}

export interface OracleSystemResult {
  running: number;
  /** null for KO — an unbalanced system has no meaningful true-count conversion in published methodology. */
  trueCount: number | null;
}

export type OracleSnapshot = Record<OracleSystem, OracleSystemResult> & {
  exposedCardCount: number;
  decksRemaining: number;
  acesSeen: number;
};

type OracleTargetKey = string; // `${targetType}:${targetId}`

function targetKey(targetType: "dealer" | "seat" | "split", targetId: number | "dealer"): OracleTargetKey {
  return `${targetType}:${targetId}`;
}

/**
 * One shoe's worth of independent ground truth. Reset (a brand-new
 * instance) at every shoe boundary, exactly like production's ledger is
 * scoped by `shoeNumber` — this class never needs to know what a shoe
 * number even is, only that it represents "everything currently active in
 * one shoe."
 */
export class ShoeOracle {
  private readonly deckCount: number;
  /** Count of each rank currently active (added and not undone) anywhere in this shoe — the only state the running-count math actually reads. */
  private readonly activeRankCounts: Record<EntryRank, number> = {
    A: 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0, "8": 0, "9": 0, "10": 0,
  };
  /** Per-target LIFO stack of currently-active ranks, in the order they were added — what "undo last card for this target" pops, and what "redo" needs to know to push back. */
  private readonly activeStacks = new Map<OracleTargetKey, EntryRank[]>();
  /** Per-target LIFO stack of undone ranks, most-recently-undone last — what "redo" pops. Pushing a genuinely new card onto a target clears its redo stack, exactly like a real undo/redo history does everywhere else in the app. */
  private readonly undoneStacks = new Map<OracleTargetKey, EntryRank[]>();

  constructor(deckCount: number) {
    this.deckCount = deckCount;
  }

  private stackFor(map: Map<OracleTargetKey, EntryRank[]>, key: OracleTargetKey): EntryRank[] {
    let stack = map.get(key);
    if (!stack) {
      stack = [];
      map.set(key, stack);
    }
    return stack;
  }

  addCard(targetType: "dealer" | "seat" | "split", targetId: number | "dealer", rank: EntryRank): void {
    this.activeRankCounts[rank] += 1;
    const key = targetKey(targetType, targetId);
    this.stackFor(this.activeStacks, key).push(rank);
    // A genuinely new card invalidates any prior redo history for this
    // target — matches every real undo/redo stack in the app (and in
    // computer science generally): you cannot redo past a new action.
    this.undoneStacks.set(key, []);
  }

  /** Returns the rank that was undone, for the caller to pass to the real production `undoTargetCard` call — the oracle and the production call must undo the exact same logical card. */
  undoLastCard(targetType: "dealer" | "seat" | "split", targetId: number | "dealer"): EntryRank {
    const key = targetKey(targetType, targetId);
    const active = this.stackFor(this.activeStacks, key);
    const rank = active.pop();
    if (rank == null) {
      throw new Error(`ShoeOracle.undoLastCard: no active card for target ${key} to undo.`);
    }
    this.activeRankCounts[rank] -= 1;
    this.stackFor(this.undoneStacks, key).push(rank);
    return rank;
  }

  /** Returns the rank that was redone. */
  redoLastCard(targetType: "dealer" | "seat" | "split", targetId: number | "dealer"): EntryRank {
    const key = targetKey(targetType, targetId);
    const undone = this.stackFor(this.undoneStacks, key);
    const rank = undone.pop();
    if (rank == null) {
      throw new Error(`ShoeOracle.redoLastCard: no undone card for target ${key} to redo.`);
    }
    this.activeRankCounts[rank] += 1;
    this.stackFor(this.activeStacks, key).push(rank);
    return rank;
  }

  hasActiveCard(targetType: "dealer" | "seat" | "split", targetId: number | "dealer"): boolean {
    const stack = this.activeStacks.get(targetKey(targetType, targetId));
    return !!stack && stack.length > 0;
  }

  hasUndoneCard(targetType: "dealer" | "seat" | "split", targetId: number | "dealer"): boolean {
    const stack = this.undoneStacks.get(targetKey(targetType, targetId));
    return !!stack && stack.length > 0;
  }

  /** The full expected snapshot for this shoe right now — every system computed independently from the same ten `activeRankCounts` values. */
  snapshot(): OracleSnapshot {
    let totalExposed = 0;
    for (const rank of Object.keys(this.activeRankCounts) as EntryRank[]) {
      totalExposed += this.activeRankCounts[rank];
    }
    const decksRemaining = oracleDecksRemaining(this.deckCount, totalExposed);

    const result = {} as OracleSnapshot;
    for (const system of ORACLE_SYSTEMS) {
      let running = oracleInitialRunningCount(system, this.deckCount);
      for (const rank of Object.keys(this.activeRankCounts) as EntryRank[]) {
        running += this.activeRankCounts[rank] * ORACLE_TAGS[system][rank];
      }
      result[system] = {
        running,
        trueCount: system === "KO" ? null : running / decksRemaining,
      };
    }
    result.exposedCardCount = totalExposed;
    result.decksRemaining = decksRemaining;
    result.acesSeen = this.activeRankCounts.A;
    return result;
  }
}

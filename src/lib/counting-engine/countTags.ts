import type { CountingSystem, Rank } from "./types";

export const COUNTING_SYSTEMS: CountingSystem[] = ["Hi-Lo", "KO", "Zen", "Omega II"];

/**
 * Immutable, published tag values per system. J/Q/K carry the same tag as
 * "10" — the app's card entry only ever produces rank "10" for any
 * ten-value card (see CardEntryPad), but the table is defined over every
 * Rank the type allows so a stray J/Q/K (e.g. from a future entry mode or
 * hand-edited legacy data) is never silently mis-tagged.
 */
export const COUNT_TAGS: Record<CountingSystem, Record<Rank, number>> = {
  "Hi-Lo": {
    A: -1, "2": 1, "3": 1, "4": 1, "5": 1, "6": 1,
    "7": 0, "8": 0, "9": 0,
    "10": -1, J: -1, Q: -1, K: -1,
  },
  KO: {
    A: -1, "2": 1, "3": 1, "4": 1, "5": 1, "6": 1, "7": 1,
    "8": 0, "9": 0,
    "10": -1, J: -1, Q: -1, K: -1,
  },
  Zen: {
    A: -1, "2": 1, "3": 1, "4": 2, "5": 2, "6": 2, "7": 1,
    "8": 0, "9": 0,
    "10": -2, J: -2, Q: -2, K: -2,
  },
  "Omega II": {
    A: 0, "2": 1, "3": 1, "4": 2, "5": 2, "6": 2, "7": 1,
    "8": 0, "9": -1,
    "10": -2, J: -2, Q: -2, K: -2,
  },
};

/**
 * KO is the only unbalanced system here (its tags sum to +4 per 52-card
 * deck instead of 0). Standard KO methodology is built around that
 * imbalance — see initialRunningCount/calculateTrueCount. A future
 * true-counted KO variant belongs as its own separately named
 * CountingSystem, never a mode bolted onto standard KO.
 */
const UNBALANCED_SYSTEMS: ReadonlySet<CountingSystem> = new Set(["KO"]);

export function isBalancedSystem(system: CountingSystem): boolean {
  return !UNBALANCED_SYSTEMS.has(system);
}

/**
 * Standard KO Initial Running Count: -4 x (decks in play - 1), seeded
 * before any card is seen. This is the ONE place a KO starting value is
 * computed — nothing else in the engine or UI may hardcode or re-derive it.
 * Every balanced system starts at 0.
 */
export function initialRunningCount(system: CountingSystem, decksInPlay: number): number {
  // `|| 0` normalizes the single-deck case (-4 * 0) from -0 to +0 — same
  // numeric value, but keeps every comparison/display unambiguously "0".
  return system === "KO" ? -4 * (decksInPlay - 1) || 0 : 0;
}

export function tagValue(system: CountingSystem, rank: Rank): number {
  return COUNT_TAGS[system][rank];
}

import type { CardCode, CountingSystem, Rank } from "@/types/investigation";

// Standard published tag values per system. Real computation, not a
// placeholder — the Live screen's running/true count is derived from
// these on every card entered.
const TAG_VALUES: Record<CountingSystem, Record<Rank, number>> = {
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
    "8": 0, "9": 0,
    "10": -2, J: -2, Q: -2, K: -2,
  },
};

export const COUNTING_SYSTEMS: CountingSystem[] = ["Hi-Lo", "KO", "Zen", "Omega II"];

export function getCardCountValue(system: CountingSystem, rank: Rank): number {
  return TAG_VALUES[system][rank];
}

export function computeRunningCount(system: CountingSystem, cards: CardCode[]): number {
  return cards.reduce((sum, card) => sum + getCardCountValue(system, card.rank), 0);
}

export function computeTrueCount(runningCount: number, decksRemaining: number): number {
  if (decksRemaining <= 0) return runningCount;
  return Math.round((runningCount / decksRemaining) * 10) / 10;
}

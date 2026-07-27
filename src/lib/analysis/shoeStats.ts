import { COUNTING_SYSTEMS, computeRunningCount, computeTrueCount } from "@/lib/counting-systems/countingSystems";
import type { CardCode, CountingSystem, Investigation, Round } from "@/types/investigation";

/** Every card observed in a round — a card counts the instant it's entered, dealer or seat alike, since there's no hidden/hole-card concept to delay it. Split hands are dealt from the same shoe and must count exactly once, same as any other hand. */
export function getVisibleCardsInRound(round: Round): CardCode[] {
  const seatCards = Object.values(round.seats).flatMap((seat) => seat?.playerCards ?? []);
  const splitHandCards = Object.values(round.splitHands).flatMap((seat) => seat?.playerCards ?? []);
  return [...round.dealerHand.cards, ...seatCards, ...splitHandCards];
}

export type CountTrend = "up" | "down" | "flat";

export interface SystemCount {
  runningCount: number;
  trueCount: number;
  trend: CountTrend;
}

export interface ShoeStats {
  cardsSeen: number;
  decksRemaining: number;
  penetrationPct: number;
  /** Every supported counting system, computed simultaneously from the same card list — the operator never picks one. */
  counts: Record<CountingSystem, SystemCount>;
}

/**
 * Live shoe stats derived from every round tagged with `shoeNumber` —
 * nothing here is stored, it's recomputed from the actual cards entered.
 * All four counting systems are computed from that single card list at
 * once; trend compares against the count as of the end of the previous
 * round, so it reflects what just happened this round.
 */
export function computeShoeStats(investigation: Investigation, shoeNumber: number): ShoeStats {
  const shoeRounds = investigation.rounds
    .filter((r) => r.shoeNumber === shoeNumber)
    .sort((a, b) => a.roundNumber - b.roundNumber);
  const priorRounds = shoeRounds.slice(0, -1);

  const allCards = shoeRounds.flatMap(getVisibleCardsInRound);
  const priorCards = priorRounds.flatMap(getVisibleCardsInRound);

  const cardsSeen = allCards.length;
  const totalCards = Math.max(1, investigation.shoeTotalDecks * 52);
  const decksRemaining = Math.max(0, investigation.shoeTotalDecks - cardsSeen / 52);
  const penetrationPct = Math.min(100, (cardsSeen / totalCards) * 100);

  const counts = {} as Record<CountingSystem, SystemCount>;
  for (const system of COUNTING_SYSTEMS) {
    const runningCount = computeRunningCount(system, allCards);
    const trueCount = computeTrueCount(runningCount, decksRemaining || 1);
    const priorRunningCount = computeRunningCount(system, priorCards);
    const trend: CountTrend =
      runningCount > priorRunningCount ? "up" : runningCount < priorRunningCount ? "down" : "flat";
    counts[system] = { runningCount, trueCount, trend };
  }

  return { cardsSeen, decksRemaining, penetrationPct, counts };
}

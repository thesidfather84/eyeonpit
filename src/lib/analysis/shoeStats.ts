import { computeRunningCount, computeTrueCount } from "@/lib/counting-systems/countingSystems";
import type { CardCode, CountingSystem, Investigation, Round } from "@/types/investigation";

/** Every card actually visible to the operator in a round — the dealer's hole card only counts once revealed, matching what a real surveillance operator can see. */
export function getVisibleCardsInRound(round: Round): CardCode[] {
  const dealerCards: CardCode[] = [
    ...(round.dealerHand.upcard ? [round.dealerHand.upcard] : []),
    ...(round.dealerHand.holeCardRevealed && round.dealerHand.holeCard
      ? [round.dealerHand.holeCard]
      : []),
    ...round.dealerHand.drawCards,
  ];
  const seatCards = Object.values(round.seats).flatMap((seat) => seat?.playerCards ?? []);
  return [...dealerCards, ...seatCards];
}

export interface ShoeStats {
  cardsSeen: number;
  decksRemaining: number;
  penetrationPct: number;
  runningCount: number;
  trueCount: number;
}

/** Live shoe stats derived from every round tagged with `shoeNumber` — nothing here is stored, it's recomputed from the actual cards entered. */
export function computeShoeStats(
  investigation: Investigation,
  shoeNumber: number,
  system: CountingSystem
): ShoeStats {
  const shoeRounds = investigation.rounds.filter((r) => r.shoeNumber === shoeNumber);
  const allCards = shoeRounds.flatMap(getVisibleCardsInRound);
  const cardsSeen = allCards.length;
  const totalCards = Math.max(1, investigation.shoeTotalDecks * 52);
  const decksRemaining = Math.max(0, investigation.shoeTotalDecks - cardsSeen / 52);
  const runningCount = computeRunningCount(system, allCards);
  const trueCount = computeTrueCount(runningCount, decksRemaining || 1);
  const penetrationPct = Math.min(100, (cardsSeen / totalCards) * 100);

  return { cardsSeen, decksRemaining, penetrationPct, runningCount, trueCount };
}

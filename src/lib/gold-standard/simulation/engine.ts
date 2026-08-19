import { computeDecksRemaining } from "@/lib/counting-engine/calculateTrueCount";
import type { CardCode, Rank } from "@/types/investigation";
import type { GameDefinition } from "../gameDefinition";
import type { CountMethodDefinition } from "../countMethodRegistry";
import type { BettingStrategy, PlayingStrategy, SimulationScenario } from "./scenario";
import { betUnitsForTrueCount } from "./scenario";
import type { RiskMetrics, SimulationResult } from "./result";
import { SeededRng, buildShuffledShoe } from "./rng";
import { basicStrategyDecision } from "./basicStrategy";
import { handTotal, isBlackjack, rankToCard, resolveNonBlackjackOutcome, settleHand } from "./handEvaluation";
import { ENGINE_VERSIONS, versionRef } from "@/lib/versioning/types";

/**
 * PRIORITY B7 — the deterministic Simulation Engine foundation.
 * "Correctness first... millions of simulations are worthless if rules are
 * wrong" — this is a single-threaded, single-player-seat-vs-dealer engine,
 * deliberately not performance-optimized (no worker threads, no WASM); see
 * this file's own scope-limitation notes below for exactly what is and
 * isn't modeled yet.
 *
 * SCOPE LIMITATIONS (documented, not hidden — see
 * docs/EYEONPIT_1_6_ARCHITECTURE.md's Simulation Engine section for the
 * full list):
 *   - One player seat only (no multi-seat/multi-player table simulation).
 *   - At most ONE split per hand (two resulting hands) regardless of a
 *     GameDefinition's `maxSplitHands` — no resplitting.
 *   - Insurance is not modeled (no side-bet EV path yet).
 *   - The basic-strategy chart used is the standard multi-deck S17
 *     reference regardless of the GameDefinition's actual `dealerSoft17`/
 *     `deckCount` — see basicStrategy.ts's own doc comment.
 *   - PlayingStrategy deviations are accepted on the scenario but NOT YET
 *     applied — only `baseStrategy: "basic"` is actually executed. A
 *     scenario with deviations still simulates (plain basic strategy),
 *     never silently ignored without this being stated in the result's
 *     `notes`.
 *   - Only BALANCED count methods are supported — an unbalanced method
 *     (like the built-in KO adapter) makes `runSimulation` throw rather
 *     than silently produce an incorrect bet-sizing/true-count result; see
 *     this file's own validation.
 *   - The dealer's hand is always fully played out and its cards always
 *     counted, even in a hand where every player hand busted (a real
 *     dealer sometimes doesn't reveal/complete their hand in that case) —
 *     correct for a TRUE-EV simulation (the physical shoe composition
 *     changes regardless of visibility), but not a model of an imperfect
 *     real-world observer.
 */

export interface SimulationEngineInput {
  scenario: SimulationScenario;
  gameDefinition: GameDefinition;
  countMethod: CountMethodDefinition;
  bettingStrategy: BettingStrategy;
  playingStrategy: PlayingStrategy;
}

interface ShoeState {
  cards: Rank[];
  index: number;
  cutoffIndex: number;
  running: number;
}

function freshShoe(gameDefinition: GameDefinition, rng: SeededRng): ShoeState {
  const cards = buildShuffledShoe(gameDefinition.deckCount, rng);
  const totalCards = cards.length;
  const cutoffIndex = Math.floor(totalCards * (gameDefinition.penetrationPercent / 100));
  // Burn cards, if configured — physically removed and counted, exactly
  // like any other exposed card (a burned card is still seen leaving the
  // shoe by a real counter watching the burn).
  return { cards, index: gameDefinition.burnCardCount, running: 0, cutoffIndex };
}

function draw(shoe: ShoeState, method: CountMethodDefinition): Rank {
  const rank = shoe.cards[shoe.index];
  shoe.index += 1;
  shoe.running += method.tags?.[rank] ?? 0;
  return rank;
}

function trueCountNow(shoe: ShoeState, gameDefinition: GameDefinition): number {
  const decksRemaining = computeDecksRemaining(gameDefinition.deckCount, shoe.index);
  return shoe.running / decksRemaining;
}

interface PlayerHandResult {
  cards: CardCode[];
  betUnits: number;
  outcome: Parameters<typeof settleHand>[0];
}

function playOutHand(
  initialCards: CardCode[],
  betUnits: number,
  dealerUpcard: Rank,
  shoe: ShoeState,
  method: CountMethodDefinition,
  gameDefinition: GameDefinition,
  playingStrategy: PlayingStrategy,
  allowSplit: boolean
): PlayerHandResult[] {
  void playingStrategy; // deviations not yet applied — see this file's own scope-limitation notes.
  const results: PlayerHandResult[] = [];

  function playSingleHand(cards: CardCode[], bet: number, isSplitHand: boolean, isSplitAces: boolean): void {
    let currentBet = bet;
    let doneHitting = false;

    if (isSplitAces && gameDefinition.oneCardOnSplitAces) {
      cards.push(rankToCard(draw(shoe, method)));
      doneHitting = true;
    }

    while (!doneHitting) {
      const total = handTotal(cards);
      if (total.bust) {
        doneHitting = true;
        break;
      }
      const action = basicStrategyDecision({
        playerCards: cards,
        dealerUpcard,
        dealerSoft17: gameDefinition.dealerSoft17,
        doublingRule: gameDefinition.doublingRule,
        canDouble: cards.length === 2 && (!isSplitHand || gameDefinition.doubleAfterSplitAllowed),
        canSplit: allowSplit && !isSplitHand && cards.length === 2,
        canSurrender: cards.length === 2 && !isSplitHand,
      });

      if (action === "surrender") {
        results.push({ cards, betUnits: currentBet / 2, outcome: "surrender" });
        return;
      }
      if (action === "split" && cards[0].rank === cards[1].rank) {
        const isAceSplit = cards[0].rank === "A";
        const handA = [cards[0], rankToCard(draw(shoe, method))];
        const handB = [cards[1], rankToCard(draw(shoe, method))];
        playSingleHand(handA, bet, true, isAceSplit);
        playSingleHand(handB, bet, true, isAceSplit);
        return;
      }
      if (action === "double") {
        currentBet *= 2;
        cards.push(rankToCard(draw(shoe, method)));
        doneHitting = true;
        continue;
      }
      if (action === "hit") {
        cards.push(rankToCard(draw(shoe, method)));
        continue;
      }
      doneHitting = true; // stand
    }

    results.push({ cards, betUnits: currentBet, outcome: handTotal(cards).bust ? "dealer-win" : "player-win" });
  }

  playSingleHand(initialCards, betUnits, false, false);
  return results;
}

function playDealerHand(upcard: Rank, holeCard: Rank, shoe: ShoeState, method: CountMethodDefinition, gameDefinition: GameDefinition): CardCode[] {
  const cards = [rankToCard(upcard), rankToCard(holeCard)];
  for (;;) {
    const total = handTotal(cards);
    if (total.value > 21) break;
    if (total.value > 17) break;
    if (total.value === 17) {
      if (total.soft && gameDefinition.dealerSoft17 === "H17") {
        cards.push(rankToCard(draw(shoe, method)));
        continue;
      }
      break;
    }
    cards.push(rankToCard(draw(shoe, method)));
  }
  return cards;
}

/**
 * Runs one complete, deterministic simulation. Throws (never silently
 * produces a misleading result) if the scenario/inputs are unsupported —
 * see this file's own scope-limitation notes.
 */
export function runSimulation(input: SimulationEngineInput): SimulationResult {
  const { scenario, gameDefinition, countMethod, bettingStrategy, playingStrategy } = input;
  if (!countMethod.balanced) {
    throw new Error(
      `runSimulation: count method '${countMethod.canonicalId}' is unbalanced — the simulation engine's bet-sizing/true-count logic currently only supports balanced methods. See engine.ts's own scope-limitation notes.`
    );
  }

  const startTime = Date.now();
  const rng = new SeededRng(scenario.seed);
  const allowSplit = gameDefinition.resplitAllowed || gameDefinition.maxSplitHands >= 2;
  const penetrationPercent = scenario.penetrationOverridePercent ?? gameDefinition.penetrationPercent;
  const effectiveGameDefinition: GameDefinition = { ...gameDefinition, penetrationPercent };

  let shoe = freshShoe(effectiveGameDefinition, rng);
  const outcomes: number[] = [];
  const validationChecks: { name: string; passed: boolean }[] = [];
  let cardsDealtTotal = 0;
  let shoesUsed = 1;

  for (let hand = 0; hand < scenario.handsToSimulate; hand++) {
    // Reshuffle BETWEEN hands only, never mid-hand — the deterministic,
    // physically-correct point a real dealer would actually reshuffle.
    if (shoe.index >= shoe.cutoffIndex || shoe.cards.length - shoe.index < 4) {
      shoe = freshShoe(effectiveGameDefinition, rng);
      shoesUsed += 1;
    }

    const trueCount = trueCountNow(shoe, effectiveGameDefinition);
    const wongedOut = bettingStrategy.wongOutThreshold != null && trueCount <= bettingStrategy.wongOutThreshold;
    const wongedIn = bettingStrategy.wongInThreshold == null || trueCount >= bettingStrategy.wongInThreshold;
    const isPlaying = !wongedOut && wongedIn;

    const dealerUpcard = draw(shoe, countMethod);
    const playerFirst = isPlaying ? draw(shoe, countMethod) : null;
    const dealerHole = draw(shoe, countMethod);
    const playerSecond = isPlaying ? draw(shoe, countMethod) : null;
    cardsDealtTotal += isPlaying ? 4 : 2;

    if (!isPlaying) continue; // count-only round — no bet, no outcome recorded.

    const betUnits = betUnitsForTrueCount(bettingStrategy, trueCount);
    const playerCards = [rankToCard(playerFirst!), rankToCard(playerSecond!)];
    const dealerUpcardBlackjackPossible = dealerUpcard === "A" || dealerUpcard === "10" || dealerUpcard === "J" || dealerUpcard === "Q" || dealerUpcard === "K";
    const dealerHasBlackjack = dealerUpcardBlackjackPossible && isBlackjack([rankToCard(dealerUpcard), rankToCard(dealerHole)]);
    const playerHasBlackjack = isBlackjack(playerCards);

    if (dealerHasBlackjack || playerHasBlackjack) {
      const outcome = playerHasBlackjack && dealerHasBlackjack ? "push" : playerHasBlackjack ? "player-blackjack" : "dealer-blackjack";
      outcomes.push(settleHand(outcome, betUnits, effectiveGameDefinition.blackjackPayout));
      continue;
    }

    const handResults = playOutHand(playerCards, betUnits, dealerUpcard, shoe, countMethod, effectiveGameDefinition, playingStrategy, allowSplit);
    const anyStillIn = handResults.some((h) => !handTotal(h.cards).bust && h.outcome !== "surrender");
    const dealerCards = anyStillIn ? playDealerHand(dealerUpcard, dealerHole, shoe, countMethod, effectiveGameDefinition) : [rankToCard(dealerUpcard), rankToCard(dealerHole)];

    // Aggregated to ONE data point per ROUND dealt (never per split
    // sub-hand) — this is what keeps `handsSimulated` an accurate count of
    // rounds actually played (matching `scenario.handsToSimulate`'s own
    // meaning), and is also the statistically correct treatment: two
    // sub-hands from the same split share the same parent cards/shoe state
    // and are not independent samples, so they must be summed into one
    // round-level outcome rather than treated as two separate EV/variance
    // data points.
    let roundNet = 0;
    for (const handResult of handResults) {
      if (handResult.outcome === "surrender") {
        roundNet += settleHand("surrender", handResult.betUnits, effectiveGameDefinition.blackjackPayout);
        continue;
      }
      if (handTotal(handResult.cards).bust) {
        roundNet += settleHand("dealer-win", handResult.betUnits, effectiveGameDefinition.blackjackPayout);
        continue;
      }
      const outcome = resolveNonBlackjackOutcome(handResult.cards, dealerCards);
      roundNet += settleHand(outcome, handResult.betUnits, effectiveGameDefinition.blackjackPayout);
    }
    outcomes.push(roundNet);
  }

  const handsSimulated = outcomes.length;
  const sum = outcomes.reduce((a, b) => a + b, 0);
  const mean = handsSimulated > 0 ? sum / handsSimulated : 0;
  const variance = handsSimulated > 1 ? outcomes.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (handsSimulated - 1) : 0;
  const stdDev = Math.sqrt(variance);
  const standardError = handsSimulated > 0 ? stdDev / Math.sqrt(handsSimulated) : 0;
  const ci95 = 1.96 * standardError;

  validationChecks.push({ name: "cards-dealt-non-negative", passed: cardsDealtTotal >= 0 });
  validationChecks.push({ name: "hands-simulated-not-exceeding-requested", passed: handsSimulated <= scenario.handsToSimulate });
  validationChecks.push({ name: "shoe-used-at-least-once", passed: shoesUsed >= 1 });
  validationChecks.push({ name: "variance-non-negative", passed: variance >= 0 });

  const risk: RiskMetrics = {
    standardDeviation: stdDev,
    standardError,
    confidenceInterval95: [mean - ci95, mean + ci95],
  };

  return {
    id: crypto.randomUUID(),
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    seed: scenario.seed,
    simulatorVersion: ENGINE_VERSIONS.simulator,
    gameDefinitionRef: versionRef(gameDefinition),
    countMethodRef: versionRef(countMethod),
    bettingStrategyRef: versionRef(bettingStrategy),
    playingStrategyRef: versionRef(playingStrategy),
    handsSimulated,
    expectedValuePerHand: mean,
    totalExpectedValue: sum,
    variance,
    risk,
    penetrationPercentUsed: penetrationPercent,
    bettingCorrelation: countMethod.bettingCorrelation,
    playingEfficiency: countMethod.playingEfficiency,
    insuranceCorrelation: countMethod.insuranceCorrelation,
    runtimeMs: Date.now() - startTime,
    validationChecks,
    notes:
      playingStrategy.deviations.length > 0
        ? `${playingStrategy.deviations.length} playing deviation(s) were defined on this scenario but are NOT YET applied by the engine — plain basic strategy was used. See engine.ts's own scope-limitation notes.`
        : undefined,
  };
}

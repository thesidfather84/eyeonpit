import { SeededRng } from "@/lib/gold-standard/simulation/rng";
import type { CardCode, HandOutcome, Rank } from "@/types/investigation";
import type { PlayerObservation } from "../playerObservation";

/**
 * PRIORITY 1.7-7/8 — deterministic, SEEDED, clearly-synthetic player
 * archetypes for benchmarking the Confidence Engine. This is labeled test
 * data for internal validation, never a claim about real player behavior
 * — see benchmarkHarness.ts's own doc comment on what this can and cannot
 * prove.
 *
 * SCOPE LIMITATION (documented, not hidden): every archetype's PLAYING
 * decisions are held constant (always the basic-strategy-correct action on
 * a fixed, unremarkable hand) — only WAGER SIZE, INSURANCE decisions, and
 * ENTRY/EXIT timing vary by archetype. This benchmark therefore exercises
 * the bet/count, count-threshold-response, insurance, and entry/exit
 * signals realistically, but does not exercise playing-deviation-based
 * detection (which additionally requires a real index table this codebase
 * deliberately does not bundle — see playingDeviationAnalysis.ts).
 *
 * The true-count sequence every archetype reacts to is a bounded random
 * walk with a periodic reset (simulating reshuffles) — deterministic per
 * seed, not read from any real shoe.
 */

export interface LabeledObservationSet {
  archetypeKey: string;
  archetypeLabel: string;
  isCounter: boolean;
  /** True for archetypes deliberately designed to LOOK count-correlated (streaky/systematic bet changes) without actually tracking the count — Priority 8's false-positive safety set. */
  isAdversarialNonCounter: boolean;
  observations: PlayerObservation[];
}

const BENIGN_HAND: CardCode[] = [
  { rank: "10", suit: "unspecified" },
  { rank: "7", suit: "unspecified" },
];
const BENIGN_UPCARD: Rank = "6"; // hard 17 vs 6 -> stand is basic-strategy-correct, so this never registers a deviation.

function buildCountWalk(rng: SeededRng, handCount: number): { runningCount: number; trueCount: number }[] {
  const walk: { runningCount: number; trueCount: number }[] = [];
  let running = 0;
  for (let i = 0; i < handCount; i++) {
    if (i > 0 && i % 25 === 0) running = 0; // simulated reshuffle
    const step = rng.float();
    running += step < 0.4 ? -1 : step < 0.8 ? 1 : 0;
    running = Math.max(-12, Math.min(12, running));
    const decksRemaining = Math.max(1, 6 - (i % 25) * 0.2);
    walk.push({ runningCount: running, trueCount: Math.round((running / decksRemaining) * 10) / 10 });
  }
  return walk;
}

function makeObservation(
  handIndex: number,
  count: { runningCount: number; trueCount: number },
  wager: number,
  opts: { insuranceOffered?: boolean; insuranceTaken?: boolean; isFirstHandOfEntry?: boolean; isLastHandBeforeExit?: boolean; outcome?: HandOutcome } = {}
): PlayerObservation {
  return {
    schemaVersion: 1,
    id: `synthetic-${handIndex}`,
    investigationId: "synthetic-investigation",
    investigationDisplayId: "SYNTH-0",
    playerGroupId: null,
    tableIdentifier: "SYNTH-1",
    spotNumber: 1,
    shoeNumber: Math.floor(handIndex / 25) + 1,
    roundNumber: (handIndex % 25) + 1,
    handSequenceNumber: handIndex + 1,
    timestamp: new Date(2026, 0, 1, 0, handIndex).toISOString(),
    isSplitHand: false,
    wagerAmount: wager,
    startingWagerAmount: wager,
    wagerChangeDirection: "same",
    wagerChangeAmount: 0,
    runningCountAtWager: count.runningCount,
    trueCountAtWager: count.trueCount,
    countMethodRef: { id: "builtin-hi-lo", version: 1 },
    playerCards: BENIGN_HAND,
    dealerUpcard: BENIGN_UPCARD,
    actions: ["stand"],
    outcome: opts.outcome ?? "win",
    insuranceOffered: opts.insuranceOffered ?? false,
    insuranceTaken: opts.insuranceOffered ? (opts.insuranceTaken ?? false) : null,
    insuranceAmount: opts.insuranceOffered && opts.insuranceTaken ? 5 : null,
    isFirstHandOfEntry: opts.isFirstHandOfEntry ?? handIndex === 0,
    isLastHandBeforeExit: opts.isLastHandBeforeExit ?? false,
    observerNotes: [],
  };
}

type WagerFn = (rng: SeededRng, trueCount: number, previousOutcome: HandOutcome, previousWager: number) => number;

function buildArchetype(
  archetypeKey: string,
  archetypeLabel: string,
  isCounter: boolean,
  isAdversarialNonCounter: boolean,
  wagerFn: WagerFn,
  insuranceFn: (rng: SeededRng, trueCount: number) => boolean = () => false
): (seed: number, handCount: number) => LabeledObservationSet {
  return (seed, handCount) => {
    const rng = new SeededRng(seed);
    const counts = buildCountWalk(rng, handCount);
    const observations: PlayerObservation[] = [];
    let previousOutcome: HandOutcome = null;
    let previousWager = 10;

    for (let i = 0; i < handCount; i++) {
      const count = counts[i];
      const wager = Math.max(5, Math.round(wagerFn(rng, count.trueCount, previousOutcome, previousWager)));
      const outcome: HandOutcome = rng.float() < 0.46 ? "win" : rng.float() < 0.5 ? "push" : "loss";
      const insuranceOffered = rng.float() < 0.08; // roughly how often a dealer shows an Ace
      const insuranceTaken = insuranceOffered ? insuranceFn(rng, count.trueCount) : false;

      observations.push(
        makeObservation(i, count, wager, {
          insuranceOffered,
          insuranceTaken,
          isFirstHandOfEntry: i === 0,
          outcome,
        })
      );
      previousOutcome = outcome;
      previousWager = wager;
    }

    return { archetypeKey, archetypeLabel, isCounter, isAdversarialNonCounter, observations };
  };
}

// ---- Non-counters ----

export const flatBettor = buildArchetype("flat-bettor", "Flat bettor (basic strategy, no count response)", false, false, (rng) => 25 + (rng.float() - 0.5) * 4);

export const randomBettor = buildArchetype("random-bettor", "Random bettor (count-independent)", false, false, (rng) => [10, 15, 25, 50, 75][rng.int(5)]);

export const casualVariationBettor = buildArchetype("casual-variation", "Casual bettor with mild variation", false, false, (rng) => 20 + (rng.float() - 0.5) * 20);

// ---- Adversarial non-counters (Priority 8 — must NOT read as counters) ----

export const progressiveBettor = buildArchetype(
  "progressive-lucky-streak",
  "Progressive / press-your-win bettor (streak-driven, count-independent)",
  false,
  true,
  (rng, _tc, previousOutcome, previousWager) => {
    if (previousOutcome === "win") return Math.min(previousWager * 1.5, 400);
    return 25;
  }
);

export const martingaleBettor = buildArchetype(
  "martingale",
  "Martingale bettor (doubles after a loss, count-independent)",
  false,
  true,
  (rng, _tc, previousOutcome, previousWager) => {
    if (previousOutcome === "loss") return Math.min(previousWager * 2, 800);
    return 25;
  }
);

export const highRollerVariableBettor = buildArchetype(
  "high-roller-variable",
  "High roller with naturally large, count-independent variance",
  false,
  true,
  (rng) => 100 + rng.float() * 500
);

export const randomInsuranceBettor = buildArchetype(
  "random-insurance",
  "Flat bettor who takes insurance at random regardless of count",
  false,
  true,
  (rng) => 25 + (rng.float() - 0.5) * 4,
  (rng) => rng.float() < 0.5
);

export const briefEntryBettor = buildArchetype(
  "brief-entry",
  "Player who plays only a handful of hands then leaves",
  false,
  true,
  (rng, tc) => 20 + Math.max(0, tc) * 30 // WOULD look count-correlated, but too few hands to ever leave INSUFFICIENT_DATA
);

// ---- Counters ----

export const conservativeHiLoCounter = buildArchetype(
  "hi-lo-conservative",
  "Conservative Hi-Lo counter (1-4 unit spread)",
  true,
  false,
  (rng, tc) => 10 + Math.max(0, Math.min(tc, 6)) * 10 + (rng.float() - 0.5) * 3
);

export const aggressiveHiLoCounter = buildArchetype(
  "hi-lo-aggressive",
  "Aggressive Hi-Lo counter (1-12 unit spread)",
  true,
  false,
  (rng, tc) => 10 + Math.max(0, tc) * 40 + (rng.float() - 0.5) * 5,
  (rng, tc) => tc >= 3
);

export const koCounter = buildArchetype(
  "ko-counter",
  "KO counter (unbalanced running-count spread)",
  true,
  false,
  (rng, tc) => 15 + Math.max(0, tc) * 25 + (rng.float() - 0.5) * 4
);

export const zenCounter = buildArchetype(
  "zen-counter",
  "Zen counter",
  true,
  false,
  (rng, tc) => 15 + Math.max(0, tc) * 30 + (rng.float() - 0.5) * 4,
  (rng, tc) => tc >= 3
);

export const omegaIiCounter = buildArchetype(
  "omega-ii-counter",
  "Omega II counter",
  true,
  false,
  (rng, tc) => 15 + Math.max(0, tc) * 30 + (rng.float() - 0.5) * 4
);

export const coveredCounter = buildArchetype(
  "covered-counter",
  "Disguised/covered counter (weak, noisy count correlation, occasional cover bets)",
  true,
  false,
  (rng, tc) => {
    const base = 15 + Math.max(0, tc) * 12;
    const cover = rng.float() < 0.25 ? (rng.float() - 0.5) * 60 : 0; // deliberate noise to disguise the pattern
    return base + cover + (rng.float() - 0.5) * 8;
  }
);

export const ALL_ARCHETYPES = [
  flatBettor,
  randomBettor,
  casualVariationBettor,
  progressiveBettor,
  martingaleBettor,
  highRollerVariableBettor,
  randomInsuranceBettor,
  briefEntryBettor,
  conservativeHiLoCounter,
  aggressiveHiLoCounter,
  koCounter,
  zenCounter,
  omegaIiCounter,
  coveredCounter,
];

import { basicStrategyDecision, type BasicStrategyAction } from "@/lib/gold-standard/simulation/basicStrategy";
import type { DealerSoft17Rule, DoublingRule } from "@/lib/gold-standard/gameDefinition";
import type { CardCode, Rank } from "@/types/investigation";
import type { PlayerActionDecision, PlayerObservation } from "./playerObservation";

/**
 * PRIORITY 1.7-3 — playing-deviation analysis, split cleanly into two
 * halves with two different honesty statuses:
 *
 * - BASIC-STRATEGY consistency (this file's `evaluateBasicStrategyOpportunity`
 *   / `computePlayingDeviationSummary`) is IMPLEMENTED + FUNCTIONAL — it
 *   reuses the exact, already-verified standard multi-deck S17 chart from
 *   lib/gold-standard/simulation/basicStrategy.ts (never a second copy, per
 *   docs/EYEONPIT_1_6_ARCHITECTURE.md's "wrap, don't rewrite" principle).
 * - INDEX-deviation consistency (whether an observed deviation matches a
 *   KNOWN count-threshold index play, e.g. "16 vs 10 stand at TC >= 0") is
 *   FOUNDATION ONLY. No index table ships with this file — see
 *   `IndexDeviationTable` below. "Do not invent strategy/index data" (this
 *   priority's own rule) means EyeOnPit does not bundle a hand-typed
 *   Illustrious-18-style table without a deliberate, separately-reviewed,
 *   sourced decision to do so; the lookup/threshold-comparison MACHINERY is
 *   real and tested, but produces `indexConsistent: null` for every
 *   opportunity until a caller supplies a real, sourced table.
 *
 * SCOPE LIMITATION (documented, not hidden): only the FIRST decision point
 * of each hand (the initial two cards vs. the dealer's up-card) is
 * evaluated — matching basicStrategyDecision's own contract. A hand's
 * later hit/stand decisions on a 3+ card hand are not currently
 * re-evaluated; `SeatRoundRecord.playerCards`/`actions` aren't positionally
 * aligned in a way that safely reconstructs every intermediate hand state
 * without risking a subtly wrong comparison, so this stays out of scope
 * for this pass rather than being guessed at.
 */
export const PLAYING_DEVIATION_ANALYSIS_VERSION = 1;

export interface DeviationRuleSet {
  dealerSoft17: DealerSoft17Rule;
  doublingRule: DoublingRule;
  canDouble: boolean;
  canSplit: boolean;
  canSurrender: boolean;
}

/** The same standard multi-deck S17 assumption basicStrategy.ts itself documents as its scope — used as the default ruleset when the caller doesn't supply one (e.g. because the investigation's own GameDefinition isn't known at analysis time). */
export const DEFAULT_DEVIATION_RULE_SET: DeviationRuleSet = {
  dealerSoft17: "S17",
  doublingRule: "any-two-cards",
  canDouble: true,
  canSplit: true,
  canSurrender: true,
};

/** A citable, sourced count-threshold index play — e.g. "stand on 16 vs 10 at true count >= 0" (the well-known Illustrious 18 entry). Deliberately NOT bundled with any real entries — see this file's own doc comment. */
export interface IndexDeviationEntry {
  situationKey: string;
  deviationAction: BasicStrategyAction;
  trueCountThreshold: number;
  thresholdDirection: "at-or-above" | "at-or-below";
  source: string;
}
export type IndexDeviationTable = IndexDeviationEntry[];

/** A stable, human-readable key for a (hand, upcard) situation — e.g. "16v10", "A,8v6", "pair-8v5". Used to look up an IndexDeviationEntry; also usable directly as a report-friendly label. */
export function buildSituationKey(initialCards: CardCode[], dealerUpcard: Rank): string {
  if (initialCards.length === 2 && initialCards[0].rank === initialCards[1].rank) {
    return `pair-${initialCards[0].rank}v${dealerUpcard}`;
  }
  const total = initialCards.reduce((sum, c) => sum + (c.rank === "A" ? 11 : ["10", "J", "Q", "K"].includes(c.rank) ? 10 : Number(c.rank)), 0);
  const hasAce = initialCards.some((c) => c.rank === "A");
  const soft = hasAce && total <= 21 && initialCards.length === 2;
  return `${soft ? "soft-" : ""}${total}v${dealerUpcard}`;
}

function lookupIndexDeviation(table: IndexDeviationTable, situationKey: string): IndexDeviationEntry | null {
  return table.find((entry) => entry.situationKey === situationKey) ?? null;
}

/** Maps the recorded first PlayerActionDecision onto a comparable BasicStrategyAction — "blackjack"/"other"/"insurance" have no basic-strategy equivalent decision and are excluded from comparison (see `hasComparableFirstAction`). */
function toComparableAction(action: PlayerActionDecision): BasicStrategyAction | null {
  switch (action) {
    case "hit":
    case "stand":
    case "double":
    case "split":
    case "surrender":
      return action;
    default:
      return null;
  }
}

export interface DeviationOpportunity {
  observationId: string;
  handSequenceNumber: number;
  situationKey: string;
  trueCountAtWager: number | null;
  basicStrategyAction: BasicStrategyAction;
  observedAction: BasicStrategyAction | null;
  isDeviation: boolean;
  /** null unless a real IndexDeviationTable was supplied AND this exact situation has a known entry in it — never guessed. */
  indexConsistent: boolean | null;
  indexEntryUsed: IndexDeviationEntry | null;
}

export interface PlayingDeviationSummary {
  version: number;
  ruleSetUsed: DeviationRuleSet;
  indexTableProvided: boolean;
  opportunities: DeviationOpportunity[];
  totalOpportunities: number;
  totalDeviations: number;
  deviationRate: number | null;
  /** Of the deviations that occurred in a situation with a known index entry, the fraction that matched it. Null whenever indexTableProvided is false OR no deviation happened to occur in an indexed situation — never a fabricated rate. */
  indexConsistentDeviationRate: number | null;
}

/** Evaluates ONE observation's first decision point. Returns null when the observation has no usable initial-hand/action data (e.g. no cards recorded, or the first action has no basic-strategy equivalent — insurance/blackjack/other). */
export function evaluateFirstDecisionOpportunity(
  observation: PlayerObservation,
  ruleSet: DeviationRuleSet = DEFAULT_DEVIATION_RULE_SET,
  indexTable: IndexDeviationTable = []
): DeviationOpportunity | null {
  if (!observation.playerCards || observation.playerCards.length < 2) return null;
  if (!observation.dealerUpcard) return null;
  const firstAction = observation.actions[0];
  if (!firstAction) return null;
  const observedAction = toComparableAction(firstAction);
  if (!observedAction) return null;

  const initialCards = observation.playerCards.slice(0, 2);
  const basicStrategyAction = basicStrategyDecision({
    playerCards: initialCards,
    dealerUpcard: observation.dealerUpcard,
    dealerSoft17: ruleSet.dealerSoft17,
    doublingRule: ruleSet.doublingRule,
    canDouble: ruleSet.canDouble,
    canSplit: ruleSet.canSplit,
    canSurrender: ruleSet.canSurrender,
  });

  const isDeviation = observedAction !== basicStrategyAction;
  const situationKey = buildSituationKey(initialCards, observation.dealerUpcard);
  const indexEntry = indexTable.length > 0 ? lookupIndexDeviation(indexTable, situationKey) : null;

  let indexConsistent: boolean | null = null;
  if (indexEntry) {
    const tc = observation.trueCountAtWager;
    const thresholdMet =
      tc != null &&
      (indexEntry.thresholdDirection === "at-or-above" ? tc >= indexEntry.trueCountThreshold : tc <= indexEntry.trueCountThreshold);
    // The deviation is "index consistent" when the player took the indexed
    // deviation action exactly when (and only when) the threshold was met.
    indexConsistent = thresholdMet ? observedAction === indexEntry.deviationAction : observedAction === basicStrategyAction;
  }

  return {
    observationId: observation.id,
    handSequenceNumber: observation.handSequenceNumber,
    situationKey,
    trueCountAtWager: observation.trueCountAtWager,
    basicStrategyAction,
    observedAction,
    isDeviation,
    indexConsistent,
    indexEntryUsed: indexEntry,
  };
}

export function computePlayingDeviationSummary(
  observations: PlayerObservation[],
  ruleSet: DeviationRuleSet = DEFAULT_DEVIATION_RULE_SET,
  indexTable: IndexDeviationTable = []
): PlayingDeviationSummary {
  const opportunities = observations
    .filter((o) => !o.isSplitHand)
    .map((o) => evaluateFirstDecisionOpportunity(o, ruleSet, indexTable))
    .filter((o): o is DeviationOpportunity => o != null);

  const totalDeviations = opportunities.filter((o) => o.isDeviation).length;
  const indexedOpportunities = opportunities.filter((o) => o.indexEntryUsed != null);
  const indexConsistentCount = indexedOpportunities.filter((o) => o.indexConsistent).length;

  return {
    version: PLAYING_DEVIATION_ANALYSIS_VERSION,
    ruleSetUsed: ruleSet,
    indexTableProvided: indexTable.length > 0,
    opportunities,
    totalOpportunities: opportunities.length,
    totalDeviations,
    deviationRate: opportunities.length === 0 ? null : totalDeviations / opportunities.length,
    indexConsistentDeviationRate: indexedOpportunities.length === 0 ? null : indexConsistentCount / indexedOpportunities.length,
  };
}

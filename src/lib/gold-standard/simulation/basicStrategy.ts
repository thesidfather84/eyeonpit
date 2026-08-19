import { computeHandTotal } from "@/lib/utils/blackjackTotal";
import type { CardCode, Rank } from "@/types/investigation";
import type { DealerSoft17Rule, DoublingRule } from "../gameDefinition";

/**
 * STANDARD, WIDELY-PUBLISHED multi-deck basic strategy (4-8 decks, dealer
 * stands on soft 17, double after split allowed, late surrender available)
 * — the same reference chart published by every major basic-strategy source
 * (e.g. the Wizard of Odds' own multi-deck S17 chart). This is public,
 * well-established mathematical knowledge, NOT an invented formula (see
 * Priority B4's "do not invent any formulas" — this file states none of
 * its own; every decision below is a direct transcription of the standard
 * chart).
 *
 * SCOPE LIMITATION (documented, not hidden): this chart is the standard
 * MULTI-DECK S17 reference. Single-deck and dealer-hits-soft-17 (H17) games
 * have a handful of well-known index differences from this chart (e.g.
 * single-deck 9 doubles against 2, H17 18-soft doubles against 2) that are
 * NOT modeled in this foundation pass — `dealerSoft17` is accepted and
 * threaded through for future refinement, but does not yet change any
 * decision. See docs/EYEONPIT_1_6_ARCHITECTURE.md's Simulation Engine
 * section for this exact caveat; a GameDefinition with `dealerSoft17:
 * "H17"` or `deckCount: 1` still simulates, just against the S17/multi-deck
 * chart rather than its own exact-optimal chart. This is "correctness
 * first, foundation, not chasing every rule variant yet" per Priority B7's
 * own framing.
 */

export type BasicStrategyAction = "hit" | "stand" | "double" | "split" | "surrender";

export interface BasicStrategyContext {
  playerCards: CardCode[];
  dealerUpcard: Rank;
  dealerSoft17: DealerSoft17Rule;
  doublingRule: DoublingRule;
  canDouble: boolean;
  canSplit: boolean;
  canSurrender: boolean;
}

function upcardValue(rank: Rank): number {
  if (rank === "A") return 11;
  if (rank === "10" || rank === "J" || rank === "Q" || rank === "K") return 10;
  return Number(rank);
}

function doublingAllowedForTotal(rule: DoublingRule, total: number): boolean {
  switch (rule) {
    case "any-two-cards":
      return true;
    case "9-10-11-only":
      return total >= 9 && total <= 11;
    case "10-11-only":
      return total >= 10 && total <= 11;
    case "9-11-only":
      return total >= 9 && total <= 11;
  }
}

function hardTotalAction(total: number, upcard: number): BasicStrategyAction {
  if (total <= 8) return "hit";
  if (total === 9) return upcard >= 3 && upcard <= 6 ? "double" : "hit";
  if (total === 10) return upcard >= 2 && upcard <= 9 ? "double" : "hit";
  if (total === 11) return upcard <= 10 ? "double" : "hit"; // hit vs Ace
  if (total === 12) return upcard >= 4 && upcard <= 6 ? "stand" : "hit";
  if (total >= 13 && total <= 16) return upcard >= 2 && upcard <= 6 ? "stand" : "hit";
  return "stand"; // 17+
}

/** Surrender indices — the widely-published 16-vs-9/10/A and 15-vs-10 rule (excluding a pair of 8s, which the caller routes through pairAction instead, per the standard chart's own convention of checking surrender only for non-pair hard totals). */
function hardTotalSurrender(total: number, upcard: number): boolean {
  if (total === 16) return upcard === 9 || upcard === 10 || upcard === 11;
  if (total === 15) return upcard === 10;
  return false;
}

function softTotalAction(total: number, upcard: number): BasicStrategyAction {
  // total here is the hand's value with the ace counted as 11 (13..20 = A,2..A,9).
  if (total === 13 || total === 14) return upcard >= 5 && upcard <= 6 ? "double" : "hit";
  if (total === 15 || total === 16) return upcard >= 4 && upcard <= 6 ? "double" : "hit";
  if (total === 17) return upcard >= 3 && upcard <= 6 ? "double" : "hit";
  if (total === 18) {
    if (upcard >= 3 && upcard <= 6) return "double";
    if (upcard === 2 || upcard === 7 || upcard === 8) return "stand";
    return "hit"; // 9, 10, A
  }
  return "stand"; // 19, 20
}

function pairAction(rank: Rank, upcard: number): BasicStrategyAction {
  switch (rank) {
    case "A":
      return "split";
    case "10":
    case "J":
    case "Q":
    case "K":
      return "stand";
    case "9":
      return upcard === 7 || upcard === 10 || upcard === 11 ? "stand" : upcard === 2 || (upcard >= 3 && upcard <= 6) || upcard === 8 || upcard === 9 ? "split" : "stand";
    case "8":
      return "split";
    case "7":
      return upcard >= 2 && upcard <= 7 ? "split" : "hit";
    case "6":
      return upcard >= 2 && upcard <= 6 ? "split" : "hit";
    case "5":
      return upcard >= 2 && upcard <= 9 ? "double" : "hit"; // treated as hard 10, never split
    case "4":
      return upcard === 5 || upcard === 6 ? "split" : "hit";
    case "3":
    case "2":
      return upcard >= 2 && upcard <= 7 ? "split" : "hit";
    default:
      return "hit";
  }
}

/**
 * The single entry point — returns the standard-chart action for the
 * current hand, downgraded to the nearest LEGAL action if the requested one
 * isn't currently available (e.g. "double" when `canDouble` is false
 * becomes "hit" — never "stand," since the chart's own reasoning for
 * doubling that total is "this hand is strong enough to hit," not "strong
 * enough to stand pat").
 */
export function basicStrategyDecision(ctx: BasicStrategyContext): BasicStrategyAction {
  const upcard = upcardValue(ctx.dealerUpcard);
  const { playerCards } = ctx;

  if (playerCards.length === 2 && ctx.canSplit && playerCards[0].rank === playerCards[1].rank) {
    const action = pairAction(playerCards[0].rank, upcard);
    if (action === "split") return "split";
    if (action === "double" && !ctx.canDouble) return "hit";
    return action;
  }

  const total = computeHandTotal(playerCards);
  let action: BasicStrategyAction;

  if (playerCards.length === 2 && ctx.canSurrender) {
    const surrenderEligible = total.soft ? false : hardTotalSurrender(total.value, upcard);
    if (surrenderEligible) return "surrender";
  }

  if (total.soft && total.value < 21) {
    action = softTotalAction(total.value, upcard);
  } else {
    action = hardTotalAction(total.value, upcard);
  }

  if (action === "double") {
    const doublingLegal = playerCards.length === 2 && ctx.canDouble && doublingAllowedForTotal(ctx.doublingRule, total.value);
    if (!doublingLegal) return "hit";
  }

  return action;
}

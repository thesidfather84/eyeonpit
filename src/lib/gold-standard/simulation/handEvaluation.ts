import { computeHandTotal, isAutoDetectedBlackjack } from "@/lib/utils/blackjackTotal";
import type { CardCode, Rank } from "@/types/investigation";
import type { BlackjackPayout } from "../gameDefinition";

/**
 * Hand-total/bust/blackjack detection for the Simulation Engine (Priority
 * B7) REUSES `lib/utils/blackjackTotal.ts` — the exact same functions the
 * real Surveillance/Floor UI uses to display hand totals — rather than
 * reimplementing soft/hard/bust logic a second time. This file only adds
 * what's specific to a SIMULATED hand: payout math, which has no equivalent
 * anywhere else in the app (EyeOnPit's live product never settles bets —
 * see docs/EYEONPIT_PRODUCT_SPEC.md, it's an observation tool, not a game
 * engine — so payout calculation is genuinely new, 1.6-only logic).
 */

export function rankToCard(rank: Rank): CardCode {
  return { rank, suit: "unspecified" };
}

export function handTotal(cards: CardCode[]) {
  return computeHandTotal(cards);
}

export function isBlackjack(cards: CardCode[]): boolean {
  return isAutoDetectedBlackjack(cards);
}

export function blackjackPayoutMultiplier(payout: BlackjackPayout): number {
  switch (payout) {
    case "3:2":
      return 1.5;
    case "6:5":
      return 1.2;
    case "2:1":
      return 2;
    case "1:1":
      return 1;
  }
}

export type HandOutcome = "player-blackjack" | "dealer-blackjack" | "push" | "player-win" | "dealer-win" | "surrender";

/**
 * Net result in BETTING UNITS for one resolved hand (already-doubled bets
 * must be reflected in `betUnits` by the caller — this function doesn't
 * know a hand was doubled, only what was ultimately at risk). Positive =
 * player gains, negative = player loses, 0 = push. Standard rules: a push
 * against a dealer blackjack (player also has blackjack) returns 0; a
 * surrender always returns -0.5x the ORIGINAL bet (handled by the caller
 * passing half the bet as `betUnits` for a surrendered hand, with outcome
 * "surrender").
 */
export function settleHand(outcome: HandOutcome, betUnits: number, blackjackPayout: BlackjackPayout): number {
  switch (outcome) {
    case "player-blackjack":
      return betUnits * blackjackPayoutMultiplier(blackjackPayout);
    case "dealer-blackjack":
      return -betUnits;
    case "push":
      return 0;
    case "player-win":
      return betUnits;
    case "dealer-win":
      return -betUnits;
    case "surrender":
      return -betUnits; // caller passes HALF the original bet as betUnits for a surrender
  }
}

/** Determines the outcome of a resolved (non-blackjack) hand once both the player's and dealer's final totals are known — player has already stood/busted, dealer has already played out. */
export function resolveNonBlackjackOutcome(playerCards: CardCode[], dealerCards: CardCode[]): HandOutcome {
  const player = computeHandTotal(playerCards);
  const dealer = computeHandTotal(dealerCards);
  if (player.bust) return "dealer-win";
  if (dealer.bust) return "player-win";
  if (player.value > dealer.value) return "player-win";
  if (player.value < dealer.value) return "dealer-win";
  return "push";
}

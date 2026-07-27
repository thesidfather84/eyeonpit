import type { CardCode, HandOutcome } from "@/types/investigation";
import { computeHandTotal, isAutoDetectedBlackjack } from "./blackjackTotal";

/**
 * Standard blackjack comparison between a finished player hand and the
 * dealer's hand, applied once — at round completion — never a manual
 * operator choice. A hand that already carries an outcome (Surrender, Void,
 * or a Manual Blackjack correction, all set immediately when the operator
 * taps them) is never passed through this function; completeRound() only
 * calls it for hands still unresolved.
 */
export function deriveHandOutcome(playerCards: CardCode[], dealerCards: CardCode[]): HandOutcome {
  if (playerCards.length === 0) return null;

  const player = computeHandTotal(playerCards);
  if (player.bust) return "loss";

  const playerBlackjack = isAutoDetectedBlackjack(playerCards);
  const dealerBlackjack = isAutoDetectedBlackjack(dealerCards);
  if (playerBlackjack && dealerBlackjack) return "push";
  if (playerBlackjack) return "blackjack";
  if (dealerBlackjack) return "loss";

  const dealer = computeHandTotal(dealerCards);
  if (dealer.bust) return "win";
  if (player.value > dealer.value) return "win";
  if (player.value < dealer.value) return "loss";
  return "push";
}

import { isBalancedSystem } from "./countTags";
import type { CountingSystem } from "./types";

/**
 * Documented minimum divisor. Decks remaining shrinks toward 0 near the end
 * of a shoe; dividing by a near-zero number would blow the true count up
 * toward +/-Infinity for the last handful of cards. A quarter-deck floor
 * keeps the value large-but-finite and consistent instead.
 */
export const MIN_DECKS_REMAINING = 0.25;

/** remainingCards = totalDecks*52 - exposedCardCount; decksRemaining = remainingCards/52, floored at MIN_DECKS_REMAINING. */
export function computeDecksRemaining(totalDecks: number, exposedCardCount: number): number {
  const remainingCards = totalDecks * 52 - exposedCardCount;
  return Math.max(MIN_DECKS_REMAINING, remainingCards / 52);
}

/**
 * True count is only a meaningful conversion for balanced systems — KO is
 * unbalanced by design and never goes through this conversion in published
 * methodology (its IRC-seeded running count is already the actionable
 * number). Returns null for any unbalanced system; callers must render null
 * as "N/A", never coerce it to 0 or to the running count.
 *
 * Returns the EXACT, unrounded value. Nothing in the engine rounds this —
 * see roundTrueCountForDisplay for the one place display rounding happens.
 */
export function calculateTrueCount(
  system: CountingSystem,
  running: number,
  decksRemaining: number
): number | null {
  if (!isBalancedSystem(system)) return null;
  return running / decksRemaining;
}

/**
 * Display-only rounding policy: round-half-away-from-zero to one decimal
 * place. This is the single place any true count is ever rounded — the
 * engine, the ledger, and every stored/derived value upstream of the UI
 * stay at full precision. Pass-through for null (unsupported/KO).
 */
export function roundTrueCountForDisplay(value: number | null): number | null {
  if (value == null) return null;
  const sign = value < 0 ? -1 : 1;
  return sign * (Math.round(Math.abs(value) * 10) / 10);
}

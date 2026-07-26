import type { SeatRoundRecord } from "@/types/investigation";

/**
 * True once a hand may not take any more cards: an outcome has already
 * been recorded (including Surrender, which sets outcome immediately), or
 * the hand was doubled and has already received its one additional card.
 * Undo reverses both paths automatically, since each is just a normal
 * round mutation.
 */
export function isSeatLocked(seat: SeatRoundRecord | undefined): boolean {
  if (!seat) return false;
  if (seat.outcome != null) return true;
  if (seat.doubled && seat.doubledAtCardCount != null) {
    return seat.playerCards.length > seat.doubledAtCardCount;
  }
  return false;
}

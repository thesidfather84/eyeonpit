import { computeHandTotal, isAutoDetectedBlackjack } from "./blackjackTotal";
import type { SeatRoundRecord } from "@/types/investigation";

const OUTCOME_LABEL: Record<Exclude<SeatRoundRecord["outcome"], null>, string> = {
  win: "WIN",
  loss: "LOSS",
  push: "PUSH",
  blackjack: "BLACKJACK",
  surrender: "SURRENDERED",
  void: "VOID",
};

/**
 * A concise, always-derived (never invented) STATUS label for the active
 * seat panel — every branch reads only state EyeOnPit already tracks
 * (outcome, doubled/doubledAtCardCount, playerCards). AGENTS.md operational
 * UI rebuild §8: "Only display states supported by EyeOnPit."
 */
export function computeSeatStatusLabel(record: SeatRoundRecord | undefined): string {
  if (!record) return "EMPTY";
  if (record.outcome != null) return OUTCOME_LABEL[record.outcome];
  if (record.doubled && record.doubledAtCardCount != null) {
    if (record.playerCards.length <= record.doubledAtCardCount) {
      return "DOUBLED — 1 MORE CARD";
    }
  }
  if (record.playerCards.length === 0) return "WAITING FOR CARDS";
  if (isAutoDetectedBlackjack(record.playerCards)) return "BLACKJACK";
  const total = computeHandTotal(record.playerCards);
  if (total.bust) return "BUST";
  return "IN PLAY";
}

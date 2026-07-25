import type { CardCode } from "@/types/investigation";

export function formatCard(card: CardCode): string {
  return card.suit === "unspecified" ? card.rank : `${card.rank}${card.suit}`;
}

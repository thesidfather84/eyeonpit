import { formatCard } from "@/lib/utils/cards";
import type { CardCode } from "@/types/investigation";

export function CardTile({ card, dim }: { card: CardCode; dim?: boolean }) {
  return (
    <span
      className={`flex h-9 min-w-9 items-center justify-center rounded-md border border-border bg-surface-raised px-1.5 text-sm font-semibold ${
        dim ? "text-muted-foreground" : "text-foreground"
      }`}
    >
      {formatCard(card)}
    </span>
  );
}

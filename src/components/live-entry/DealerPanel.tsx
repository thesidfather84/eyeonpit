import { computeHandTotal } from "@/lib/utils/blackjackTotal";
import { formatCard } from "@/lib/utils/cards";
import { CardPlaceholder } from "./CardPlaceholder";
import type { DealerHand } from "@/types/investigation";

/**
 * Permanent, pinned dealer panel — visible regardless of which seat is
 * active on the SeatRail below it, because dealer cards belong to the round,
 * not to any one seat (plan.md §0.5/§10). Card entry is a placeholder here;
 * real tap-pad interaction lands in Phase 3 (plan.md §11).
 */
export function DealerPanel({ dealerHand }: { dealerHand: DealerHand }) {
  const visibleCards = [
    ...(dealerHand.upcard ? [dealerHand.upcard] : []),
    ...(dealerHand.holeCardRevealed && dealerHand.holeCard ? [dealerHand.holeCard] : []),
    ...dealerHand.drawCards,
  ];
  const total = visibleCards.length > 0 ? computeHandTotal(visibleCards) : null;

  return (
    <div className="border-b border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Dealer
        </span>
        <span className="text-sm font-medium text-foreground">
          {total
            ? `${total.soft ? "Soft " : ""}${total.value}${total.bust ? " — Bust" : ""}`
            : "—"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <CardPlaceholder label={dealerHand.upcard ? formatCard(dealerHand.upcard) : "Upcard"} />
        <CardPlaceholder
          label={
            dealerHand.holeCardRevealed
              ? dealerHand.holeCard
                ? formatCard(dealerHand.holeCard)
                : "Hole"
              : "Hidden"
          }
        />
        {dealerHand.drawCards.map((card, index) => (
          <CardPlaceholder key={index} label={formatCard(card)} />
        ))}
        <button
          disabled
          title="Card entry lands in Phase 3"
          className="tap-target rounded-lg border border-dashed border-border px-3 text-sm text-muted-foreground opacity-60"
        >
          + Add Card
        </button>
      </div>

      <div className="mt-2 flex gap-2">
        <button
          disabled
          className="tap-target flex-1 rounded-lg border border-border bg-surface-raised text-xs text-muted-foreground opacity-50"
        >
          Dealer Blackjack
        </button>
        <button
          disabled
          className="tap-target flex-1 rounded-lg border border-border bg-surface-raised text-xs text-muted-foreground opacity-50"
        >
          Dealer Bust
        </button>
        <button
          disabled
          className="tap-target rounded-lg border border-border bg-surface-raised px-3 text-xs text-muted-foreground opacity-50"
        >
          Undo
        </button>
        <button
          disabled
          className="tap-target rounded-lg border border-border bg-surface-raised px-3 text-xs text-muted-foreground opacity-50"
        >
          Clear
        </button>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">Card entry lands in Phase 3.</p>
    </div>
  );
}

"use client";

import { BottomSheet } from "@/components/ui/BottomSheet";
import { useInvestigationContext } from "@/contexts/InvestigationContext";

interface DealerOptionsSheetProps {
  onClose: () => void;
}

/**
 * The dealer's deliberate-action menu — reached only via the small "⋯"
 * button beside the dealer tile, never by the primary tap (which only
 * makes the dealer the active card-entry target). Mirrors the seat tile's
 * "⋮" options pattern so both table positions follow the same rule:
 * primary tap = primary action, secondary actions = a separate control.
 */
export function DealerOptionsSheet({ onClose }: DealerOptionsSheetProps) {
  const { currentRound, mutate } = useInvestigationContext();
  const hasCards = currentRound.dealerHand.cards.length > 0;

  async function handleClear() {
    await mutate(
      (round) => ({ ...round, dealerHand: { cards: [] } }),
      { type: "correction", message: "Dealer cards cleared" }
    );
    onClose();
  }

  return (
    <BottomSheet open onClose={onClose} title="Dealer Options">
      <div className="flex flex-col gap-1 pb-4">
        <button
          onClick={handleClear}
          disabled={!hasCards}
          className="tap-target rounded-xl border border-border bg-surface-raised px-3 text-left text-sm font-medium text-foreground hover:bg-surface disabled:opacity-40"
        >
          Clear Dealer Hand
        </button>
        <button
          onClick={onClose}
          className="tap-target rounded-xl border border-border bg-surface-raised px-3 text-left text-sm font-medium text-muted-foreground hover:bg-surface"
        >
          Cancel
        </button>
      </div>
    </BottomSheet>
  );
}

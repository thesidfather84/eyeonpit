import { useState } from "react";
import { computeHandTotal, deriveDealerResult } from "@/lib/utils/blackjackTotal";
import { formatCard } from "@/lib/utils/cards";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { DealerOptionsSheet } from "./DealerOptionsSheet";

const RESULT_LABEL: Record<"blackjack" | "bust", string> = {
  blackjack: "BLACKJACK",
  bust: "BUST",
};

interface DealerTileProps {
  /** Owned by TableMap. While true, a tap opens DealerOptionsSheet instead of selecting the dealer. */
  editMode: boolean;
  /** Called the instant a tap-while-editing actually opens the options sheet — TableMap uses this to exit Edit Mode immediately, one-shot. */
  onOptionsOpened: () => void;
}

/**
 * The dealer as a table position, not a separate control box — sits in
 * the same grid as the seven seats, just visually stronger (red) since
 * it's the one position every hand is measured against. In normal
 * operation a plain tap is the tile's one primary action: it makes the
 * dealer the active target for card entry, exactly like a seat, and never
 * opens anything else. DealerOptionsSheet is reached only through Edit
 * Mode (see TableMap) — the tile has no per-tile icon button of its own
 * anymore, since that was too easy to catch by accident while working
 * around the tile during fast entry. Every card shown here was actually
 * entered — there is no hidden/hole-card concept, so nothing is ever
 * displayed as "Hidden".
 */
export function DealerTile({ editMode, onOptionsOpened }: DealerTileProps) {
  const { currentRound, activeTarget, setActiveTarget } = useInvestigationContext();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const cards = currentRound.dealerHand.cards;
  const total = cards.length > 0 ? computeHandTotal(cards) : null;
  const result = deriveDealerResult(cards);
  const isActive = activeTarget === "dealer";

  function handleTap() {
    if (editMode) {
      setOptionsOpen(true);
      onOptionsOpened();
      return;
    }
    setActiveTarget("dealer");
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={editMode ? "Dealer options" : "Dealer"}
        onClick={handleTap}
        style={{ touchAction: "manipulation" }}
        className={`relative flex min-h-[46px] w-full flex-col justify-center gap-0.5 rounded-xl py-1 pl-2 pr-1 text-left short:min-h-[64px] ${
          isActive ? "border-2 bg-dealer/10" : "border-2 bg-surface-raised"
        } border-dealer ${editMode ? "outline outline-2 outline-offset-2 outline-accent" : ""}`}
      >
        <span className="text-[10px] font-bold leading-tight text-dealer">
          {isActive ? "ACTIVE · DEALER" : "DEALER"}
        </span>
        <span className="text-[10px] leading-tight text-muted-foreground">
          {cards.length > 0 ? cards.map(formatCard).join(" · ") : "Not entered"}
        </span>
        <span className={`text-sm font-semibold leading-tight ${total?.bust ? "text-dealer" : "text-foreground"}`}>
          {result ? RESULT_LABEL[result] : total ? `${total.soft ? "S" : ""}${total.value}` : "—"}
        </span>
      </button>

      {optionsOpen && <DealerOptionsSheet onClose={() => setOptionsOpen(false)} />}
    </div>
  );
}

import { computeHandTotal, deriveDealerResult } from "@/lib/utils/blackjackTotal";
import { formatCard } from "@/lib/utils/cards";
import { useInvestigationContext } from "@/contexts/InvestigationContext";

const RESULT_LABEL: Record<"blackjack" | "bust", string> = {
  blackjack: "BLACKJACK",
  bust: "BUST",
};

/**
 * The dealer as a table position, not a separate control box — sits in
 * the same grid as the seven seats, just visually stronger (red) since
 * it's the one position every hand is measured against. Tapping it makes
 * it the active target for card entry, exactly like a seat. Every card
 * shown here was actually entered — there is no hidden/hole-card concept,
 * so nothing is ever displayed as "Hidden".
 */
export function DealerTile() {
  const { currentRound, activeTarget, setActiveTarget } = useInvestigationContext();
  const cards = currentRound.dealerHand.cards;
  const total = cards.length > 0 ? computeHandTotal(cards) : null;
  const result = deriveDealerResult(cards);
  const isActive = activeTarget === "dealer";

  return (
    <button
      type="button"
      onClick={() => setActiveTarget("dealer")}
      style={{ touchAction: "manipulation" }}
      className={`tap-target relative flex min-h-[60px] flex-col justify-center gap-0.5 rounded-xl py-1 pl-2 pr-1 text-left ${
        isActive ? "border-2 bg-dealer/10" : "border-2 bg-surface-raised"
      } border-dealer`}
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
  );
}

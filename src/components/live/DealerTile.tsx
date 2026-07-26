import { computeHandTotal, dealerVisibleCards } from "@/lib/utils/blackjackTotal";
import { formatCard } from "@/lib/utils/cards";
import { useInvestigationContext } from "@/contexts/InvestigationContext";

const RESULT_LABEL: Record<string, string> = {
  stand: "STAND",
  blackjack: "BLACKJACK",
  bust: "BUST",
};

/**
 * The dealer as a table position, not a separate control box — sits in
 * the same grid as the seven seats, just visually stronger (red) since
 * it's the one position every hand is measured against. Tapping it makes
 * it the active target; its actions (Reveal/Stand/BJ/Bust/Clear) live in
 * the shared control dock below, exactly like a seat's actions do.
 */
export function DealerTile() {
  const { currentRound, activeTarget, setActiveTarget } = useInvestigationContext();
  const dealerHand = currentRound.dealerHand;
  const visible = dealerVisibleCards(dealerHand);
  const total = visible.length > 0 ? computeHandTotal(visible) : null;
  const isActive = activeTarget === "dealer" || activeTarget === "dealer-hole";

  const cardParts: string[] = [];
  if (dealerHand.upcard) cardParts.push(formatCard(dealerHand.upcard));
  if (dealerHand.holeCardRevealed && dealerHand.holeCard) {
    cardParts.push(formatCard(dealerHand.holeCard));
  } else if (dealerHand.upcard) {
    cardParts.push("Hidden");
  }
  cardParts.push(...dealerHand.drawCards.map(formatCard));

  return (
    <button
      type="button"
      onClick={() => setActiveTarget("dealer")}
      style={{ touchAction: "manipulation" }}
      className={`tap-target relative flex min-h-[68px] flex-col justify-center gap-0.5 rounded-xl py-1.5 pl-2 pr-1 text-left ${
        isActive ? "border-2 bg-dealer/10" : "border-2 bg-surface-raised"
      } border-dealer`}
    >
      <span className="text-[10px] font-bold leading-tight text-dealer">
        {isActive ? "ACTIVE · DEALER" : "DEALER"}
      </span>
      <span className="text-[10px] leading-tight text-muted-foreground">
        {cardParts.length > 0 ? cardParts.join(" · ") : "Not entered"}
      </span>
      <span className={`text-sm font-semibold leading-tight ${total?.bust ? "text-dealer" : "text-foreground"}`}>
        {dealerHand.result
          ? RESULT_LABEL[dealerHand.result]
          : total
            ? `${total.soft ? "S" : ""}${total.value}`
            : "—"}
      </span>
    </button>
  );
}

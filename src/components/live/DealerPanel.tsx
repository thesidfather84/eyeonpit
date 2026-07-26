import { computeHandTotal, dealerVisibleCards } from "@/lib/utils/blackjackTotal";
import { formatCard } from "@/lib/utils/cards";
import { useInvestigationContext } from "@/contexts/InvestigationContext";

const RESULT_LABEL: Record<string, string> = {
  stand: "STAND",
  blackjack: "BLACKJACK",
  bust: "BUST",
};

/**
 * Permanent, compact dealer panel — one shared DealerHand per round, never
 * duplicated into seat records. The cards line is the tap target for the
 * upcard/draws; Reveal is the explicit, discoverable way into the hole
 * card. Blackjack/Bust/Stand are explicit taps, not silent auto-derivation.
 */
export function DealerPanel() {
  const { investigation, currentRound, activeTarget, setActiveTarget, mutate, busy } =
    useInvestigationContext();
  const dealerHand = currentRound.dealerHand;
  const visible = dealerVisibleCards(dealerHand);
  const total = visible.length > 0 ? computeHandTotal(visible) : null;
  const disabled = busy || investigation.status !== "active";

  const isDealerTarget = activeTarget === "dealer";
  const isHoleTarget = activeTarget === "dealer-hole";
  const canRevealHole = Boolean(dealerHand.upcard) && !dealerHand.holeCardRevealed;
  const canDeclareResult = dealerHand.holeCardRevealed && dealerHand.result === null;
  const canStand = canDeclareResult && total !== null && !total.bust && total.value >= 17;

  const cardParts: string[] = [];
  if (dealerHand.upcard) cardParts.push(formatCard(dealerHand.upcard));
  if (dealerHand.holeCardRevealed && dealerHand.holeCard) {
    cardParts.push(formatCard(dealerHand.holeCard));
  } else if (dealerHand.upcard) {
    cardParts.push("Hidden");
  }
  cardParts.push(...dealerHand.drawCards.map(formatCard));

  function setResult(result: "blackjack" | "bust" | "stand", label: string) {
    mutate((round) => ({ ...round, dealerHand: { ...round.dealerHand, result } }), {
      type: "dealer-reveal",
      message: `Dealer: ${label}`,
    });
  }

  function clearDealer() {
    mutate(
      (round) => ({
        ...round,
        dealerHand: { upcard: null, holeCard: null, holeCardRevealed: false, drawCards: [], result: null },
      }),
      { type: "correction", message: "Dealer cards cleared" }
    );
  }

  return (
    <div
      className={`flex-none border-b border-border bg-surface p-1.5 ${
        isDealerTarget || isHoleTarget ? "ring-1 ring-inset ring-accent" : ""
      }`}
    >
      <div className="mb-1 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setActiveTarget("dealer")}
          className="text-left"
        >
          <span className="text-xs font-bold text-foreground">DEALER</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {cardParts.length > 0 ? cardParts.join(" · ") : "Not entered"}
          </span>
        </button>
        <span className="text-sm font-semibold text-foreground">
          {dealerHand.result
            ? RESULT_LABEL[dealerHand.result]
            : total
              ? `${total.soft ? "Soft " : ""}${total.value}`
              : "—"}
        </span>
      </div>

      <div className="grid grid-cols-5 gap-1">
        <button
          onClick={() => setActiveTarget("dealer-hole")}
          disabled={!canRevealHole}
          className="tap-target rounded-md border border-border bg-surface-raised text-[11px] font-medium text-foreground disabled:opacity-40"
        >
          Reveal
        </button>
        <button
          onClick={() => setResult("stand", "Stands")}
          disabled={!canStand || disabled}
          className="tap-target rounded-md border border-border bg-surface-raised text-[11px] font-medium text-foreground disabled:opacity-40"
        >
          Stand
        </button>
        <button
          onClick={() => setResult("blackjack", "Blackjack")}
          disabled={!canDeclareResult || disabled}
          className="tap-target rounded-md border border-border bg-surface-raised text-[11px] font-medium text-foreground disabled:opacity-40"
        >
          BJ
        </button>
        <button
          onClick={() => setResult("bust", "Bust")}
          disabled={!canDeclareResult || disabled}
          className="tap-target rounded-md border border-border bg-surface-raised text-[11px] font-medium text-foreground disabled:opacity-40"
        >
          Bust
        </button>
        <button
          onClick={clearDealer}
          disabled={disabled || cardParts.length === 0}
          className="tap-target rounded-md border border-border bg-surface-raised text-[11px] font-medium text-foreground disabled:opacity-40"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

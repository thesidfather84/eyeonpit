import { computeHandTotal, dealerVisibleCards } from "@/lib/utils/blackjackTotal";
import { useInvestigationContext } from "@/contexts/InvestigationContext";

/**
 * Dealer's actions — Reveal/Stand/BJ/Bust/Clear — live in the shared
 * control dock, exactly like a seat's actions, rather than permanently
 * occupying space in the table map above. Shown only while the dealer (or
 * the dealer's hole card) is the active target.
 */
export function DealerActionsRow() {
  const { investigation, currentRound, setActiveTarget, mutate, busy } = useInvestigationContext();
  const dealerHand = currentRound.dealerHand;
  const visible = dealerVisibleCards(dealerHand);
  const total = visible.length > 0 ? computeHandTotal(visible) : null;
  const disabled = busy || investigation.status !== "active" || currentRound.completed;

  const canRevealHole = Boolean(dealerHand.upcard) && !dealerHand.holeCardRevealed;
  const canDeclareResult = dealerHand.holeCardRevealed && dealerHand.result === null;
  const canStand = canDeclareResult && total !== null && !total.bust && total.value >= 17;
  const hasCards = Boolean(dealerHand.upcard) || dealerHand.drawCards.length > 0;

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
    <div className="grid grid-cols-5 gap-1 border-b border-border bg-surface p-1.5">
      <button
        onClick={() => setActiveTarget("dealer-hole")}
        disabled={!canRevealHole || disabled}
        className="tap-target rounded-md border border-dealer/60 bg-dealer/10 text-[11px] font-medium text-dealer disabled:opacity-40"
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
        disabled={disabled || !hasCards}
        className="tap-target rounded-md border border-border bg-surface-raised text-[11px] font-medium text-foreground disabled:opacity-40"
      >
        Clear
      </button>
    </div>
  );
}

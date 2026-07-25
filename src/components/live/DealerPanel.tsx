import { computeHandTotal, dealerVisibleCards } from "@/lib/utils/blackjackTotal";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { CardTile } from "./CardTile";

const RESULT_LABEL: Record<string, string> = {
  stand: "STAND",
  blackjack: "BLACKJACK",
  bust: "BUST",
};

/**
 * Permanent, always-visible dealer panel — one shared DealerHand per round,
 * never duplicated into seat records. Tapping the upcard/draw area or the
 * hidden hole-card slot sets the shared card-entry target (CardEntryPad
 * applies the next tapped rank to whichever target is active).
 */
export function DealerPanel() {
  const { currentRound, activeTarget, setActiveTarget, mutate, busy } = useInvestigationContext();
  const dealerHand = currentRound.dealerHand;
  const visible = dealerVisibleCards(dealerHand);
  const total = visible.length > 0 ? computeHandTotal(visible) : null;

  const isDealerTarget = activeTarget === "dealer";
  const isHoleTarget = activeTarget === "dealer-hole";
  const canRevealHole = Boolean(dealerHand.upcard) && !dealerHand.holeCardRevealed;
  const canStand =
    dealerHand.holeCardRevealed &&
    total !== null &&
    !total.bust &&
    total.value >= 17 &&
    dealerHand.result === null;

  function handleStand() {
    mutate((round) => ({ ...round, dealerHand: { ...round.dealerHand, result: "stand" } }), {
      type: "dealer-reveal",
      message: "Dealer stands",
    });
  }

  return (
    <div
      className={`flex-none border-b border-border bg-surface p-3 ${
        isDealerTarget || isHoleTarget ? "ring-1 ring-inset ring-accent" : ""
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Dealer
        </span>
        <span className="text-sm font-medium text-foreground">
          {dealerHand.result
            ? RESULT_LABEL[dealerHand.result]
            : total
              ? `${total.soft ? "Soft " : ""}${total.value}`
              : "—"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveTarget("dealer")}
          className={`rounded-md ${isDealerTarget ? "ring-2 ring-accent" : ""}`}
        >
          {dealerHand.upcard ? (
            <CardTile card={dealerHand.upcard} />
          ) : (
            <span className="flex h-9 min-w-9 items-center justify-center rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground">
              Upcard
            </span>
          )}
        </button>

        <button
          type="button"
          disabled={!canRevealHole && !isHoleTarget}
          onClick={() => setActiveTarget("dealer-hole")}
          className={`rounded-md disabled:cursor-default ${isHoleTarget ? "ring-2 ring-accent" : ""}`}
        >
          {dealerHand.holeCardRevealed && dealerHand.holeCard ? (
            <CardTile card={dealerHand.holeCard} />
          ) : (
            <span className="flex h-9 min-w-9 items-center justify-center rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground">
              {isHoleTarget ? "Tap value" : "Hidden"}
            </span>
          )}
        </button>

        {dealerHand.drawCards.map((card, index) => (
          <CardTile key={index} card={card} />
        ))}
      </div>

      <div className="mt-2 flex gap-2">
        <button
          onClick={handleStand}
          disabled={!canStand || busy}
          className="tap-target flex-1 rounded-lg border border-border bg-surface-raised text-xs font-medium text-foreground disabled:opacity-40"
        >
          Dealer Stands
        </button>
      </div>
    </div>
  );
}

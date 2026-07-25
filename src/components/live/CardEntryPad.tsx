"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { deriveDealerResult } from "@/lib/utils/blackjackTotal";
import { formatCard } from "@/lib/utils/cards";
import type { CardCode, Rank } from "@/types/investigation";

const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

/** Large rank-only buttons — suits are skipped in this build for entry speed. Applies to whichever target (dealer / dealer hole / seat) is currently active. */
export function CardEntryPad() {
  const { activeTarget, setActiveTarget, mutate, busy } = useInvestigationContext();

  const targetLabel =
    activeTarget === "dealer"
      ? "Dealer"
      : activeTarget === "dealer-hole"
        ? "Dealer hole card"
        : `Seat ${activeTarget}`;

  function handleTap(rank: Rank) {
    const card: CardCode = { rank, suit: "unspecified" };

    if (activeTarget === "dealer") {
      mutate(
        (round) => {
          const dh = round.dealerHand;
          const nextDh = dh.upcard
            ? { ...dh, drawCards: [...dh.drawCards, card] }
            : { ...dh, upcard: card };
          return { ...round, dealerHand: { ...nextDh, result: deriveDealerResult(nextDh) } };
        },
        { type: "card", message: `Dealer: ${formatCard(card)}` }
      );
      return;
    }

    if (activeTarget === "dealer-hole") {
      mutate(
        (round) => {
          const nextDh = { ...round.dealerHand, holeCard: card, holeCardRevealed: true };
          return { ...round, dealerHand: { ...nextDh, result: deriveDealerResult(nextDh) } };
        },
        { type: "dealer-reveal", message: `Dealer reveals hole card: ${formatCard(card)}` }
      );
      setActiveTarget("dealer");
      return;
    }

    const seatNumber = activeTarget;
    mutate(
      (round) => {
        const seat = round.seats[seatNumber];
        if (!seat) return round;
        return {
          ...round,
          seats: { ...round.seats, [seatNumber]: { ...seat, playerCards: [...seat.playerCards, card] } },
        };
      },
      { type: "card", message: `Seat ${seatNumber}: ${formatCard(card)}` }
    );
  }

  return (
    <div className="flex-none border-b border-border bg-surface p-3">
      <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        Tap card as it appears — target: <span className="text-accent">{targetLabel}</span>
      </p>
      <div className="grid grid-cols-5 gap-2">
        {RANKS.map((rank) => (
          <button
            key={rank}
            disabled={busy}
            onClick={() => handleTap(rank)}
            className="tap-target flex h-12 items-center justify-center rounded-lg border border-border bg-surface-raised text-lg font-bold text-foreground active:bg-accent active:text-accent-foreground disabled:opacity-40"
          >
            {rank}
          </button>
        ))}
      </div>
    </div>
  );
}

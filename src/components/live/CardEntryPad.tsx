"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { deriveDealerResult } from "@/lib/utils/blackjackTotal";
import { formatCard } from "@/lib/utils/cards";
import type { CardCode, Rank } from "@/types/investigation";

const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

/** Large rank-only buttons — suits are skipped for entry speed. Applies to whichever target (dealer / dealer hole / seat) is currently active, always visible in the lower-central portion of the console. */
export function CardEntryPad() {
  const { investigation, currentRound, activeTarget, setActiveTarget, mutate, advanceToNext, busy } =
    useInvestigationContext();
  const disabled = busy || investigation.status !== "active" || currentRound.completed;

  const targetLabel =
    activeTarget === "dealer"
      ? currentRound.dealerHand.upcard
        ? "DEALER"
        : "DEALER UPCARD"
      : activeTarget === "dealer-hole"
        ? "DEALER HOLE CARD"
        : `SEAT ${activeTarget}`;

  function handleTap(rank: Rank) {
    const card: CardCode = { rank, suit: "unspecified" };

    if (activeTarget === "dealer") {
      const isUpcard = !currentRound.dealerHand.upcard;
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
      // Upcard entered — automatically move to the first tracked seat.
      if (isUpcard) advanceToNext();
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
    <div className="flex-none border-b border-border bg-surface p-1.5">
      <p className="mb-1.5 text-center text-sm font-bold text-accent">
        ENTER CARD → {targetLabel}
      </p>
      <div className="grid grid-cols-5 gap-1.5">
        {RANKS.map((rank) => (
          <button
            key={rank}
            disabled={disabled}
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

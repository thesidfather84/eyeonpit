"use client";

import { Undo2 } from "lucide-react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { deriveDealerResult } from "@/lib/utils/blackjackTotal";
import { formatCard } from "@/lib/utils/cards";
import { resolveSeatTarget, updateSeatAtTarget } from "@/lib/utils/seatTarget";
import { isSeatLocked } from "@/lib/utils/seatLock";
import type { CardCode, Rank } from "@/types/investigation";

const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

/** Large rank-only buttons — suits are skipped for entry speed. Applies to whichever target (dealer / dealer hole / seat / split hand) is currently active, always visible in the lower-central portion of the console. */
export function CardEntryPad() {
  const {
    investigation,
    currentRound,
    activeTarget,
    setActiveTarget,
    mutate,
    advanceToNext,
    undo,
    canUndo,
    busy,
  } = useInvestigationContext();
  const isDealerTarget = activeTarget === "dealer" || activeTarget === "dealer-hole";
  const seatResolved =
    !isDealerTarget && typeof activeTarget === "number"
      ? resolveSeatTarget(currentRound, activeTarget)
      : null;
  const locked = seatResolved ? isSeatLocked(seatResolved.record) : false;
  const disabled = busy || investigation.status !== "active" || currentRound.completed || locked;

  const targetLabel =
    activeTarget === "dealer"
      ? currentRound.dealerHand.upcard
        ? "DEALER"
        : "DEALER UPCARD"
      : activeTarget === "dealer-hole"
        ? "DEALER HOLE CARD"
        : `SEAT ${seatResolved?.seatNumber}${seatResolved?.isSplit ? " · SPLIT" : ""}`;

  const lastCardEvent = [...currentRound.eventLog].reverse().find((e) => e.type === "card");

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

    if (typeof activeTarget !== "number" || !seatResolved) return;
    const target = activeTarget;
    mutate(
      (round) =>
        updateSeatAtTarget(round, target, (seat) => ({
          ...seat,
          playerCards: [...seat.playerCards, card],
        })),
      {
        type: "card",
        message: `Seat ${seatResolved.seatNumber}${seatResolved.isSplit ? " (split)" : ""}: ${formatCard(card)}`,
      }
    );
  }

  return (
    <div className="flex-none border-b border-border bg-surface p-1.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-center text-sm font-bold text-accent-secondary">
          ENTER CARD → {targetLabel}
        </p>
        <button
          onClick={undo}
          disabled={!canUndo || busy}
          aria-label="Undo last card"
          className="tap-target flex shrink-0 items-center gap-1 rounded-md border border-border bg-surface-raised px-2 text-[10px] font-medium text-foreground disabled:opacity-40"
        >
          <Undo2 className="h-3 w-3" aria-hidden /> Undo Last Card
        </button>
      </div>
      {lastCardEvent && (
        <p className="mb-1.5 text-center text-[10px] text-muted-foreground">
          Last: {lastCardEvent.message}
        </p>
      )}
      {locked && (
        <p className="mb-1.5 text-center text-[10px] font-semibold text-pending">
          Hand locked — no further cards
        </p>
      )}
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

"use client";

import { Undo2 } from "lucide-react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { formatCard } from "@/lib/utils/cards";
import { resolveSeatTarget, updateSeatAtTarget } from "@/lib/utils/seatTarget";
import { isSeatLocked } from "@/lib/utils/seatLock";
import type { CardCode, Rank } from "@/types/investigation";

const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

/**
 * Large rank-only buttons — suits are skipped for entry speed. Applies to
 * whichever target (dealer / seat / split hand) is currently active, always
 * visible in the lower-central portion of the console. A tap simply
 * appends the card to the target's list — dealer and seats use the exact
 * same append, no upcard/hole-card distinction, no confirmation, no forced
 * order. EyeOnPit records what the operator observed; it never asks them
 * to play the hand out.
 */
export function CardEntryPad() {
  const {
    investigation,
    currentRound,
    activeTarget,
    mutate,
    advanceToNext,
    undo,
    canUndo,
    busy,
  } = useInvestigationContext();
  const isDealerTarget = activeTarget === "dealer";
  const seatResolved =
    !isDealerTarget && typeof activeTarget === "number"
      ? resolveSeatTarget(currentRound, activeTarget)
      : null;
  const locked = seatResolved ? isSeatLocked(seatResolved.record) : false;
  const disabled = busy || investigation.status !== "active" || currentRound.completed || locked;

  const targetLabel = isDealerTarget
    ? "DEALER"
    : `SEAT ${seatResolved?.seatNumber}${seatResolved?.isSplit ? " · SPLIT" : ""}`;

  const lastCardEvent = [...currentRound.eventLog].reverse().find((e) => e.type === "card");

  function handleTap(rank: Rank) {
    const card: CardCode = { rank, suit: "unspecified" };

    if (activeTarget === "dealer") {
      const isFirstCard = currentRound.dealerHand.cards.length === 0;
      mutate(
        (round) => ({ ...round, dealerHand: { cards: [...round.dealerHand.cards, card] } }),
        { type: "card", message: `Dealer: ${formatCard(card)}` }
      );
      // First dealer card of the hand — automatically move to the first
      // tracked seat in Guided mode, same convenience as before, without
      // implying this card is an "upcard" in any gameplay sense.
      if (isFirstCard) advanceToNext();
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

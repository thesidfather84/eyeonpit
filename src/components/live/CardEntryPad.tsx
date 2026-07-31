"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { formatCard } from "@/lib/utils/cards";
import { resolveSeatTarget, updateSeatAtTarget } from "@/lib/utils/seatTarget";
import { isSeatLocked } from "@/lib/utils/seatLock";
import type { CardCode, Rank } from "@/types/investigation";

const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

/**
 * The primary control surface — largest, most prominent element on the
 * live screen, always two full rows of five buttons (never a narrow
 * vertical strip): A 2 3 4 5 / 6 7 8 9 10. Applies to whichever target
 * (dealer / seat / split hand) is currently active. A tap simply appends
 * the card to the target's list — dealer and seats use the exact same
 * append, no upcard/hole-card distinction, no confirmation, no forced
 * order. EyeOnPit records what the operator observed; it never asks them
 * to play the hand out.
 *
 * There is no separate "Undo Last Card" button here anymore — Undo already
 * has one first-class, always-visible home (RoundControlsRow, directly
 * above this pad) and the same context function either way; a second
 * button for the identical action only cost this pad the vertical space
 * its buttons need most.
 */
export function CardEntryPad() {
  const { investigation, currentRound, activeTarget, addCard, busy } = useInvestigationContext();
  const isDealerTarget = activeTarget === "dealer";
  const seatResolved =
    !isDealerTarget && typeof activeTarget === "number"
      ? resolveSeatTarget(currentRound, activeTarget)
      : null;
  const locked = seatResolved ? isSeatLocked(seatResolved.record) : false;
  // A seat can now be the active target without being enabled/occupied —
  // selecting is no longer the same action as occupying. There's nothing
  // to append a card to yet, so the keypad stays disabled with a clear
  // reason instead of silently no-opping.
  const notEnabled = seatResolved != null && !seatResolved.record;
  const disabled =
    busy || investigation.status !== "active" || currentRound.completed || locked || notEnabled;

  const targetLabel = isDealerTarget
    ? "DEALER"
    : `SEAT ${seatResolved?.seatNumber}${seatResolved?.isSplit ? " · SPLIT" : ""}`;

  const lastCardEvent = [...currentRound.eventLog].reverse().find((e) => e.type === "card");

  function handleTap(rank: Rank) {
    const card: CardCode = { rank, suit: "unspecified" };

    if (activeTarget === "dealer") {
      // The dealer stays the active target through every card — rapid
      // multi-card dealer entry (upcard, hole card, hits) never requires
      // reselecting the dealer tile. Only a manual seat selection, or
      // ending/clearing the round, moves the target away from "dealer".
      addCard(
        { targetType: "dealer", targetId: "dealer", rank },
        (round) => ({ ...round, dealerHand: { cards: [...round.dealerHand.cards, card] } }),
        { type: "card", message: `Dealer: ${formatCard(card)}` }
      );
      return;
    }

    if (typeof activeTarget !== "number" || !seatResolved) return;
    const target = activeTarget;
    addCard(
      { targetType: seatResolved.isSplit ? "split" : "seat", targetId: seatResolved.seatNumber, rank },
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
    <div className="flex flex-none flex-col gap-0.5 border-b border-border bg-surface px-2 py-0.5 short:gap-0 short:border-b-0 short:px-1.5 short:py-0.5">
      <div className="flex items-baseline gap-2">
        <p className="min-w-0 shrink truncate text-xs font-bold leading-none text-accent-secondary short:text-[10px]">
          ENTER CARD → {targetLabel}
        </p>
        {(lastCardEvent || locked || notEnabled) && (
          <p
            className={`min-w-0 flex-1 truncate text-right text-[10px] leading-none short:text-[9px] ${locked || notEnabled ? "font-semibold text-pending" : "text-muted-foreground"}`}
          >
            {notEnabled
              ? "Seat not enabled — double-tap to enable"
              : locked
                ? "Hand locked"
                : lastCardEvent!.message}
          </p>
        )}
      </div>
      {/* Compact keypad, sized off available height (clamp, not a device
          breakpoint) rather than a device breakpoint pair — `short:` only
          lowers the floor further, since a landscape phone has width to
          spare for five columns but never much height. */}
      <div className="grid grid-cols-5 gap-1.5 short:gap-1">
        {RANKS.map((rank) => (
          <button
            key={rank}
            disabled={disabled}
            onClick={() => handleTap(rank)}
            className="tap-target flex h-[clamp(40px,7dvh,52px)] items-center justify-center rounded-xl border border-border bg-surface-raised text-xl font-bold text-foreground active:bg-accent active:text-accent-foreground disabled:opacity-40 short:!h-[clamp(30px,9dvh,40px)] short:text-base"
          >
            {rank}
          </button>
        ))}
      </div>
    </div>
  );
}

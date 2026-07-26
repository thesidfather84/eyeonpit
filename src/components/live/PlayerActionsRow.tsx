"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { resolveSeatTarget, splitTargetFor, updateSeatAtTarget } from "@/lib/utils/seatTarget";
import { isSeatLocked } from "@/lib/utils/seatLock";
import type { PlayerAction } from "@/types/investigation";

const SIMPLE_ACTIONS: { action: PlayerAction; label: string }[] = [
  { action: "hit", label: "Hit" },
  { action: "stand", label: "Stand" },
  { action: "blackjack", label: "BJ" },
  { action: "other", label: "Other" },
];

/**
 * Double/Split/Surrender/Insurance each carry real hand-state changes on
 * top of the generic action log, unlike Hit/Stand/BJ/Other which are just
 * logged taps. All four route through the same undoable `mutate`, so an
 * accidental tap reverses exactly like any other correction.
 */
export function PlayerActionsRow({ target }: { target: number }) {
  const { investigation, currentRound, mutate, splitSeat, setActiveTarget, busy } =
    useInvestigationContext();
  const disabled = busy || investigation.status !== "active" || currentRound.completed;

  const { seatNumber, isSplit, record } = resolveSeatTarget(currentRound, target);
  const locked = isSeatLocked(record);
  const alreadySplit = Boolean(currentRound.splitHands[seatNumber]);

  function handleAction(action: PlayerAction, label: string) {
    mutate(
      (round) =>
        updateSeatAtTarget(round, target, (seat) => {
          const outcome =
            action === "blackjack" ? "blackjack" : action === "surrender" ? "surrender" : seat.outcome;
          return { ...seat, actions: [...seat.actions, action], outcome };
        }),
      { type: "action", message: `Seat ${seatNumber}${isSplit ? " (split)" : ""}: ${label}` }
    );
  }

  function handleDouble() {
    mutate(
      (round) =>
        updateSeatAtTarget(round, target, (seat) => ({
          ...seat,
          betAmount: seat.betAmount != null ? seat.betAmount * 2 : seat.betAmount,
          doubled: true,
          doubledAtCardCount: seat.playerCards.length,
          actions: [...seat.actions, "double"],
        })),
      { type: "action", message: `Seat ${seatNumber}${isSplit ? " (split)" : ""}: Double — wager doubled, one card` }
    );
  }

  async function handleSplit() {
    await splitSeat(seatNumber);
    setActiveTarget(splitTargetFor(seatNumber));
  }

  function handleSurrender() {
    handleAction("surrender", "Surrender");
  }

  function handleInsurance() {
    mutate(
      (round) =>
        updateSeatAtTarget(round, target, (seat) => {
          const isOn = (seat.insuranceAmount ?? 0) > 0;
          const half = seat.startingWagerAmount != null ? Math.round(seat.startingWagerAmount / 2) : 0;
          return { ...seat, insuranceAmount: isOn ? null : half };
        }),
      { type: "action", message: `Seat ${seatNumber}${isSplit ? " (split)" : ""}: Insurance ${((record?.insuranceAmount ?? 0) > 0) ? "cleared" : "taken"}` }
    );
  }

  return (
    <div className="grid grid-cols-4 gap-1 border-b border-border bg-surface p-1.5">
      {SIMPLE_ACTIONS.map(({ action, label }) => (
        <button
          key={action}
          disabled={disabled || locked}
          onClick={() => handleAction(action, label)}
          className="tap-target rounded-md border border-border bg-surface-raised text-[11px] font-medium text-foreground disabled:opacity-40"
        >
          {label}
        </button>
      ))}
      <button
        disabled={disabled || locked || Boolean(record?.doubled)}
        onClick={handleDouble}
        className="tap-target rounded-md border border-pending/60 bg-pending/10 text-[11px] font-medium text-pending disabled:opacity-40"
      >
        Double
      </button>
      <button
        disabled={disabled || locked || isSplit || alreadySplit}
        onClick={handleSplit}
        className="tap-target rounded-md border border-border bg-surface-raised text-[11px] font-medium text-foreground disabled:opacity-40"
      >
        Split
      </button>
      <button
        disabled={disabled || isSplit}
        onClick={handleInsurance}
        className={`tap-target rounded-md border text-[11px] font-medium disabled:opacity-40 ${
          (record?.insuranceAmount ?? 0) > 0
            ? "border-accent bg-accent/15 text-accent"
            : "border-border bg-surface-raised text-foreground"
        }`}
      >
        {(record?.insuranceAmount ?? 0) > 0 ? `Insur. $${record?.insuranceAmount}` : "Insurance"}
      </button>
      <button
        disabled={disabled || locked || isSplit}
        onClick={handleSurrender}
        className="tap-target rounded-md border border-destructive/60 bg-destructive/10 text-[11px] font-medium text-destructive disabled:opacity-40"
      >
        Surr.
      </button>
    </div>
  );
}

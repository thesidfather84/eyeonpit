"use client";

import { useState } from "react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { resolveSeatTarget, splitTargetFor, updateSeatAtTarget } from "@/lib/utils/seatTarget";
import { isSeatLocked } from "@/lib/utils/seatLock";
import { SeatMoreActionsSheet } from "./SeatMoreActionsSheet";

/**
 * Only observational controls that carry real hand-state changes live here
 * — Double/Split/Insurance/Surrender, plus "More" for the rarer corrections
 * (Void, a manual Blackjack correction, Other). There is no Hit/Stand/BJ:
 * another card entered is an implicit hit, ending entry is an implicit
 * stand, and Blackjack is auto-detected from two cards totaling 21 — none
 * of those need a button EyeOnPit is a recording tool, not a hand-play UI.
 */
export function PlayerActionsRow({ target }: { target: number }) {
  const { investigation, currentRound, mutate, splitSeat, setActiveTarget, busy } =
    useInvestigationContext();
  const [moreOpen, setMoreOpen] = useState(false);
  const disabled = busy || investigation.status !== "active" || currentRound.completed;

  const { seatNumber, isSplit, record } = resolveSeatTarget(currentRound, target);
  const locked = isSeatLocked(record);
  const alreadySplit = Boolean(currentRound.splitHands[seatNumber]);

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
      { type: "action", message: `Spot ${seatNumber}${isSplit ? " (split)" : ""}: Double — wager doubled, one card` }
    );
  }

  async function handleSplit() {
    await splitSeat(seatNumber);
    setActiveTarget(splitTargetFor(seatNumber));
  }

  function handleInsurance() {
    mutate(
      (round) =>
        updateSeatAtTarget(round, target, (seat) => {
          const isOn = (seat.insuranceAmount ?? 0) > 0;
          const half = seat.startingWagerAmount != null ? Math.round(seat.startingWagerAmount / 2) : 0;
          return { ...seat, insuranceAmount: isOn ? null : half };
        }),
      { type: "action", message: `Spot ${seatNumber}${isSplit ? " (split)" : ""}: Insurance ${((record?.insuranceAmount ?? 0) > 0) ? "cleared" : "taken"}` }
    );
  }

  function handleSurrender() {
    mutate(
      (round) =>
        updateSeatAtTarget(round, target, (seat) => ({
          ...seat,
          actions: [...seat.actions, "surrender"],
          outcome: "surrender",
        })),
      { type: "action", message: `Spot ${seatNumber}${isSplit ? " (split)" : ""}: Surrender` }
    );
  }

  return (
    <>
      {/* EyeOnPit 1.10 Phase 3 — goal 6: "do not allow an operator to
          accidentally assume Double applies to both hands." One caption
          covers every action below at once (Double included) rather than
          cramming a per-button qualifier into an already-narrow 5-column
          grid — the operator has already seen the same fact spelled out
          large in ActiveSeatHeader's own HAND 1/HAND 2 switcher directly
          above; this is reinforcement at the point of action, not the only
          place it's stated. Absent entirely for a seat that never split. */}
      {alreadySplit && (
        <p className="border-b border-border bg-surface-raised px-2 py-1 text-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Actions below apply to {isSplit ? "Hand 2" : "Hand 1"} only
        </p>
      )}
      <div className="grid grid-cols-5 gap-1 border-b border-border bg-surface p-1.5">
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
        <button
          disabled={disabled}
          onClick={() => setMoreOpen(true)}
          className="tap-target rounded-md border border-border bg-surface-raised text-[11px] font-medium text-foreground disabled:opacity-40"
        >
          More
        </button>
      </div>
      {moreOpen && <SeatMoreActionsSheet target={target} onClose={() => setMoreOpen(false)} />}
    </>
  );
}

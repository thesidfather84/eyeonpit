"use client";

import { useState } from "react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { computeWagerChange, findPreviousBet } from "@/lib/utils/wagerChange";

const MULTIPLIERS = [0.5, 1, 2, 4, 8];
const BET_STEP = 25;

export function QuickBetPanel({ seatNumber }: { seatNumber: number }) {
  const { investigation, currentRound, mutate, busy } = useInvestigationContext();
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState("");

  const record = currentRound.seats[seatNumber];
  const currentBet = record?.betAmount ?? 0;
  const priorRounds = investigation.rounds.filter((r) => r.id !== currentRound.id);
  const previousBet = findPreviousBet(seatNumber, priorRounds);
  const disabled = busy || investigation.status !== "active";

  function applyBet(newAmount: number, label?: string) {
    const wagerChange = computeWagerChange(newAmount, previousBet);
    mutate(
      (round) => {
        const seat = round.seats[seatNumber];
        if (!seat) return round;
        return {
          ...round,
          seats: { ...round.seats, [seatNumber]: { ...seat, betAmount: newAmount, wagerChange } },
        };
      },
      {
        type: "bet-change",
        message: `Seat ${seatNumber} bet $${previousBet ?? 0} → $${newAmount}${label ? ` (${label})` : ""}`,
      }
    );
    setCustomOpen(false);
    setCustomValue("");
  }

  function handleCustomCommit() {
    const parsed = Number(customValue);
    if (Number.isFinite(parsed) && parsed >= 0) applyBet(parsed, "custom");
  }

  return (
    <div className="flex-none border-b border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Seat {seatNumber} · Previous ${previousBet ?? 0} → New ${currentBet}
        </span>
        <span
          className={
            record?.wagerChange.direction === "up"
              ? "text-status-orange"
              : record?.wagerChange.direction === "down"
                ? "text-accent"
                : "text-muted-foreground"
          }
        >
          {record?.wagerChange.direction === "first"
            ? "First wager"
            : record?.wagerChange.direction === "same"
              ? "No change"
              : `${record?.wagerChange.direction === "up" ? "▲" : "▼"} $${record?.wagerChange.amount ?? 0}`}
        </span>
      </div>

      <div className="mb-2 grid grid-cols-4 gap-2">
        <button
          disabled={disabled}
          onClick={() => applyBet(Math.max(0, currentBet - BET_STEP))}
          className="tap-target rounded-lg border border-border bg-surface-raised text-xs font-medium text-foreground disabled:opacity-40"
        >
          Bet Down
        </button>
        <button
          disabled={disabled || previousBet == null}
          onClick={() => applyBet(previousBet ?? currentBet)}
          className="tap-target rounded-lg border border-border bg-surface-raised text-xs font-medium text-foreground disabled:opacity-40"
        >
          Same Bet
        </button>
        <button
          disabled={disabled}
          onClick={() => applyBet(currentBet + BET_STEP)}
          className="tap-target rounded-lg border border-accent bg-accent/15 text-xs font-medium text-accent disabled:opacity-40"
        >
          Bet Up
        </button>
        <button
          disabled={disabled}
          onClick={() => setCustomOpen((v) => !v)}
          className="tap-target rounded-lg border border-border bg-surface-raised text-xs font-medium text-foreground disabled:opacity-40"
        >
          Custom
        </button>
      </div>

      {customOpen && (
        <div className="mb-2 flex gap-2">
          <input
            type="number"
            inputMode="numeric"
            autoFocus
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            placeholder="Amount"
            className="tap-target w-full rounded-lg border border-accent bg-surface-raised px-3 text-base text-foreground focus:outline-none"
          />
          <button
            onClick={handleCustomCommit}
            disabled={disabled || customValue === ""}
            className="tap-target shrink-0 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-40"
          >
            Set
          </button>
        </div>
      )}

      <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        Multiplier (of previous wager)
      </p>
      <div className="grid grid-cols-5 gap-1.5">
        {MULTIPLIERS.map((mult) => (
          <button
            key={mult}
            disabled={disabled || previousBet == null}
            onClick={() => applyBet(Math.round(previousBet! * mult), `${mult}x`)}
            className="tap-target rounded-lg border border-border bg-surface-raised text-xs font-medium text-foreground disabled:opacity-40"
          >
            {mult === 0.5 ? "1/2x" : `${mult}x`}
          </button>
        ))}
      </div>
    </div>
  );
}

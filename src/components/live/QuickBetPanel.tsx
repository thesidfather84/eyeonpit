"use client";

import { useState } from "react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { computeWagerChange, findPreviousBet } from "@/lib/utils/wagerChange";

const CHIPS = [5, 10, 25, 50, 100, 500];
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

  const changeBadge =
    record?.wagerChange.direction === "up"
      ? `▲$${record.wagerChange.amount ?? 0}`
      : record?.wagerChange.direction === "down"
        ? `▼$${record.wagerChange.amount ?? 0}`
        : null;

  return (
    <div className="flex-none border-b border-border bg-surface p-1.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-bold text-foreground">BET — SEAT {seatNumber}</span>
        <span className="flex items-center gap-1 text-xs">
          <span className="font-semibold text-foreground">${currentBet}</span>
          {changeBadge && (
            <span
              className={
                record?.wagerChange.direction === "up" ? "text-status-orange" : "text-accent"
              }
            >
              {changeBadge}
            </span>
          )}
        </span>
      </div>

      <div className="mb-1.5 grid grid-cols-4 gap-1 sm:grid-cols-7">
        {CHIPS.map((chip) => (
          <button
            key={chip}
            disabled={disabled}
            onClick={() => applyBet(chip)}
            className={`tap-target rounded-md text-xs font-semibold disabled:opacity-40 ${
              currentBet === chip
                ? "bg-accent text-accent-foreground"
                : "border border-border bg-surface-raised text-foreground"
            }`}
          >
            ${chip}
          </button>
        ))}
        <button
          disabled={disabled}
          onClick={() => setCustomOpen((v) => !v)}
          className="tap-target rounded-md border border-border bg-surface-raised text-xs font-semibold text-foreground disabled:opacity-40"
        >
          CUSTOM
        </button>
      </div>

      {customOpen && (
        <div className="mb-1.5 flex gap-1.5">
          <input
            type="number"
            inputMode="numeric"
            autoFocus
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            placeholder="Amount"
            className="tap-target w-full rounded-md border border-accent bg-surface-raised px-3 text-sm text-foreground focus:outline-none"
          />
          <button
            onClick={handleCustomCommit}
            disabled={disabled || customValue === ""}
            className="tap-target shrink-0 rounded-md bg-accent px-3 text-xs font-semibold text-accent-foreground disabled:opacity-40"
          >
            Set
          </button>
        </div>
      )}

      <div className="grid grid-cols-4 gap-1">
        <button
          disabled={disabled || previousBet == null}
          onClick={() => applyBet(previousBet ?? currentBet, "repeat")}
          className="tap-target rounded-md border border-border bg-surface-raised text-[11px] font-medium text-foreground disabled:opacity-40"
        >
          Repeat
        </button>
        <button
          disabled={disabled}
          onClick={() => applyBet(0, "clear")}
          className="tap-target rounded-md border border-border bg-surface-raised text-[11px] font-medium text-foreground disabled:opacity-40"
        >
          Clear
        </button>
        <button
          disabled={disabled}
          onClick={() => applyBet(Math.max(0, currentBet - BET_STEP))}
          aria-label="Decrease bet"
          className="tap-target rounded-md border border-border bg-surface-raised text-base font-semibold text-foreground disabled:opacity-40"
        >
          −
        </button>
        <button
          disabled={disabled}
          onClick={() => applyBet(currentBet + BET_STEP)}
          aria-label="Increase bet"
          className="tap-target rounded-md border border-accent bg-accent/15 text-base font-semibold text-accent disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}

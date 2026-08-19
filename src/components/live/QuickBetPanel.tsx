"use client";

import { useState } from "react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { computeWagerChange, findPreviousStartingWager } from "@/lib/utils/wagerChange";
import { resolveSeatTarget, updateSeatAtTarget } from "@/lib/utils/seatTarget";
import { useTerminology } from "@/hooks/useTerminology";
import { ApplyToLinkedBetButton } from "./ApplyToLinkedBetButton";

const CHIPS = [5, 10, 25, 100, 500, 1000];
const BET_STEP = 25;

export function QuickBetPanel({ target }: { target: number }) {
  const { investigation, currentRound, mutate, busy } = useInvestigationContext();
  const t = useTerminology();
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState("");

  const { seatNumber, isSplit, record } = resolveSeatTarget(currentRound, target);
  const currentBet = record?.betAmount ?? 0;
  const startingWager = record?.startingWagerAmount ?? 0;
  const priorRounds = investigation.rounds.filter((r) => r.id !== currentRound.id);
  const previousStartingWager = findPreviousStartingWager(seatNumber, priorRounds);
  const disabled =
    busy || investigation.status !== "active" || currentRound.completed || Boolean(record?.doubled);

  function applyBet(newAmount: number, label?: string) {
    const wagerChange = computeWagerChange(newAmount, previousStartingWager);
    mutate(
      (round) =>
        updateSeatAtTarget(round, target, (seat) => ({
          ...seat,
          betAmount: newAmount,
          startingWagerAmount: newAmount,
          wagerChange,
        })),
      {
        type: "bet-change",
        message: `Spot ${seatNumber}${isSplit ? " (split)" : ""} ${t.currentBet.toLowerCase()} $${previousStartingWager ?? 0} → $${newAmount}${label ? ` (${label})` : ""}`,
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
    <div className="flex-none border-b border-border bg-surface p-0.5 short:p-1">
      <div className="mb-0 flex items-center justify-between short:text-[10px]">
        <span className="text-[11px] font-bold leading-none text-foreground short:text-[10px]">
          {t.currentBet.toUpperCase()}
          {isSplit ? " · SPLIT" : ""}
        </span>
        <span className="flex items-center gap-2 text-[11px] leading-none short:text-[10px]">
          <span className="text-muted-foreground short:hidden">
            {t.baseBet} <span className="font-medium text-foreground">${startingWager}</span>
          </span>
          <span className="flex items-center gap-1">
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
        </span>
      </div>
      {record?.doubled && (
        <p className="mb-1 text-[10px] font-semibold text-pending short:text-[9px]">
          DOUBLED — wager locked, waiting for one final card
        </p>
      )}

      {/* One strip of chip buttons — a horizontal scroll in the tall
          portrait layout (a fixed 2-row chip grid was the single biggest
          contributor to this panel's height there); in `short:` (landscape)
          there's no spare row for a second scroll region on top of the
          keypad/seat-map columns, so it wraps in place instead — same
          single-strip intent, just reflowing rather than scrolling if it
          ever runs long. */}
      <div className="mb-0 flex gap-1 overflow-x-auto short:flex-wrap short:gap-1 short:overflow-visible">
        {CHIPS.map((chip) => (
          <button
            key={chip}
            disabled={disabled}
            onClick={() => applyBet(chip)}
            className={`tap-target shrink-0 rounded-md px-3 text-xs font-semibold disabled:opacity-40 short:px-1.5 short:text-[10px] ${
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
          className="tap-target shrink-0 rounded-md border border-border bg-surface-raised px-3 text-xs font-semibold text-foreground disabled:opacity-40 short:px-1.5 short:text-[10px]"
        >
          CUSTOM
        </button>
      </div>

      {customOpen && (
        <div className="mb-1 flex gap-1.5">
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

      <div className="flex items-center gap-1 short:gap-0.5">
        <button
          disabled={disabled}
          onClick={() => applyBet(Math.max(0, currentBet - BET_STEP))}
          aria-label="Decrease bet"
          className="tap-target shrink-0 rounded-md border border-border bg-surface-raised px-3 text-base font-semibold text-foreground disabled:opacity-40 short:px-2"
        >
          −
        </button>
        <span className="w-12 shrink-0 text-center text-xs font-semibold text-foreground">
          ${currentBet}
        </span>
        <button
          disabled={disabled}
          onClick={() => applyBet(currentBet + BET_STEP)}
          aria-label="Increase bet"
          className="tap-target shrink-0 rounded-md border border-accent bg-accent/15 px-3 text-base font-semibold text-accent disabled:opacity-40 short:px-2"
        >
          +
        </button>
        <button
          disabled={disabled || previousStartingWager == null}
          onClick={() => applyBet(previousStartingWager ?? currentBet, "repeat")}
          className="tap-target flex-1 rounded-md border border-border bg-surface-raised text-[10px] font-medium text-foreground disabled:opacity-40 short:px-1 short:text-[9px]"
        >
          Repeat
        </button>
        <button
          disabled={disabled}
          onClick={() => applyBet(0, "clear")}
          className="tap-target flex-1 rounded-md border border-border bg-surface-raised text-[11px] font-medium text-foreground disabled:opacity-40 short:px-1 short:text-[9px]"
        >
          Clear
        </button>
      </div>

      {/* No wager-scoped Undo button here — it used to duplicate the exact
          same undo()/canUndo/undoLabel RoundControlsRow's primary Undo
          already exposes (same context state, same action), which is
          exactly the "two generic Undo controls visible at once" pattern
          the count-first UI pass removed. That one Undo already reverses a
          bet change like any other action (see useInvestigationContext's
          undo()); nothing here needs a second button for it. */}
      <ApplyToLinkedBetButton
        target={target}
        className="tap-target mt-1 w-full rounded-md border border-border bg-surface-raised text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
      />
    </div>
  );
}

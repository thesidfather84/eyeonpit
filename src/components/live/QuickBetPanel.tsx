"use client";

import { useState } from "react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { computeWagerChange, findPreviousStartingWager } from "@/lib/utils/wagerChange";
import { resolveSeatTarget, updateSeatAtTarget } from "@/lib/utils/seatTarget";
import { useTerminology } from "@/hooks/useTerminology";

const CHIPS = [5, 10, 25, 100, 500, 1000];
const BET_STEP = 25;

export function QuickBetPanel({ target }: { target: number }) {
  const { investigation, currentRound, mutate, undo, canUndo, applyBetToLinkedSpots, busy } =
    useInvestigationContext();
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

  const groupId = investigation.seatPlayerGroups[seatNumber];
  const linkedSeatCount = groupId
    ? Object.values(investigation.seatPlayerGroups).filter((g) => g === groupId).length
    : 1;
  const isLinked = !isSplit && linkedSeatCount > 1;

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
        message: `Seat ${seatNumber}${isSplit ? " (split)" : ""} ${t.currentBet.toLowerCase()} $${previousStartingWager ?? 0} → $${newAmount}${label ? ` (${label})` : ""}`,
      }
    );
    setCustomOpen(false);
    setCustomValue("");
  }

  function handleCustomCommit() {
    const parsed = Number(customValue);
    if (Number.isFinite(parsed) && parsed >= 0) applyBet(parsed, "custom");
  }

  function handleApplyToLinked() {
    applyBetToLinkedSpots(
      seatNumber,
      currentBet,
      record?.wagerChange ?? { direction: "first", amount: null, overridden: false }
    );
  }

  const changeBadge =
    record?.wagerChange.direction === "up"
      ? `▲$${record.wagerChange.amount ?? 0}`
      : record?.wagerChange.direction === "down"
        ? `▼$${record.wagerChange.amount ?? 0}`
        : null;

  return (
    <div className="flex-none border-b border-border bg-surface p-0.5">
      <div className="mb-0 flex items-center justify-between">
        <span className="text-[11px] font-bold leading-none text-foreground">
          {t.currentBet.toUpperCase()} — SEAT {seatNumber}
          {isSplit ? " · SPLIT" : ""}
        </span>
        <span className="flex items-center gap-2 text-[11px] leading-none">
          <span className="text-muted-foreground">
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
        <p className="mb-1 text-[10px] font-semibold text-pending">
          DOUBLED — wager locked, waiting for one final card
        </p>
      )}

      {/* One horizontal-scroll row, never wraps — a fixed 2-row chip grid was
          the single biggest contributor to this panel's height. */}
      <div className="mb-0 flex gap-1 overflow-x-auto">
        {CHIPS.map((chip) => (
          <button
            key={chip}
            disabled={disabled}
            onClick={() => applyBet(chip)}
            className={`tap-target shrink-0 rounded-md px-3 text-xs font-semibold disabled:opacity-40 ${
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
          className="tap-target shrink-0 rounded-md border border-border bg-surface-raised px-3 text-xs font-semibold text-foreground disabled:opacity-40"
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

      <div className="flex items-center gap-1">
        <button
          disabled={disabled}
          onClick={() => applyBet(Math.max(0, currentBet - BET_STEP))}
          aria-label="Decrease bet"
          className="tap-target shrink-0 rounded-md border border-border bg-surface-raised px-3 text-base font-semibold text-foreground disabled:opacity-40"
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
          className="tap-target shrink-0 rounded-md border border-accent bg-accent/15 px-3 text-base font-semibold text-accent disabled:opacity-40"
        >
          +
        </button>
        <button
          disabled={disabled || previousStartingWager == null}
          onClick={() => applyBet(previousStartingWager ?? currentBet, "repeat")}
          className="tap-target flex-1 rounded-md border border-border bg-surface-raised text-[10px] font-medium text-foreground disabled:opacity-40"
        >
          Repeat
        </button>
        <button
          disabled={disabled}
          onClick={() => applyBet(0, "clear")}
          className="tap-target flex-1 rounded-md border border-border bg-surface-raised text-[11px] font-medium text-foreground disabled:opacity-40"
        >
          Clear
        </button>
        <button
          disabled={!canUndo || busy}
          onClick={undo}
          className="tap-target flex-1 rounded-md border border-border bg-surface-raised text-[10px] font-medium text-foreground disabled:opacity-40"
        >
          Undo
        </button>
      </div>

      {isLinked && (
        <button
          disabled={disabled || currentBet <= 0}
          onClick={handleApplyToLinked}
          className="tap-target mt-1 w-full rounded-md border border-border bg-surface-raised text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          Apply ${currentBet} to all {linkedSeatCount} linked spots
        </button>
      )}
    </div>
  );
}

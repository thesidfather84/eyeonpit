"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { resolveSeatTarget, updateSeatAtTarget } from "@/lib/utils/seatTarget";
import type { HandOutcome } from "@/types/investigation";

const RESULTS: { outcome: NonNullable<HandOutcome>; label: string }[] = [
  { outcome: "win", label: "Win" },
  { outcome: "loss", label: "Loss" },
  { outcome: "push", label: "Push" },
  { outcome: "blackjack", label: "BJ" },
  { outcome: "surrender", label: "Surr" },
  { outcome: "void", label: "Void" },
];

/** Fast result tagging for the active hand — recording a result also advances to the next seat (or dealer) automatically in Guided mode. */
export function ResultButtonsRow({ target }: { target: number }) {
  const { investigation, currentRound, mutate, advanceToNext, busy } = useInvestigationContext();
  const { seatNumber, isSplit, record } = resolveSeatTarget(currentRound, target);
  const current = record?.outcome ?? null;
  const disabled = busy || investigation.status !== "active" || currentRound.completed;

  function handleResult(outcome: NonNullable<HandOutcome>, label: string) {
    mutate(
      (round) => updateSeatAtTarget(round, target, (seat) => ({ ...seat, outcome })),
      { type: "action", message: `Seat ${seatNumber}${isSplit ? " (split)" : ""}: Result — ${label}` }
    );
    advanceToNext();
  }

  return (
    <div className="grid grid-cols-6 gap-1 border-b border-border bg-surface p-1.5">
      {RESULTS.map(({ outcome, label }) => (
        <button
          key={outcome}
          disabled={disabled}
          onClick={() => handleResult(outcome, label)}
          className={`tap-target rounded-md border text-[11px] font-medium disabled:opacity-40 ${
            current === outcome
              ? "border-accent bg-accent/15 text-accent"
              : "border-border bg-surface-raised text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { resolveSeatTarget, updateSeatAtTarget } from "@/lib/utils/seatTarget";
import type { HandOutcome } from "@/types/investigation";

const RESULTS: { outcome: NonNullable<HandOutcome>; label: string }[] = [
  { outcome: "win", label: "Win" },
  { outcome: "loss", label: "Loss" },
  { outcome: "push", label: "Push" },
  { outcome: "void", label: "Void" },
];

/**
 * Fast result tagging for the active hand — recording a result also
 * advances to the next seat (or dealer) automatically in Guided mode.
 * Blackjack isn't a result button here: it's auto-detected from two cards
 * totaling 21 (see lib/utils/blackjackTotal.ts) rather than a manual tap,
 * and a genuine correction belongs in the seat's "More" sheet, not a
 * second duplicate BJ button. Surrender is likewise recorded via the
 * Surrender action, not repeated here.
 */
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
    <div className="grid grid-cols-4 gap-1 border-b border-border bg-surface p-1.5">
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

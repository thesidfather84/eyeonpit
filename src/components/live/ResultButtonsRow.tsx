"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import type { HandOutcome } from "@/types/investigation";

const RESULTS: { outcome: NonNullable<HandOutcome>; label: string }[] = [
  { outcome: "win", label: "Win" },
  { outcome: "loss", label: "Loss" },
  { outcome: "push", label: "Push" },
  { outcome: "blackjack", label: "BJ" },
  { outcome: "surrender", label: "Surr" },
  { outcome: "void", label: "Void" },
];

/** Fast result tagging for the active seat's hand — recording a result also advances to the next seat (or dealer) automatically. */
export function ResultButtonsRow({ seatNumber }: { seatNumber: number }) {
  const { investigation, currentRound, mutate, advanceToNext, busy } = useInvestigationContext();
  const current = currentRound.seats[seatNumber]?.outcome ?? null;
  const disabled = busy || investigation.status !== "active";

  function handleResult(outcome: NonNullable<HandOutcome>, label: string) {
    mutate(
      (round) => {
        const seat = round.seats[seatNumber];
        if (!seat) return round;
        return { ...round, seats: { ...round.seats, [seatNumber]: { ...seat, outcome } } };
      },
      { type: "action", message: `Seat ${seatNumber}: Result — ${label}` }
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

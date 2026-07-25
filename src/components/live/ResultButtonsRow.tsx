"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import type { HandOutcome } from "@/types/investigation";

const RESULTS: { outcome: NonNullable<HandOutcome>; label: string }[] = [
  { outcome: "win", label: "Win" },
  { outcome: "loss", label: "Loss" },
  { outcome: "push", label: "Push" },
  { outcome: "blackjack", label: "Blackjack" },
  { outcome: "surrender", label: "Surrender" },
  { outcome: "void", label: "Void" },
];

/** Fast result tagging for the active seat's hand this round. Stored on that seat's SeatHand record for the current round — see event log, Analysis, Seats, Report, and JSON export for where it surfaces. */
export function ResultButtonsRow({ seatNumber }: { seatNumber: number }) {
  const { currentRound, mutate, busy } = useInvestigationContext();
  const current = currentRound.seats[seatNumber]?.outcome ?? null;

  function handleResult(outcome: NonNullable<HandOutcome>, label: string) {
    mutate(
      (round) => {
        const seat = round.seats[seatNumber];
        if (!seat) return round;
        return { ...round, seats: { ...round.seats, [seatNumber]: { ...seat, outcome } } };
      },
      { type: "action", message: `Seat ${seatNumber}: Result — ${label}` }
    );
  }

  return (
    <div className="flex-none border-b border-border bg-surface p-3">
      <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        Result — Seat {seatNumber}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {RESULTS.map(({ outcome, label }) => (
          <button
            key={outcome}
            disabled={busy}
            onClick={() => handleResult(outcome, label)}
            className={`tap-target rounded-lg border text-xs font-medium disabled:opacity-40 ${
              current === outcome
                ? "border-accent bg-accent/15 text-accent"
                : "border-border bg-surface-raised text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

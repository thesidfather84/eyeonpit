"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import type { PlayerAction } from "@/types/investigation";

const ACTIONS: { action: PlayerAction; label: string }[] = [
  { action: "hit", label: "Hit" },
  { action: "stand", label: "Stand" },
  { action: "double", label: "Double Down" },
  { action: "split", label: "Split" },
  { action: "insurance", label: "Insurance" },
  { action: "surrender", label: "Surrender" },
  { action: "blackjack", label: "Blackjack" },
  { action: "other", label: "Other" },
];

/** Actions are stored with the seat and round — every tap appends to that seat's action log for the current round. */
export function PlayerActionsRow({ seatNumber }: { seatNumber: number }) {
  const { investigation, mutate, busy } = useInvestigationContext();
  const disabled = busy || investigation.status !== "active";

  function handleAction(action: PlayerAction, label: string) {
    mutate(
      (round) => {
        const seat = round.seats[seatNumber];
        if (!seat) return round;
        const outcome =
          action === "blackjack" ? "blackjack" : action === "surrender" ? "surrender" : seat.outcome;
        return {
          ...round,
          seats: {
            ...round.seats,
            [seatNumber]: { ...seat, actions: [...seat.actions, action], outcome },
          },
        };
      },
      { type: "action", message: `Seat ${seatNumber}: ${label}` }
    );
  }

  return (
    <div className="flex-none border-b border-border bg-surface p-3">
      <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        Player Actions — Seat {seatNumber}
      </p>
      <div className="grid grid-cols-4 gap-2">
        {ACTIONS.map(({ action, label }) => (
          <button
            key={action}
            disabled={disabled}
            onClick={() => handleAction(action, label)}
            className="tap-target rounded-lg border border-border bg-surface-raised text-xs font-medium text-foreground disabled:opacity-40"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

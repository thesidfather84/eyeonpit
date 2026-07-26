"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import type { PlayerAction } from "@/types/investigation";

const ACTIONS: { action: PlayerAction; label: string }[] = [
  { action: "hit", label: "Hit" },
  { action: "stand", label: "Stand" },
  { action: "double", label: "Double" },
  { action: "split", label: "Split" },
  { action: "insurance", label: "Insur." },
  { action: "surrender", label: "Surr." },
  { action: "blackjack", label: "BJ" },
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
    <div className="grid grid-cols-4 gap-1 border-b border-border bg-surface p-1.5">
      {ACTIONS.map(({ action, label }) => (
        <button
          key={action}
          disabled={disabled}
          onClick={() => handleAction(action, label)}
          className="tap-target rounded-md border border-border bg-surface-raised text-[11px] font-medium text-foreground disabled:opacity-40"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

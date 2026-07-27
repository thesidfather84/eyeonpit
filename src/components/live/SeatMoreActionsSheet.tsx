"use client";

import { BottomSheet } from "@/components/ui/BottomSheet";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { resolveSeatTarget, updateSeatAtTarget } from "@/lib/utils/seatTarget";

/**
 * Everything that isn't a hot-path action lives here instead of cluttering
 * the primary action row: Void, a manual Blackjack correction (for the rare
 * case the auto-detected two-card-21 needs overriding), and a generic
 * "Other" observational tag. Reached via the seat/dealer control dock's
 * "More" button.
 */
export function SeatMoreActionsSheet({ target, onClose }: { target: number; onClose: () => void }) {
  const { investigation, currentRound, mutate, busy } = useInvestigationContext();
  const { seatNumber, isSplit } = resolveSeatTarget(currentRound, target);
  const disabled = busy || investigation.status !== "active" || currentRound.completed;

  function handleVoid() {
    mutate(
      (round) => updateSeatAtTarget(round, target, (seat) => ({ ...seat, outcome: "void" })),
      { type: "action", message: `Seat ${seatNumber}${isSplit ? " (split)" : ""}: Result — Void` }
    );
    onClose();
  }

  function handleManualBlackjack() {
    mutate(
      (round) => updateSeatAtTarget(round, target, (seat) => ({ ...seat, outcome: "blackjack" })),
      { type: "action", message: `Seat ${seatNumber}${isSplit ? " (split)" : ""}: Manual Blackjack correction` }
    );
    onClose();
  }

  function handleOther() {
    mutate(
      (round) => updateSeatAtTarget(round, target, (seat) => ({ ...seat, actions: [...seat.actions, "other"] })),
      { type: "action", message: `Seat ${seatNumber}${isSplit ? " (split)" : ""}: Other` }
    );
    onClose();
  }

  return (
    <BottomSheet open onClose={onClose} title={`Seat ${seatNumber}${isSplit ? " · Split" : ""} — More`}>
      <div className="flex flex-col gap-1 pb-4">
        <button
          disabled={disabled}
          onClick={handleVoid}
          className="tap-target rounded-xl border border-border bg-surface-raised px-3 text-left text-sm font-medium text-foreground hover:bg-surface disabled:opacity-40"
        >
          Void
        </button>
        <button
          disabled={disabled}
          onClick={handleManualBlackjack}
          className="tap-target rounded-xl border border-border bg-surface-raised px-3 text-left text-sm font-medium text-foreground hover:bg-surface disabled:opacity-40"
        >
          Manual Blackjack Correction
        </button>
        <button
          disabled={disabled}
          onClick={handleOther}
          className="tap-target rounded-xl border border-border bg-surface-raised px-3 text-left text-sm font-medium text-foreground hover:bg-surface disabled:opacity-40"
        >
          Other
        </button>
      </div>
    </BottomSheet>
  );
}

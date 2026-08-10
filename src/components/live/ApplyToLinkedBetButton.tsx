"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { resolveSeatTarget } from "@/lib/utils/seatTarget";

/**
 * "Apply this bet to all N linked spots" — mounted once, inside
 * QuickBetPanel, which itself only ever renders inside PlayerDetailSheet
 * (see that component) for both portrait and landscape. Renders nothing
 * when the active seat isn't actually linked to another spot — the caller
 * never needs to check that itself.
 */
export function ApplyToLinkedBetButton({
  target,
  className,
}: {
  target: number;
  className?: string;
}) {
  const { investigation, currentRound, applyBetToLinkedSpots, busy } = useInvestigationContext();
  const { seatNumber, isSplit, record } = resolveSeatTarget(currentRound, target);
  const currentBet = record?.betAmount ?? 0;
  const disabled =
    busy || investigation.status !== "active" || currentRound.completed || Boolean(record?.doubled);

  const groupId = investigation.seatPlayerGroups[seatNumber];
  const linkedSeatCount = groupId
    ? Object.values(investigation.seatPlayerGroups).filter((g) => g === groupId).length
    : 1;
  const isLinked = !isSplit && linkedSeatCount > 1;

  if (!isLinked) return null;

  function handleApplyToLinked() {
    applyBetToLinkedSpots(
      seatNumber,
      currentBet,
      record?.wagerChange ?? { direction: "first", amount: null, overridden: false }
    );
  }

  return (
    <button
      disabled={disabled || currentBet <= 0}
      onClick={handleApplyToLinked}
      className={
        className ??
        "tap-target mt-1 w-full rounded-md border border-border bg-surface-raised text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
      }
    >
      Apply ${currentBet} to all {linkedSeatCount} linked spots
    </button>
  );
}

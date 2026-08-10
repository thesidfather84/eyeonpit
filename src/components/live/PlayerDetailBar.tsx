"use client";

import { ChevronRight } from "lucide-react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { resolveSeatTarget } from "@/lib/utils/seatTarget";

/**
 * The collapsed default state of wager entry and player actions
 * (Double/Split/Insurance/Surrender) — count-first UI pass: wagers and
 * player actions are valuable but must not dominate the primary counting
 * workspace, so the normal live state shows only this one compact row
 * ("$25 · PLAYER DETAILS", or "PLAYER DETAILS" before a wager exists).
 * Tapping it opens PlayerDetailSheet, which renders the exact existing
 * QuickBetPanel/PlayerActionsRow controls unchanged — nothing here is a
 * new control or a new mutation path, only a smaller default footprint.
 */
export function PlayerDetailBar({ target, onOpen }: { target: number; onOpen: () => void }) {
  const { currentRound } = useInvestigationContext();
  const { record, isSplit } = resolveSeatTarget(currentRound, target);
  const bet = record?.betAmount;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open player details — wager and actions"
      data-testid="player-detail-bar"
      className="tap-target flex flex-none items-center justify-between border-b border-border bg-surface px-2 py-1 text-left"
    >
      <span className="text-[11px] font-semibold text-foreground">
        {bet != null && bet > 0 ? `$${bet} · ` : ""}PLAYER DETAILS
        {isSplit ? " · SPLIT" : ""}
      </span>
      <span className="flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground">
        Details <ChevronRight className="h-3.5 w-3.5" aria-hidden />
      </span>
    </button>
  );
}

"use client";

import { ChevronRight } from "lucide-react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { resolveSeatTarget } from "@/lib/utils/seatTarget";

/**
 * The collapsed default state of wager entry and player actions
 * (Double/Split/Insurance/Surrender) — count-first UI pass: wagers and
 * player actions are valuable but must not dominate the primary counting
 * workspace, so the normal live state shows only this one compact row.
 * Tapping it opens PlayerDetailSheet, which renders the exact existing
 * QuickBetPanel/PlayerActionsRow controls unchanged — nothing here is a
 * new control or a new mutation path.
 *
 * AGENTS.md 1.14b UX correction round §4/§5 — real-device feedback found
 * the old "PLAYER DETAILS" label buried the one thing an operator actually
 * needs at a glance: is there a bet, and how much. The label now leads
 * with BET explicitly (an accent-colored "SET BET" call to action when
 * none exists yet, or the bold dollar amount once one does) — same single
 * tap, same target, only the wording and visual weight changed.
 */
export function PlayerDetailBar({ target, onOpen }: { target: number; onOpen: () => void }) {
  const { currentRound } = useInvestigationContext();
  const { seatNumber, record, isSplit } = resolveSeatTarget(currentRound, target);
  const bet = record?.betAmount;
  const hasBet = bet != null && bet > 0;
  const hasSplit = Boolean(currentRound.splitHands[seatNumber]);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={hasBet ? `Bet $${bet} — open to change wager or player actions` : "No bet set — tap to set wager"}
      data-testid="player-detail-bar"
      className={`tap-target flex flex-none items-center justify-between gap-2 border-b px-2 py-2 text-left ${
        hasBet ? "border-accent/40 bg-accent/10" : "border-accent bg-accent/15"
      }`}
    >
      <span className="flex items-baseline gap-1.5">
        <span className={`text-sm font-extrabold tracking-wide ${hasBet ? "text-foreground" : "text-accent"}`}>
          {hasBet ? `BET $${bet}` : "SET BET"}
        </span>
        {hasSplit && (
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">
            HAND {isSplit ? "2" : "1"}
          </span>
        )}
      </span>
      <span className="flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground">
        {hasBet ? "Change · Details" : "Tap to set"} <ChevronRight className="h-3.5 w-3.5" aria-hidden />
      </span>
    </button>
  );
}

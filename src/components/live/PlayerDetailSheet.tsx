"use client";

import { BottomSheet } from "@/components/ui/BottomSheet";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { resolveSeatTarget } from "@/lib/utils/seatTarget";
import { QuickBetPanel } from "./QuickBetPanel";
import { PlayerActionsRow } from "./PlayerActionsRow";

/**
 * Progressive disclosure for wager entry and player actions
 * (Double/Split/Insurance/Surrender) — opened from PlayerDetailBar's
 * compact trigger, one sheet for both portrait and landscape (replaces the
 * old always-expanded portrait block AND the old landscape-only
 * LandscapeStatusSheet, which duplicated most of the same content behind a
 * second, narrower pattern). Every control rendered here is the exact
 * existing QuickBetPanel/PlayerActionsRow component, unchanged — this only
 * changes WHEN they're visible, never what they do or how they mutate.
 *
 * HandStatusLine and OperatorAssistantBar are deliberately NOT here — they
 * stay in the main scroll region regardless of this sheet's open state
 * (see LiveScreen), since they're workflow status/guidance, not wager or
 * player-action detail.
 */
export function PlayerDetailSheet({
  open,
  onClose,
  target,
}: {
  open: boolean;
  onClose: () => void;
  target: number;
}) {
  const { currentRound } = useInvestigationContext();
  const { seatNumber, isSplit } = resolveSeatTarget(currentRound, target);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={`Seat ${seatNumber}${isSplit ? " · Split" : ""} — Player Details`}
    >
      <div className="flex flex-col gap-2 pb-2">
        <QuickBetPanel target={target} />
        <PlayerActionsRow target={target} />
      </div>
    </BottomSheet>
  );
}

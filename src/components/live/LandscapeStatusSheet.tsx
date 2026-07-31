"use client";

import { BottomSheet } from "@/components/ui/BottomSheet";
import { HandStatusLine } from "./HandStatusLine";
import { PlayerActionsRow } from "./PlayerActionsRow";
import { OperatorAssistantBar } from "./OperatorAssistantBar";
import { ApplyToLinkedBetButton } from "./ApplyToLinkedBetButton";

/**
 * Landscape-only contextual panel for the infrequently-touched tail of the
 * screen — hand status detail, Double/Split/Insurance/Surrender, operator
 * guidance, and (when the active seat is actually linked to another spot)
 * "Apply bet to linked spots". On a short (landscape) phone there isn't
 * room to keep these permanently on screen alongside the count strip, seat
 * map, and keypad without forcing a scroll; they're real actions an
 * operator still needs, just not on every tap the way the keypad is, so
 * they move behind one "Status & Actions" toggle instead of eating
 * permanent vertical space. In portrait there's room for all of it inline
 * (QuickBetPanel carries the linked-spots button itself there), so this
 * sheet is never triggered there — its opener button is `short:`-only.
 * ApplyToLinkedBetButton renders nothing on its own when the seat isn't
 * linked, so this panel never shows an empty/dead action for the common
 * case of an unlinked seat.
 */
export function LandscapeStatusSheet({
  open,
  onClose,
  activeSeat,
  activeSeatEnabled,
}: {
  open: boolean;
  onClose: () => void;
  activeSeat: number | null;
  activeSeatEnabled: boolean;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Status & Actions">
      <div className="flex flex-col gap-2 pb-2">
        <HandStatusLine />
        {activeSeatEnabled && activeSeat != null && <PlayerActionsRow target={activeSeat} />}
        {activeSeatEnabled && activeSeat != null && <ApplyToLinkedBetButton target={activeSeat} />}
        <OperatorAssistantBar />
      </div>
    </BottomSheet>
  );
}

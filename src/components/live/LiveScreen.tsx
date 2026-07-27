"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { LiveHeader } from "./LiveHeader";
import { CountSummaryPanel } from "./CountSummaryPanel";
import { TableMap } from "./TableMap";
import { ActiveSeatHeader } from "./ActiveSeatHeader";
import { HandStatusLine } from "./HandStatusLine";
import { QuickBetPanel } from "./QuickBetPanel";
import { PlayerActionsRow } from "./PlayerActionsRow";
import { CardEntryPad } from "./CardEntryPad";
import { OperatorAssistantBar } from "./OperatorAssistantBar";
import { RoundControlsRow } from "./RoundControlsRow";

/**
 * One scroll container for the whole screen below the header — never two.
 * The live-entry core (header, count summary, table map, active context,
 * card keypad, wager) are plain `flex-none` siblings, each its natural
 * height, in their original order; only the secondary stuff below (player
 * actions, guidance, and now Next Hand — see below) sits in the single
 * `overflow-y-auto` region and scrolls out of view. An operator mid-hand
 * should never lose the seat/dealer selector, the keypad, or the wager just
 * because they scrolled to tap a result — and never has to deal with a
 * second, nested scrollbar to do so.
 *
 * RoundControlsRow (Undo/Redo/Note/Clear/Next Hand) moved from a flex-none
 * sibling AFTER this scroll region to being the LAST item INSIDE it. On a
 * short viewport with an occupied seat's wager/action controls also filling
 * the sticky core, the old placement could push it below the visible area
 * with no way to reach it — a flex-none sibling after an overflow-hidden
 * parent's flex-1 child doesn't shrink, and clips instead. An earlier fix
 * attempt made it `position: absolute; bottom: 0` instead, which fixed
 * reachability but introduced a worse bug: on short viewports the pinned bar
 * visually overlapped and hid the bottom of the (sticky, per a standing
 * requirement) wager panel. Moving it inside the scroll region avoids both
 * failure modes — it's always reachable by scrolling (same guarantee
 * PlayerActionsRow already had), and nothing ever overlaps anything else,
 * since everything is in normal flow.
 *
 * History, Reports, Export, Settings, and Help open as overlays from the
 * header's Menu — the operator never leaves this screen during a live
 * investigation.
 */
export function LiveScreen() {
  const { investigation, activeTarget } = useInvestigationContext();
  const activeSeat = typeof activeTarget === "number" ? activeTarget : null;
  // A seat can be the active target without being enabled/occupied — single
  // tap only ever selects now, it never occupies. Wager/action/result
  // controls need a real seat record to act on, so they only appear once
  // the selected seat is actually enabled (split targets are negative seat
  // numbers, always tied to an already-occupied seat).
  const activeSeatEnabled =
    activeSeat != null && investigation.occupiedSeats.includes(Math.abs(activeSeat));

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <LiveHeader />
      <CountSummaryPanel />

      <TableMap />
      {activeSeat != null && <ActiveSeatHeader target={activeSeat} />}
      <CardEntryPad />
      {activeSeatEnabled && <QuickBetPanel target={activeSeat!} />}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <HandStatusLine />
        {activeSeatEnabled && <PlayerActionsRow target={activeSeat!} />}
        <OperatorAssistantBar />
        <RoundControlsRow />
      </div>
    </div>
  );
}

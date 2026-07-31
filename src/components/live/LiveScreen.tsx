"use client";

import { useState } from "react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { LiveHeader } from "./LiveHeader";
import { CountSummaryPanel } from "./CountSummaryPanel";
import { LiveDeckSelector } from "./LiveDeckSelector";
import { TableMap } from "./TableMap";
import { ActiveSeatHeader } from "./ActiveSeatHeader";
import { HandStatusLine } from "./HandStatusLine";
import { QuickBetPanel } from "./QuickBetPanel";
import { PlayerActionsRow } from "./PlayerActionsRow";
import { CardEntryPad } from "./CardEntryPad";
import { OperatorAssistantBar } from "./OperatorAssistantBar";
import { RoundControlsRow } from "./RoundControlsRow";
import { LandscapeStatusSheet } from "./LandscapeStatusSheet";
import { VoiceControl } from "./VoiceControl";
import { VoiceControlErrorBoundary } from "./VoiceControlErrorBoundary";

/**
 * Portrait / normal height (the primary case, one-handed): a single
 * stacked column, in priority order — status strip, count strip, table
 * graphic, active seat, round toolbar, card keypad (the largest, most
 * important control). Everything below the keypad — wager, hand status,
 * player actions, guidance — lives in one shared scroll region so it never
 * pushes the keypad, round toolbar, count strip, or table out of view. Every
 * size in this tree is fluid (clamp()-driven, tied to dvh) rather than
 * hard-coded per device, so this degrades continuously from the tallest
 * phone down to the shortest instead of snapping at one breakpoint.
 *
 * `short:` (real available height under ~500px — a phone rotated to
 * landscape, not device orientation itself) is a genuinely different
 * layout, not a squeezed portrait: a three-column dashboard — a pinned
 * count column (RC/TC always visible, never scrolls, never competes with
 * anything else for space), a table/dealer column (flat 3x2 seat grid, no
 * arch curve — a curve reads fine tall and narrow, not short and wide), and
 * an entry column (round toolbar + keypad). Nothing in this row scrolls.
 * The active-seat banner is redundant with CardEntryPad's own "ENTER CARD →
 * SEAT n" label at this width, so it's dropped here rather than costing an
 * entire row. Hand status, player actions (Double/Split/Insurance/
 * Surrender), and operator guidance are real features an operator still
 * needs but doesn't touch every card — they move into one "Status &
 * Actions" panel instead of permanently occupying space the keypad and
 * count strip need more.
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
  const [statusSheetOpen, setStatusSheetOpen] = useState(false);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <LiveHeader />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden short:flex-row">
        <div className="flex flex-none flex-col short:h-full short:w-[19%] short:min-w-[64px] short:justify-center short:border-r short:border-border">
          <CountSummaryPanel />
          <LiveDeckSelector />
        </div>

        <div className="flex-none short:flex short:h-full short:w-[36%] short:min-w-0 short:flex-col short:border-r short:border-border short:p-1">
          <TableMap />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden short:w-[45%]">
          {activeSeat != null && <ActiveSeatHeader target={activeSeat} />}
          <RoundControlsRow />
          <CardEntryPad />

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto short:hidden">
            {activeSeatEnabled && <QuickBetPanel target={activeSeat!} />}
            <HandStatusLine />
            {activeSeatEnabled && <PlayerActionsRow target={activeSeat!} />}
            <OperatorAssistantBar />
          </div>

          <div className="hidden short:flex short:min-h-0 short:flex-1 short:flex-col short:justify-end short:overflow-hidden">
            {activeSeatEnabled && <QuickBetPanel target={activeSeat!} />}
            <button
              type="button"
              onClick={() => setStatusSheetOpen(true)}
              className="tap-target flex flex-none items-center justify-center gap-1 border-t border-border bg-surface-raised text-[11px] font-medium text-muted-foreground"
            >
              Status &amp; Actions ▾
            </button>
          </div>
        </div>
      </div>

      <LandscapeStatusSheet
        open={statusSheetOpen}
        onClose={() => setStatusSheetOpen(false)}
        activeSeat={activeSeat}
        activeSeatEnabled={activeSeatEnabled}
      />

      {/* Voice-entry beta (v1.1) — mounted here specifically so it unmounts
          along with the rest of this screen under the privacy lock (see
          InvestigationChrome), the same mechanism that already protects
          every other live control from being reachable while locked. */}
      <VoiceControlErrorBoundary>
        <VoiceControl />
      </VoiceControlErrorBoundary>
    </div>
  );
}

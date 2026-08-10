"use client";

import { useState } from "react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { LiveHeader } from "./LiveHeader";
import { TableMap } from "./TableMap";
import { ActiveSeatHeader } from "./ActiveSeatHeader";
import { HandStatusLine } from "./HandStatusLine";
import { PlayerDetailBar } from "./PlayerDetailBar";
import { PlayerDetailSheet } from "./PlayerDetailSheet";
import { CardEntryPad } from "./CardEntryPad";
import { OperatorAssistantBar } from "./OperatorAssistantBar";
import { RoundControlsRow } from "./RoundControlsRow";
import { VoiceControl } from "./VoiceControl";
import { VoiceControlErrorBoundary } from "./VoiceControlErrorBoundary";

/**
 * Count-first live screen — priority order, top to bottom: the unified
 * status bar (identity + the dominant HI-LO count block, see LiveHeader/
 * CountSummaryPanel), table graphic, the one active-target statement (see
 * ActiveSeatHeader — dealer or seat, always shown, never omitted), round
 * toolbar, card keypad (the largest, most important control). Wagers and
 * player actions (Double/Split/Insurance/Surrender) are valuable but are
 * NOT primary counting controls, so they collapse to one compact
 * PlayerDetailBar row by default; PlayerDetailSheet reveals the existing
 * QuickBetPanel/PlayerActionsRow controls unchanged on demand, for both
 * portrait and landscape alike (no more separate landscape-only sheet).
 * HandStatusLine and OperatorAssistantBar stay inline, always visible —
 * workflow status/guidance, not wager/action detail.
 *
 * Deck configuration (shoe size/format/rules) is setup, not live-frequency
 * information — it lives entirely behind LiveHeader's Quick Setup sheet
 * now, never a permanent row on this screen.
 *
 * Every size in this tree is fluid (clamp()-driven, tied to dvh) rather
 * than hard-coded per device, so this degrades continuously from the
 * tallest phone down to the shortest instead of snapping at one
 * breakpoint. `short:` (real available height under ~500px — a phone
 * rotated to landscape, not device orientation itself) turns the table +
 * entry column into a genuine two-column dashboard instead of a stacked
 * column, and LiveHeader's own responsive rules fold the count strip
 * inline into one row at that width — but the active-target statement,
 * card keypad, and collapsed player-detail row behave identically in both
 * orientations now.
 */
export function LiveScreen() {
  const { investigation, activeTarget } = useInvestigationContext();
  const activeSeat = typeof activeTarget === "number" ? activeTarget : null;
  // Wager/action controls need a real seat record to act on, so
  // PlayerDetailBar/Sheet only appear once the active seat is actually
  // enabled (occupied) — split targets are negative seat numbers, always
  // tied to an already-occupied seat.
  const activeSeatEnabled =
    activeSeat != null && investigation.occupiedSeats.includes(Math.abs(activeSeat));
  const [playerDetailOpen, setPlayerDetailOpen] = useState(false);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <LiveHeader />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden short:flex-row">
        <div className="flex-none short:flex short:h-full short:w-[42%] short:min-w-0 short:flex-col short:border-r short:border-border short:p-1">
          <TableMap />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden short:flex-1">
          <ActiveSeatHeader target={activeTarget} />
          <RoundControlsRow />
          <CardEntryPad />

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {activeSeatEnabled && (
              <PlayerDetailBar target={activeSeat!} onOpen={() => setPlayerDetailOpen(true)} />
            )}
            <HandStatusLine />
            <OperatorAssistantBar />
          </div>
        </div>
      </div>

      {activeSeatEnabled && (
        <PlayerDetailSheet
          open={playerDetailOpen}
          onClose={() => setPlayerDetailOpen(false)}
          target={activeSeat!}
        />
      )}

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

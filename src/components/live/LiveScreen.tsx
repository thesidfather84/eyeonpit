"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { LiveHeader } from "./LiveHeader";
import { CountSummaryPanel } from "./CountSummaryPanel";
import { SeatTilesRow } from "./SeatTilesRow";
import { ActiveSeatHeader } from "./ActiveSeatHeader";
import { QuickBetPanel } from "./QuickBetPanel";
import { PlayerActionsRow } from "./PlayerActionsRow";
import { ResultButtonsRow } from "./ResultButtonsRow";
import { DealerPanel } from "./DealerPanel";
import { CardEntryPad } from "./CardEntryPad";
import { RoundControlsRow } from "./RoundControlsRow";

/**
 * The one operational screen — a fixed console, not a scrolling page.
 * Order: fixed header, fixed count strip, then Player Seats → Bet Entry →
 * Dealer → Card Keypad in a middle area sized to fit without scrolling on
 * typical phones, then a fixed bottom round-controls bar. History, Reports,
 * Export, Settings, and Help open as overlays from the header's Menu — the
 * operator never leaves this screen during a live investigation.
 */
export function LiveScreen() {
  const { activeTarget } = useInvestigationContext();
  const activeSeat = typeof activeTarget === "number" ? activeTarget : null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <LiveHeader />
      <CountSummaryPanel />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <SeatTilesRow />

        {activeSeat != null && (
          <>
            <ActiveSeatHeader target={activeSeat} />
            <QuickBetPanel target={activeSeat} />
            <PlayerActionsRow target={activeSeat} />
            <ResultButtonsRow target={activeSeat} />
          </>
        )}

        <DealerPanel />
        <CardEntryPad />
      </div>

      <RoundControlsRow />
    </div>
  );
}

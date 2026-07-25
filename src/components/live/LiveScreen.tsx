"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { useLockContext } from "@/contexts/LockContext";
import { LiveHeader } from "./LiveHeader";
import { CountSummaryPanel } from "./CountSummaryPanel";
import { DealerPanel } from "./DealerPanel";
import { SeatTilesRow } from "./SeatTilesRow";
import { CardEntryPad } from "./CardEntryPad";
import { PlayerActionsRow } from "./PlayerActionsRow";
import { ResultButtonsRow } from "./ResultButtonsRow";
import { QuickBetPanel } from "./QuickBetPanel";
import { RoundControlsRow } from "./RoundControlsRow";
import { EventLogPanel } from "./EventLogPanel";
import { BottomStatusBar } from "./BottomStatusBar";

/**
 * The one operational screen. Everything needed during a live investigation
 * lives here, in this order: header, count summary, dealer panel, seven
 * seat grid, card entry, player actions/results, bet controls, round
 * controls, event log, bottom status. History/Reports/Export/Settings/Help
 * open as overlays from the header's Menu (see LiveMenu) — the operator
 * never navigates away from this screen during a live investigation.
 */
export function LiveScreen() {
  const { investigation, activeTarget } = useInvestigationContext();
  const { lock } = useLockContext();
  const activeSeat = typeof activeTarget === "number" ? activeTarget : null;
  const showSeatControls = activeSeat != null && investigation.trackedSeats.includes(activeSeat);

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10">
        <LiveHeader onLock={lock} />
      </div>

      <CountSummaryPanel />
      <DealerPanel />
      <SeatTilesRow />
      <CardEntryPad />

      {showSeatControls ? (
        <>
          <PlayerActionsRow seatNumber={activeSeat} />
          <ResultButtonsRow seatNumber={activeSeat} />
          <QuickBetPanel seatNumber={activeSeat} />
        </>
      ) : (
        <p className="border-b border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
          Select a tracked seat above to enter actions, results, and bets.
        </p>
      )}

      <RoundControlsRow />
      <EventLogPanel />
      <BottomStatusBar />
    </div>
  );
}

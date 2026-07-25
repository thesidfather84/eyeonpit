"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { useLockContext } from "@/contexts/LockContext";
import { LiveHeader } from "./LiveHeader";
import { CountSummaryPanel } from "./CountSummaryPanel";
import { ShoeInfoPanel } from "./ShoeInfoPanel";
import { DealerPanel } from "./DealerPanel";
import { SeatTilesRow } from "./SeatTilesRow";
import { QuickBetPanel } from "./QuickBetPanel";
import { CardEntryPad } from "./CardEntryPad";
import { PlayerActionsRow } from "./PlayerActionsRow";
import { RoundControlsRow } from "./RoundControlsRow";
import { EventLogPanel } from "./EventLogPanel";

export function LiveScreen() {
  const { investigation, activeTarget } = useInvestigationContext();
  const { lock } = useLockContext();
  const activeSeat = typeof activeTarget === "number" ? activeTarget : null;

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10">
        <LiveHeader onLock={lock} />
      </div>
      <CountSummaryPanel />
      <ShoeInfoPanel />
      <DealerPanel />
      <SeatTilesRow />

      {activeSeat != null && investigation.trackedSeats.includes(activeSeat) ? (
        <>
          <QuickBetPanel seatNumber={activeSeat} />
          <PlayerActionsRow seatNumber={activeSeat} />
        </>
      ) : (
        <p className="border-b border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
          Select a tracked seat to enter bets and player actions.
        </p>
      )}

      <CardEntryPad />
      <RoundControlsRow />
      <EventLogPanel />
    </div>
  );
}

"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { LiveHeader } from "./LiveHeader";
import { CountSummaryPanel } from "./CountSummaryPanel";
import { SeatTilesRow } from "./SeatTilesRow";
import { ActiveSeatHeader } from "./ActiveSeatHeader";
import { HandStatusLine } from "./HandStatusLine";
import { QuickBetPanel } from "./QuickBetPanel";
import { PlayerActionsRow } from "./PlayerActionsRow";
import { ResultButtonsRow } from "./ResultButtonsRow";
import { DealerPanel } from "./DealerPanel";
import { CardEntryPad } from "./CardEntryPad";
import { OperatorAssistantBar } from "./OperatorAssistantBar";
import { RoundControlsRow } from "./RoundControlsRow";

/**
 * The one operational screen — a fixed console, not a scrolling page.
 * Ordered by what the operator needs at a glance, highest priority first:
 * active seat/dealer, cards, card entry, current hand status, dealer hand,
 * wager controls, then running count lower down. History, Reports, Export,
 * Settings, and Help open as overlays from the header's Menu — the
 * operator never leaves this screen during a live investigation.
 */
export function LiveScreen() {
  const { activeTarget } = useInvestigationContext();
  const activeSeat = typeof activeTarget === "number" ? activeTarget : null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <LiveHeader />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <SeatTilesRow />

        {activeSeat != null && <ActiveSeatHeader target={activeSeat} />}

        <CardEntryPad />
        <HandStatusLine />
        <DealerPanel />

        {activeSeat != null && (
          <>
            <QuickBetPanel target={activeSeat} />
            <PlayerActionsRow target={activeSeat} />
            <ResultButtonsRow target={activeSeat} />
          </>
        )}

        <CountSummaryPanel />
      </div>

      <OperatorAssistantBar />
      <RoundControlsRow />
    </div>
  );
}

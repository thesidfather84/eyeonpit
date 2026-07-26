"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { LiveHeader } from "./LiveHeader";
import { CountSummaryPanel } from "./CountSummaryPanel";
import { TableMap } from "./TableMap";
import { ActiveSeatHeader } from "./ActiveSeatHeader";
import { HandStatusLine } from "./HandStatusLine";
import { QuickBetPanel } from "./QuickBetPanel";
import { PlayerActionsRow } from "./PlayerActionsRow";
import { ResultButtonsRow } from "./ResultButtonsRow";
import { DealerActionsRow } from "./DealerActionsRow";
import { CardEntryPad } from "./CardEntryPad";
import { OperatorAssistantBar } from "./OperatorAssistantBar";
import { RoundControlsRow } from "./RoundControlsRow";

/**
 * The table map: all seven seats plus the dealer, fixed positions in one
 * grid, always visible together — never replaced by a separate screen.
 * Selecting any position highlights it in place. Everything below the
 * table is a context-sensitive control dock for whatever's currently
 * selected: card keypad, hand status, hand/dealer actions, result
 * buttons, and wager controls. History, Reports, Export, Settings, and
 * Help open as overlays from the header's Menu — the operator never
 * leaves this screen during a live investigation.
 */
export function LiveScreen() {
  const { activeTarget } = useInvestigationContext();
  const activeSeat = typeof activeTarget === "number" ? activeTarget : null;
  const isDealerActive = activeTarget === "dealer" || activeTarget === "dealer-hole";

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <LiveHeader />
      <CountSummaryPanel />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <TableMap />

        {activeSeat != null && <ActiveSeatHeader target={activeSeat} />}

        <CardEntryPad />
        <HandStatusLine />

        {isDealerActive && <DealerActionsRow />}

        {activeSeat != null && (
          <>
            <PlayerActionsRow target={activeSeat} />
            <ResultButtonsRow target={activeSeat} />
            <QuickBetPanel target={activeSeat} />
          </>
        )}
      </div>

      <OperatorAssistantBar />
      <RoundControlsRow />
    </div>
  );
}

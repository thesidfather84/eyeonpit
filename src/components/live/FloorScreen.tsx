"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { InvestigationReportsView } from "./InvestigationReportsView";
import { OperationalHeader } from "./OperationalHeader";
import { CountSummaryPanel } from "./CountSummaryPanel";
import { FloorPlayField } from "./FloorPlayField";
import { ActiveSeatPanel } from "./ActiveSeatPanel";
import { SeatBetWorkspace } from "./SeatBetWorkspace";
import { CardEntryPad } from "./CardEntryPad";
import { RoundControlsRow } from "./RoundControlsRow";
import { OperationalQuickActions } from "./OperationalQuickActions";
import { InvestigationIdFooter } from "./InvestigationIdFooter";
import { BottomNavigation } from "./BottomNavigation";
import { VoiceControl } from "./VoiceControl";
import { VoiceControlErrorBoundary } from "./VoiceControlErrorBoundary";

/**
 * Floor Mode's operational shell (AGENTS.md operational UI rebuild) —
 * built from the SAME shared pieces LiveScreen uses (OperationalHeader,
 * CountSummaryPanel, ActiveSeatPanel, CardEntryPad, RoundControlsRow,
 * OperationalQuickActions, InvestigationIdFooter, BottomNavigation), so
 * Floor and Surveillance share one visual language end to end — header
 * language, count presentation, seat visual vocabulary, navigation,
 * spacing, typography — instead of two shells that drifted apart release
 * by release. Same InvestigationProvider, same CardEvent ledger, same
 * count engine, same card/round mutations as Surveillance — zero new
 * state, zero new mutation logic, zero new counting math.
 *
 * What stays genuinely Floor-specific, per existing product behavior:
 * FloorPlayField (the compact, voice-first play-field summary — never the
 * full SeatTilesRow/TableMap; see that component's own doc comment for the
 * scope line) in place of the table graphic, and `floorMode` on
 * RoundControlsRow/VoiceControl (Done completes AND advances in one step —
 * see useRoundControls' own doc comment). Wager entry/change and
 * Double/Split/Insurance/Surrender are real Floor operations, via the
 * exact same ActiveSeatPanel Surveillance uses.
 *
 * A closed investigation shows its Report/Review content instead of a
 * live-looking hands-free console, and VoiceControl is never mounted for
 * a historical record — same rule LiveScreen's own doc comment describes.
 */
export function FloorScreen() {
  const { investigation, activeTarget } = useInvestigationContext();
  const isClosed = investigation.status === "closed";

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <OperationalHeader mode="floor" />
      <CountSummaryPanel />

      {isClosed ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
          <InvestigationReportsView />
        </div>
      ) : (
        <>
          {/* FloorPlayField/ActiveSeatPanel/SeatBetWorkspace vary in height
              (SeatBetWorkspace's chip strip + custom-amount row can push
              this taller than a short device's spare space) — this region
              scrolls on its own so CardEntryPad/RoundControlsRow/
              OperationalQuickActions below, the controls an operator needs
              on every single card and every Lock/Pause tap, are never
              squeezed or clipped to fit. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <FloorPlayField />
            <ActiveSeatPanel target={activeTarget} terminology="spot" />
            <SeatBetWorkspace target={activeTarget} />
          </div>

          <CardEntryPad terminology="spot" />
          <RoundControlsRow floorMode />
          <OperationalQuickActions />

          <VoiceControlErrorBoundary>
            <VoiceControl floorMode />
          </VoiceControlErrorBoundary>
        </>
      )}

      <InvestigationIdFooter />
      <BottomNavigation mode="floor" />
    </div>
  );
}

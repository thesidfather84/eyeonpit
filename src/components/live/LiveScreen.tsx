"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { InvestigationReportsView } from "./InvestigationReportsView";
import { OperationalHeader } from "./OperationalHeader";
import { CountSummaryPanel } from "./CountSummaryPanel";
import { TableMap } from "./TableMap";
import { ActiveSeatPanel } from "./ActiveSeatPanel";
import { SeatBetWorkspace } from "./SeatBetWorkspace";
import { HandStatusLine } from "./HandStatusLine";
import { CardEntryPad } from "./CardEntryPad";
import { OperatorAssistantBar } from "./OperatorAssistantBar";
import { RoundControlsRow } from "./RoundControlsRow";
import { OperationalQuickActions } from "./OperationalQuickActions";
import { InvestigationIdFooter } from "./InvestigationIdFooter";
import { BottomNavigation } from "./BottomNavigation";
import { VoiceControl } from "./VoiceControl";
import { VoiceControlErrorBoundary } from "./VoiceControlErrorBoundary";

/**
 * Surveillance's operational shell (AGENTS.md operational UI rebuild) —
 * built from the same shared pieces FloorScreen uses, in the approved
 * priority order: OperationalHeader (mode/table/live, nothing else) ->
 * CountSummaryPanel (the count dashboard) -> BlackjackTable (TableMap) ->
 * ActiveSeatPanel (the one always-visible bet/cards/status working area,
 * never hidden behind a "Player Details" tap) -> CardEntryPad (the
 * largest control) -> RoundControlsRow (Done/Next/Undo/More) ->
 * OperationalQuickActions (Lock/Pause, demoted out of the header) ->
 * InvestigationIdFooter (tertiary) -> BottomNavigation (Home/mode-switch/
 * Report/Settings/More, the one place those live).
 *
 * Every size in this tree is fluid (clamp()-driven, tied to dvh) rather
 * than hard-coded per device. `short:` (real available height under
 * ~500px — landscape phone) turns the table + entry column into a genuine
 * two-column dashboard instead of a stacked column; the app's own root
 * layout (`(app)/layout.tsx`) is what keeps this a fixed mobile-width
 * column on a wide desktop window UNLESS `short:` is also active, so no
 * component here needs its own max-width logic.
 */
export function LiveScreen() {
  const { investigation, activeTarget } = useInvestigationContext();
  const isClosed = investigation.status === "closed";

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <OperationalHeader mode="surveillance" />
      <CountSummaryPanel />

      {isClosed ? (
        // PRIORITY 1.9-6/8/9 — "a completed investigation is historical
        // data — it must NEVER remain the operational working state." A
        // closed investigation reached here (a History link, a stale
        // bookmark, a reload after finalizing, or the back button) shows
        // its Report/Review content, never the live editing console —
        // card entry, the table map, and VoiceControl (which would
        // otherwise request the microphone for a historical record) are
        // never rendered for a closed investigation. See
        // docs/EYEONPIT_1_9_OPERATOR_LIFECYCLE.md for the root-cause
        // writeup this fixes.
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
          <InvestigationReportsView />
        </div>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden short:flex-row">
            <div className="flex-none short:flex short:h-full short:w-[42%] short:min-w-0 short:flex-col short:border-r short:border-border short:p-1">
              <TableMap />
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden short:flex-1">
              <ActiveSeatPanel target={activeTarget} />

              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                <SeatBetWorkspace target={activeTarget} />
                <HandStatusLine />
                <OperatorAssistantBar />
              </div>

              <CardEntryPad />
              <RoundControlsRow />
              <OperationalQuickActions />
            </div>
          </div>

          {/* Voice-entry beta (v1.1) — mounted here specifically so it
              unmounts along with the rest of this screen under the privacy
              lock (see InvestigationChrome), the same mechanism that
              already protects every other live control from being
              reachable while locked. */}
          <VoiceControlErrorBoundary>
            <VoiceControl />
          </VoiceControlErrorBoundary>
        </>
      )}

      <InvestigationIdFooter />
      <BottomNavigation mode="surveillance" />
    </div>
  );
}

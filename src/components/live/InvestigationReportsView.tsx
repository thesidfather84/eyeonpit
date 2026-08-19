import { EventLogPanel } from "./EventLogPanel";
import { BottomStatusBar } from "./BottomStatusBar";
import { AnalysisScreen } from "@/components/analysis/AnalysisScreen";
import { ReportScreen } from "@/components/report/ReportScreen";

/**
 * PRIORITY 1.9-6/8/9 — the full "Reports" content (event log, status,
 * advantage-play analysis, and the editable report itself) as one
 * reusable block. Previously inlined only inside `LiveMenu`'s
 * `overlay === "reports"` BottomSheet; now also the direct body of a
 * CLOSED investigation's `/live` (or `/floor`) screen — see
 * `LiveScreen.tsx`/`FloorScreen.tsx`'s own doc comments — so a completed
 * investigation's full review is what's actually shown, not a lesser
 * subset of it.
 */
export function InvestigationReportsView() {
  return (
    <div className="flex flex-col gap-4 pb-4">
      <EventLogPanel />
      <div className="border-t border-border pt-4">
        <BottomStatusBar />
      </div>
      <div className="border-t border-border pt-4">
        <AnalysisScreen />
      </div>
      <div className="border-t border-border pt-4">
        <ReportScreen />
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, FileText, HelpCircle, History as HistoryIcon, Menu as MenuIcon, Settings } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { WorkflowHelpContent } from "@/components/settings/WorkflowHelpContent";
import { AnalysisScreen } from "@/components/analysis/AnalysisScreen";
import { ReportScreen } from "@/components/report/ReportScreen";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { listInvestigations } from "@/lib/db/repositories/investigations";
import { downloadInvestigationJson } from "@/lib/export/toJson";
import type { Investigation } from "@/types/investigation";

type OverlayKey = "history" | "reports" | "export" | "settings" | "help";

const MENU_ITEMS: { key: OverlayKey; label: string; icon: typeof HistoryIcon }[] = [
  { key: "history", label: "History", icon: HistoryIcon },
  { key: "reports", label: "Reports", icon: FileText },
  { key: "export", label: "Export", icon: Download },
  { key: "settings", label: "Settings", icon: Settings },
  { key: "help", label: "Help", icon: HelpCircle },
];

function HistoryOverlayContent() {
  const [investigations, setInvestigations] = useState<Investigation[] | null>(null);

  useEffect(() => {
    listInvestigations().then(setInvestigations);
  }, []);

  return (
    <div className="flex flex-col gap-2 pb-4">
      {investigations === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {investigations?.length === 0 && (
        <p className="text-sm text-muted-foreground">No investigations yet.</p>
      )}
      {investigations?.map((inv) => (
        <Link
          key={inv.localId}
          href={`/investigations/${inv.localId}/live`}
          className="tap-target flex flex-col justify-center rounded-lg border border-border bg-surface-raised px-3 hover:bg-surface"
        >
          <span className="text-sm font-medium text-foreground">{inv.displayId}</span>
          <span className="text-xs text-muted-foreground">
            {inv.casino} · Table {inv.tableNumber} · {inv.status}
          </span>
        </Link>
      ))}
    </div>
  );
}

function ExportOverlayContent() {
  const { investigation } = useInvestigationContext();
  return (
    <div className="flex flex-col gap-3 pb-4">
      <p className="text-xs text-muted-foreground">
        Exports every round, seat hand, and event log entry for this investigation as JSON.
      </p>
      <Button variant="secondary" onClick={() => downloadInvestigationJson(investigation)}>
        Export {investigation.displayId} (JSON)
      </Button>
    </div>
  );
}

/**
 * The sole way to reach History/Reports/Export/Settings/Help from the Live
 * screen — everything renders as an overlay on top of Live, which stays
 * mounted underneath. The operator never navigates away to see this
 * content. Reports combines the former Analysis and Report screens into
 * one scrollable overlay.
 */
export function LiveMenu() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [overlay, setOverlay] = useState<OverlayKey | null>(null);

  function openOverlay(key: OverlayKey) {
    setMenuOpen(false);
    setOverlay(key);
  }

  return (
    <>
      <button
        onClick={() => setMenuOpen(true)}
        aria-label="Menu"
        className="tap-target flex items-center justify-center text-muted-foreground hover:text-foreground"
      >
        <MenuIcon className="h-5 w-5" aria-hidden />
      </button>

      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu">
        <div className="flex flex-col gap-1 pb-4">
          {MENU_ITEMS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => openOverlay(key)}
              className="tap-target flex items-center gap-3 rounded-lg px-3 text-sm font-medium text-foreground hover:bg-surface-raised"
            >
              <Icon className="h-5 w-5" aria-hidden /> {label}
            </button>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet open={overlay === "history"} onClose={() => setOverlay(null)} title="History">
        <HistoryOverlayContent />
      </BottomSheet>

      <BottomSheet open={overlay === "reports"} onClose={() => setOverlay(null)} title="Reports">
        <div className="flex flex-col gap-4 pb-4">
          <AnalysisScreen />
          <div className="border-t border-border pt-4">
            <ReportScreen />
          </div>
        </div>
      </BottomSheet>

      <BottomSheet open={overlay === "export"} onClose={() => setOverlay(null)} title="Export">
        <ExportOverlayContent />
      </BottomSheet>

      <BottomSheet open={overlay === "settings"} onClose={() => setOverlay(null)} title="Settings">
        <SettingsScreen />
      </BottomSheet>

      <BottomSheet open={overlay === "help"} onClose={() => setOverlay(null)} title="Help">
        <WorkflowHelpContent />
      </BottomSheet>
    </>
  );
}

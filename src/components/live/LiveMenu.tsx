"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Download,
  FileText,
  HelpCircle,
  History as HistoryIcon,
  Layers,
  Menu as MenuIcon,
  Settings,
  XOctagon,
} from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { WorkflowHelpContent } from "@/components/settings/WorkflowHelpContent";
import { AnalysisScreen } from "@/components/analysis/AnalysisScreen";
import { ReportScreen } from "@/components/report/ReportScreen";
import { EventLogPanel } from "./EventLogPanel";
import { BottomStatusBar } from "./BottomStatusBar";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { completeInvestigation, listInvestigations } from "@/lib/db/repositories/investigations";
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
 * mounted underneath. New Shoe / End Investigation live here too (moved out
 * of the fixed bottom bar to keep that bar to routine round actions only);
 * both still require confirmation.
 */
export function LiveMenu() {
  const {
    investigation,
    currentRound,
    startNewShoe,
    completeRoundAndStartNewShoe,
    voidRoundAndStartNewShoe,
    refresh,
    busy,
  } = useInvestigationContext();
  const [menuOpen, setMenuOpen] = useState(false);
  const [overlay, setOverlay] = useState<OverlayKey | null>(null);
  const [shoeConfirmOpen, setShoeConfirmOpen] = useState(false);
  const [incompletePromptOpen, setIncompletePromptOpen] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [ending, setEnding] = useState(false);

  function openOverlay(key: OverlayKey) {
    setMenuOpen(false);
    setOverlay(key);
  }

  function handleNewShoeSelected() {
    setMenuOpen(false);
    if (currentRound.completed) {
      setShoeConfirmOpen(true);
    } else {
      setIncompletePromptOpen(true);
    }
  }

  async function handleConfirmShoe() {
    await startNewShoe();
    setShoeConfirmOpen(false);
  }

  async function handleCompleteRoundFirst() {
    await completeRoundAndStartNewShoe();
    setIncompletePromptOpen(false);
  }

  async function handleVoidAndStartNewShoe() {
    await voidRoundAndStartNewShoe();
    setIncompletePromptOpen(false);
  }

  async function handleEndInvestigation() {
    setEnding(true);
    try {
      await completeInvestigation(investigation.localId);
      await refresh();
    } finally {
      setEnding(false);
      setEndConfirmOpen(false);
      setMenuOpen(false);
    }
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
          <button
            onClick={handleNewShoeSelected}
            disabled={busy || investigation.status !== "active"}
            className="tap-target flex items-center gap-3 rounded-lg px-3 text-sm font-medium text-foreground hover:bg-surface-raised disabled:opacity-40"
          >
            <Layers className="h-5 w-5" aria-hidden /> New Shoe
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
              setEndConfirmOpen(true);
            }}
            disabled={busy || investigation.status === "closed"}
            className="tap-target flex items-center gap-3 rounded-lg px-3 text-sm font-medium text-destructive hover:bg-surface-raised disabled:opacity-40"
          >
            <XOctagon className="h-5 w-5" aria-hidden /> End Investigation
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={overlay === "history"} onClose={() => setOverlay(null)} title="History">
        <HistoryOverlayContent />
      </BottomSheet>

      <BottomSheet open={overlay === "reports"} onClose={() => setOverlay(null)} title="Reports">
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

      <ConfirmDialog
        open={shoeConfirmOpen}
        title="Start a new shoe?"
        message="Start a new shoe? This will reset the running count and shoe card history. Completed rounds will remain saved."
        confirmLabel="Start New Shoe"
        busy={busy}
        onConfirm={handleConfirmShoe}
        onCancel={() => setShoeConfirmOpen(false)}
      />

      {incompletePromptOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button
            aria-label="Cancel"
            className="absolute inset-0 bg-black/60"
            onClick={() => setIncompletePromptOpen(false)}
          />
          <div className="relative w-full max-w-sm rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-2 text-base font-semibold text-foreground">
              The current round is not complete.
            </h2>
            <div className="flex flex-col gap-2">
              <Button variant="secondary" fullWidth onClick={() => setIncompletePromptOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" fullWidth disabled={busy} onClick={handleCompleteRoundFirst}>
                Complete Round First
              </Button>
              <Button
                variant="destructive"
                fullWidth
                disabled={busy}
                onClick={handleVoidAndStartNewShoe}
              >
                Void Current Round and Start New Shoe
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={endConfirmOpen}
        title="End this investigation?"
        message={`${investigation.rounds.length} rounds recorded across ${investigation.occupiedSeats.length} occupied seat(s). You can still reopen it later from History.`}
        confirmLabel="End Investigation"
        destructive
        busy={ending}
        onConfirm={handleEndInvestigation}
        onCancel={() => setEndConfirmOpen(false)}
      />
    </>
  );
}

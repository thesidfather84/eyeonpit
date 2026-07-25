"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSettingsStore } from "@/store/useSettingsStore";
import { listInvestigations, resetAllData } from "@/lib/db/repositories/investigations";
import { findOrCreatePracticeInvestigation } from "@/lib/onboarding/practiceInvestigationSeed";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export function SettingsScreen() {
  const router = useRouter();
  const { showGuidedTips, setShowGuidedTips } = useSettingsStore();
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [resetConfirming, setResetConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function handlePractice() {
    setPracticeLoading(true);
    try {
      const investigation = await findOrCreatePracticeInvestigation();
      router.push(`/investigations/${investigation.localId}/live`);
    } finally {
      setPracticeLoading(false);
    }
  }

  async function handleExportAll() {
    setExporting(true);
    try {
      const all = await listInvestigations({ includeDemo: false });
      const blob = new Blob([JSON.stringify(all, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "eyeonpit-investigations.json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  async function handleReset() {
    setResetting(true);
    try {
      await resetAllData();
      router.push("/");
    } finally {
      setResetting(false);
      setResetConfirming(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-3">
      <section className="rounded-lg border border-border bg-surface p-3">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Guided tips</span>
          <button
            onClick={() => setShowGuidedTips(!showGuidedTips)}
            aria-pressed={showGuidedTips}
            className={`tap-target rounded-full px-4 text-xs font-bold ${
              showGuidedTips ? "bg-accent text-accent-foreground" : "border border-border text-muted-foreground"
            }`}
          >
            {showGuidedTips ? "ON" : "OFF"}
          </button>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Dark theme</span>
          <span className="text-xs text-muted-foreground">Always on</span>
        </div>
      </section>

      <Button variant="secondary" disabled={practiceLoading} onClick={handlePractice}>
        {practiceLoading ? "Loading…" : "▷ Try a Practice Investigation"}
      </Button>

      <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
        <h2 className="text-sm font-semibold text-foreground">Data</h2>
        <Button variant="secondary" disabled={exporting} onClick={handleExportAll}>
          {exporting ? "Exporting…" : "Export All Investigations (JSON)"}
        </Button>
        <Button variant="destructive" onClick={() => setResetConfirming(true)}>
          Reset All Local Data
        </Button>
      </section>

      <ConfirmDialog
        open={resetConfirming}
        title="Reset all local data?"
        message="This permanently deletes every investigation stored on this device, including closed ones. This cannot be undone."
        confirmLabel="Delete Everything"
        destructive
        busy={resetting}
        onConfirm={handleReset}
        onCancel={() => setResetConfirming(false)}
      />
    </div>
  );
}

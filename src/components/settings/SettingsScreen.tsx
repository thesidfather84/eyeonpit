"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSettingsStore, type WorkflowAssistanceLevel } from "@/store/useSettingsStore";
import type { TerminologyLevel } from "@/lib/terminology";
import { listInvestigations, resetAllData } from "@/lib/db/repositories/investigations";
import { findOrCreatePracticeInvestigation } from "@/lib/onboarding/practiceInvestigationSeed";
import { downloadDiagnostics, exportDiagnostics } from "@/lib/diagnostics/logger";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const LANGUAGE_OPTIONS: { value: TerminologyLevel; label: string; hint: string }[] = [
  { value: "standard", label: "Standard", hint: "Generic software terms" },
  { value: "casino", label: "Casino", hint: "Casino-floor terms (Wager, Seat, Next Hand)" },
  {
    value: "casinoProfessional",
    label: "Casino Professional",
    hint: "Full surveillance/regulatory vocabulary",
  },
];

const ASSISTANCE_OPTIONS: { value: WorkflowAssistanceLevel; label: string; hint: string }[] = [
  { value: "off", label: "Off", hint: "No messages" },
  { value: "basic", label: "Basic", hint: "Show only the next recommended step" },
  { value: "guided", label: "Guided", hint: "Add explanations for new operators" },
];

export function SettingsScreen() {
  const router = useRouter();
  const {
    showGuidedTips,
    setShowGuidedTips,
    terminologyLevel,
    setTerminologyLevel,
    workflowAssistance,
    setWorkflowAssistance,
  } = useSettingsStore();
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [resetConfirming, setResetConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingDiagnostics, setExportingDiagnostics] = useState(false);

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

  async function handleExportDiagnostics() {
    setExportingDiagnostics(true);
    try {
      downloadDiagnostics(await exportDiagnostics());
    } finally {
      setExportingDiagnostics(false);
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

      <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
        <h2 className="text-sm font-semibold text-foreground">Language</h2>
        {LANGUAGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setTerminologyLevel(opt.value)}
            className={`w-full rounded-xl border px-4 py-2.5 text-left ${
              terminologyLevel === opt.value
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border bg-surface-raised text-foreground"
            }`}
          >
            <span className="block text-sm font-medium">{opt.label}</span>
            <span
              className={`block text-xs ${
                terminologyLevel === opt.value ? "text-accent-foreground/80" : "text-muted-foreground"
              }`}
            >
              {opt.hint}
            </span>
          </button>
        ))}
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
        <h2 className="text-sm font-semibold text-foreground">Workflow Assistance</h2>
        {ASSISTANCE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setWorkflowAssistance(opt.value)}
            className={`w-full rounded-xl border px-4 py-2.5 text-left ${
              workflowAssistance === opt.value
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border bg-surface-raised text-foreground"
            }`}
          >
            <span className="block text-sm font-medium">{opt.label}</span>
            <span
              className={`block text-xs ${
                workflowAssistance === opt.value ? "text-accent-foreground/80" : "text-muted-foreground"
              }`}
            >
              {opt.hint}
            </span>
          </button>
        ))}
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

      <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
        <h2 className="text-sm font-semibold text-foreground">Diagnostics</h2>
        <p className="text-xs text-muted-foreground">
          Build {process.env.NEXT_PUBLIC_BUILD_ID?.slice(0, 7) ?? "local"}
        </p>
        <Button variant="secondary" disabled={exportingDiagnostics} onClick={handleExportDiagnostics}>
          {exportingDiagnostics ? "Exporting…" : "Export Diagnostics"}
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

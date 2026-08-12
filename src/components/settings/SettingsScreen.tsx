"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSettingsStore, type FloorSpokenCountSetting, type WorkflowAssistanceLevel } from "@/store/useSettingsStore";
import type { TerminologyLevel } from "@/lib/terminology";
import {
  completeInvestigation,
  createInvestigation,
  listInvestigations,
  resetAllData,
  resetPracticeInvestigationLiveState,
} from "@/lib/db/repositories/investigations";
import { DEFAULT_GAME_CONFIG } from "@/types/investigation";
import { findOrCreatePracticeInvestigation } from "@/lib/onboarding/practiceInvestigationSeed";
import { downloadDiagnostics, exportDiagnostics } from "@/lib/diagnostics/logger";
import { useServiceWorkerUpdate } from "@/hooks/useServiceWorkerUpdate";
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

const FLOOR_SPOKEN_COUNT_OPTIONS: { value: FloorSpokenCountSetting; label: string; hint: string }[] = [
  { value: "hiloRc", label: "Hi-Lo RC", hint: 'Running count only — e.g. "Hi-Lo minus three"' },
  { value: "hiloRcTc", label: "Hi-Lo RC + TC", hint: "Adds the true count sentence" },
  { value: "all", label: "All enabled counts", hint: "Every counting system's running count, plus true count/decks per the usual rules" },
  { value: "off", label: "Off", hint: 'No count in "Status" or the Done-completion announcement (Spoken voice feedback above still governs everything else)' },
];

interface SettingsScreenProps {
  /**
   * Only present when Settings is opened from inside a live investigation
   * (LiveMenu) — the standalone /settings route has no investigation
   * context to read, so it passes nothing and the two investigation-scoped
   * actions below stay hidden there. `isDemo` decides which of the two
   * "Current Investigation" actions renders — see the section below: a
   * production investigation only ever gets the non-destructive "Start
   * Fresh Investigation" path, never the CardEvent-deleting reset, which is
   * reserved for disposable Practice investigations only.
   */
  activeInvestigation?: { localId: string; displayId: string; isDemo: boolean } | null;
}

export function SettingsScreen({ activeInvestigation }: SettingsScreenProps = {}) {
  const router = useRouter();
  const {
    showGuidedTips,
    setShowGuidedTips,
    terminologyLevel,
    setTerminologyLevel,
    workflowAssistance,
    setWorkflowAssistance,
    showGroupLabels,
    setShowGroupLabels,
    voiceAudioFeedback,
    setVoiceAudioFeedback,
    floorSpokenCountContent,
    setFloorSpokenCountContent,
  } = useSettingsStore();
  const {
    updateAvailable,
    supported: swSupported,
    activeScriptURL,
    cacheNames,
    checking,
    checkNow,
    activateUpdate,
  } = useServiceWorkerUpdate();
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [resetConfirming, setResetConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingDiagnostics, setExportingDiagnostics] = useState(false);
  const [checkedOnce, setCheckedOnce] = useState(false);
  const [startFreshConfirming, setStartFreshConfirming] = useState(false);
  const [startingFresh, setStartingFresh] = useState(false);
  const [resetCurrentConfirming, setResetCurrentConfirming] = useState(false);
  const [resettingCurrent, setResettingCurrent] = useState(false);

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

  async function handleCheckForUpdate() {
    await checkNow();
    setCheckedOnce(true);
  }

  function handleReloadApp() {
    window.location.reload();
  }

  async function handleStartFresh() {
    if (!activeInvestigation) return;
    setStartingFresh(true);
    try {
      await completeInvestigation(activeInvestigation.localId);
      const fresh = await createInvestigation({
        casino: "",
        tableNumber: "",
        dealerName: "",
        investigationDate: new Date().toISOString().slice(0, 10),
        operatorName: "",
        countingSystem: "Hi-Lo",
        shoeTotalDecks: DEFAULT_GAME_CONFIG.deckCount,
        blackjackFormat: DEFAULT_GAME_CONFIG.format,
        ruleProfile: DEFAULT_GAME_CONFIG.ruleProfile,
        entryDirection: DEFAULT_GAME_CONFIG.entryDirection,
        playerSpotCount: DEFAULT_GAME_CONFIG.playerSpotCount,
        practiceMode: DEFAULT_GAME_CONFIG.practiceMode,
        status: "active",
      });
      router.push(`/investigations/${fresh.localId}/live`);
    } finally {
      setStartingFresh(false);
      setStartFreshConfirming(false);
    }
  }

  // Practice-only — see resetPracticeInvestigationLiveState's own guard.
  // There is no production equivalent of this button: a real investigation
  // only ever exposes "Start Fresh Investigation" (handleStartFresh above),
  // which closes/archives it and starts a clean one without deleting any
  // CardEvent.
  async function handleResetPracticeData() {
    if (!activeInvestigation?.isDemo) return;
    setResettingCurrent(true);
    try {
      await resetPracticeInvestigationLiveState(activeInvestigation.localId);
      window.location.reload();
    } finally {
      setResettingCurrent(false);
      setResetCurrentConfirming(false);
    }
  }

  async function handleReset() {
    setResetting(true);
    try {
      await resetAllData();
      router.push("/app");
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
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Dark theme</span>
          <span className="text-xs text-muted-foreground">Always on</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <span className="block text-sm font-medium text-foreground">Linked seat labels</span>
            <span className="block text-xs text-muted-foreground">Show A/B/C letter on linked seats, not just the ring color</span>
          </div>
          <button
            onClick={() => setShowGroupLabels(!showGroupLabels)}
            aria-pressed={showGroupLabels}
            className={`tap-target rounded-full px-4 text-xs font-bold ${
              showGroupLabels ? "bg-accent text-accent-foreground" : "border border-border text-muted-foreground"
            }`}
          >
            {showGroupLabels ? "ON" : "OFF"}
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div>
            <span className="block text-sm font-medium text-foreground">Spoken voice feedback</span>
            <span className="block text-xs text-muted-foreground">
              Speak &quot;Count&quot;/&quot;Status&quot; voice responses aloud (Floor Mode, headset use) — otherwise shown as text only
            </span>
          </div>
          <button
            onClick={() => setVoiceAudioFeedback(!voiceAudioFeedback)}
            aria-pressed={voiceAudioFeedback}
            className={`tap-target rounded-full px-4 text-xs font-bold ${
              voiceAudioFeedback ? "bg-accent text-accent-foreground" : "border border-border text-muted-foreground"
            }`}
          >
            {voiceAudioFeedback ? "ON" : "OFF"}
          </button>
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

      <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
        <h2 className="text-sm font-semibold text-foreground">Floor Spoken Count</h2>
        <p className="text-xs text-muted-foreground">
          What &quot;Status&quot; and the Done-completion announcement speak, once Spoken voice feedback (above) has
          allowed speech at all.
        </p>
        {FLOOR_SPOKEN_COUNT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFloorSpokenCountContent(opt.value)}
            aria-pressed={floorSpokenCountContent === opt.value}
            className={`w-full rounded-xl border px-4 py-2.5 text-left ${
              floorSpokenCountContent === opt.value
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border bg-surface-raised text-foreground"
            }`}
          >
            <span className="block text-sm font-medium">{opt.label}</span>
            <span
              className={`block text-xs ${
                floorSpokenCountContent === opt.value ? "text-accent-foreground/80" : "text-muted-foreground"
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
        <h2 className="text-sm font-semibold text-foreground">App &amp; Updates</h2>
        <Button variant="secondary" disabled={checking} onClick={handleCheckForUpdate}>
          {checking ? "Checking…" : "Check for Update"}
        </Button>
        {checkedOnce && !checking && (
          <div className="rounded-md border border-border bg-surface-raised p-2 text-xs">
            {updateAvailable ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-accent">New EyeOnPit version available</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCheckedOnce(false)}
                    className="tap-target rounded-md px-2 text-muted-foreground hover:text-foreground"
                  >
                    Later
                  </button>
                  <button
                    onClick={activateUpdate}
                    className="tap-target rounded-md bg-accent px-3 font-semibold text-accent-foreground"
                  >
                    Update Now
                  </button>
                </div>
              </div>
            ) : (
              <span className="text-muted-foreground">You&apos;re on the latest version.</span>
            )}
          </div>
        )}
        <Button variant="secondary" onClick={handleReloadApp}>
          Reload App
        </Button>
        <p className="text-xs text-muted-foreground">
          Reloads the app in place. Saved investigations and the current investigation are preserved — this is
          not a reset.
        </p>
      </section>

      {activeInvestigation && (
        <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
          <h2 className="text-sm font-semibold text-foreground">Current Investigation</h2>
          <p className="text-xs text-muted-foreground">{activeInvestigation.displayId}</p>
          <Button variant="secondary" onClick={() => setStartFreshConfirming(true)}>
            Start Fresh Investigation
          </Button>
          {activeInvestigation.isDemo ? (
            <Button variant="destructive" onClick={() => setResetCurrentConfirming(true)}>
              Reset Practice Data
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              To reset the count or shoe without losing any recorded evidence, use{" "}
              <span className="font-medium text-foreground">New Shoe</span> from the Live menu instead — every
              card already recorded stays in this investigation&apos;s permanent history either way.
            </p>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
        <h2 className="text-sm font-semibold text-foreground">Data</h2>
        <Button variant="secondary" disabled={exporting} onClick={handleExportAll}>
          {exporting ? "Exporting…" : "Export All Investigations (JSON)"}
        </Button>
      </section>

      <section className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-3">
        <h2 className="mb-1 text-sm font-semibold text-foreground">About</h2>
        <AboutRow label="Application Version" value={process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0"} />
        <AboutRow label="Git Commit" value={process.env.NEXT_PUBLIC_BUILD_ID ?? "local"} />
        <AboutRow label="Build ID" value={(process.env.NEXT_PUBLIC_BUILD_ID ?? "local").slice(0, 7)} />
        <AboutRow
          label="Build Date"
          value={
            process.env.NEXT_PUBLIC_BUILD_DATE
              ? new Date(process.env.NEXT_PUBLIC_BUILD_DATE).toLocaleString()
              : "—"
          }
        />
        <AboutRow label="Service Worker" value={swSupported ? (activeScriptURL ? "Active" : "Registering…") : "Unsupported"} />
        <AboutRow label="Active Cache" value={cacheNames.length > 0 ? cacheNames.join(", ") : "—"} />
        <AboutRow label="Update Waiting" value={updateAvailable ? "Yes" : "No"} />
        <p className="mt-2 border-t border-border pt-2 text-[10px] leading-relaxed text-muted-foreground">
          Sidney Impastato — Creator / Developer · Forge — Architect
        </p>
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
        <h2 className="text-sm font-semibold text-foreground">Diagnostics</h2>
        <Button variant="secondary" disabled={exportingDiagnostics} onClick={handleExportDiagnostics}>
          {exportingDiagnostics ? "Exporting…" : "Export Diagnostics"}
        </Button>
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-surface p-3">
        <h2 className="text-sm font-semibold text-destructive">Advanced / Danger Zone</h2>
        <p className="text-xs text-muted-foreground">
          These actions are destructive and cannot be undone. Only use them if you understand what will be
          deleted.
        </p>
        <Button variant="destructive" onClick={() => setResetConfirming(true)}>
          Full Local Data Reset
        </Button>
      </section>

      <ConfirmDialog
        open={startFreshConfirming}
        title="Start a fresh investigation?"
        message={`Ends "${activeInvestigation?.displayId}" (it stays in History, fully intact) and opens a brand-new blank investigation. Nothing is deleted.`}
        confirmLabel="Start Fresh"
        busy={startingFresh}
        onConfirm={handleStartFresh}
        onCancel={() => setStartFreshConfirming(false)}
      />

      <ConfirmDialog
        open={resetCurrentConfirming}
        title="Reset this practice investigation?"
        message={`Clears all cards, wagers, hand state, running counts, and seat occupancy for "${activeInvestigation?.displayId}" back to a fresh Round 1 — this is a Practice investigation, so its data is disposable by design. Casino/table/dealer details are kept. Every other saved investigation is untouched. This cannot be undone.`}
        confirmLabel="Reset Practice Data"
        destructive
        busy={resettingCurrent}
        onConfirm={handleResetPracticeData}
        onCancel={() => setResetCurrentConfirming(false)}
      />

      <ConfirmDialog
        open={resetConfirming}
        title="Reset all local data?"
        message="This permanently deletes every investigation stored on this device, including closed ones, plus all local settings. This cannot be undone."
        confirmLabel="Delete Everything"
        destructive
        busy={resetting}
        onConfirm={handleReset}
        onCancel={() => setResetConfirming(false)}
      />
    </div>
  );
}

/** One label/value line in the About section — lets desktop, mobile browser, and an installed PWA be compared side by side to confirm they're the same build. */
function AboutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-mono text-foreground">{value}</span>
    </div>
  );
}

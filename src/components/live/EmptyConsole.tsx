"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Eye, Menu, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { NavigationDrawer } from "@/components/navigation/NavigationDrawer";
import { NewInvestigationDrawer } from "@/components/investigation-setup/NewInvestigationDrawer";
import { QuickSetupSheet } from "./QuickSetupSheet";
import { findOrCreatePracticeInvestigation } from "@/lib/onboarding/practiceInvestigationSeed";
import { createInvestigation } from "@/lib/db/repositories/investigations";
import { DEFAULT_GAME_CONFIG } from "@/types/investigation";
import { formatLastConfigSummary, loadLastGameConfig } from "@/lib/utils/lastGameConfig";
import { useServiceWorkerUpdate } from "@/hooks/useServiceWorkerUpdate";

/**
 * The homepage's own visible refresh control — distinct from the passive
 * always-mounted UpdateAvailableBanner (root layout), which only appears
 * once an update is already confirmed. This one is a direct, always-there
 * "check right now" action with its own result state, so an operator never
 * has to guess whether they're on the current build or go clear storage to
 * find out.
 */
function RefreshCheckForUpdate() {
  const { updateAvailable, checking, checkNow, activateUpdate } = useServiceWorkerUpdate();
  const [checkedOnce, setCheckedOnce] = useState(false);
  const buildId = process.env.NEXT_PUBLIC_BUILD_ID ?? "local";

  async function handleCheck() {
    await checkNow();
    setCheckedOnce(true);
  }

  return (
    <div className="mt-2 flex w-full max-w-xs flex-col items-center gap-1.5 rounded-lg border border-border bg-surface p-3">
      <button
        type="button"
        onClick={updateAvailable ? activateUpdate : handleCheck}
        disabled={checking}
        className="tap-target flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-surface-raised text-xs font-semibold text-foreground disabled:opacity-40"
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        {checking ? "Checking…" : updateAvailable ? "Update Now" : "Refresh / Check for Update"}
      </button>
      {checkedOnce && !checking && !updateAvailable && (
        <p className="text-[11px] text-muted-foreground">App is up to date</p>
      )}
      {updateAvailable && (
        <p className="text-[11px] text-accent">New version ready — tap to update</p>
      )}
      <p className="text-[10px] text-muted-foreground">Build {buildId.slice(0, 7)}</p>
    </div>
  );
}

/** Reads ?open=new (from the /investigations/new compatibility redirect) and opens the setup drawer automatically. Isolated in its own component since useSearchParams requires a Suspense boundary. */
function AutoOpenFromQuery({ onOpen }: { onOpen: () => void }) {
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("open") === "new") onOpen();
  }, [searchParams, onOpen]);
  return null;
}

/**
 * The console with no active investigation — same header/menu language as
 * the live console, just without investigation data. Starting or resuming
 * an investigation swaps this out for InvestigationConsole in place; there
 * is no page navigation involved.
 */
export function EmptyConsole({ onCreated }: { onCreated: (investigationLocalId: string) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [quickSetupOpen, setQuickSetupOpen] = useState(false);
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [defaultsLoading, setDefaultsLoading] = useState(false);
  const [lastConfigLoading, setLastConfigLoading] = useState(false);
  // Lazy initializer only — this is read once, on mount, from localStorage.
  const [lastConfig] = useState(() => loadLastGameConfig());

  async function handlePractice() {
    setPracticeLoading(true);
    try {
      const investigation = await findOrCreatePracticeInvestigation();
      onCreated(investigation.localId);
    } finally {
      setPracticeLoading(false);
    }
  }

  async function handleStartWithDefaults() {
    setDefaultsLoading(true);
    try {
      const investigation = await createInvestigation({
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
        entryMode: DEFAULT_GAME_CONFIG.entryMode,
        playerSpotCount: DEFAULT_GAME_CONFIG.playerSpotCount,
        practiceMode: DEFAULT_GAME_CONFIG.practiceMode,
        status: "active",
      });
      onCreated(investigation.localId);
    } finally {
      setDefaultsLoading(false);
    }
  }

  async function handleUseLastTableSetup() {
    if (!lastConfig) return;
    setLastConfigLoading(true);
    try {
      const { config, tableNumber } = lastConfig;
      const investigation = await createInvestigation({
        casino: "",
        tableNumber,
        dealerName: "",
        investigationDate: new Date().toISOString().slice(0, 10),
        operatorName: "",
        countingSystem: "Hi-Lo",
        shoeTotalDecks: config.deckCount,
        blackjackFormat: config.format,
        ruleProfile: config.ruleProfile,
        entryDirection: config.entryDirection,
        entryMode: config.entryMode,
        playerSpotCount: config.playerSpotCount,
        practiceMode: config.practiceMode,
        pitArea: config.pitArea,
        investigationLabel: config.investigationLabel,
        status: "active",
      });
      onCreated(investigation.localId);
    } finally {
      setLastConfigLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <Suspense fallback={null}>
        <AutoOpenFromQuery onOpen={() => setSetupOpen(true)} />
      </Suspense>

      <header className="flex flex-none items-center justify-between border-b border-border bg-surface px-3 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Menu"
            className="tap-target flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <div className="flex items-center gap-1.5">
            <Eye className="h-4 w-4 text-accent" aria-hidden />
            <span className="text-sm font-bold tracking-wide text-foreground">EyeOnPit</span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">No active investigation.</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Start tracking in seconds — no form required. Adjust anything later from Quick Setup.
        </p>

        <Button variant="primary" disabled={defaultsLoading} onClick={handleStartWithDefaults}>
          {defaultsLoading ? "Starting…" : "Start With Defaults"}
        </Button>
        <Button variant="secondary" onClick={() => setQuickSetupOpen(true)}>
          Quick Setup
        </Button>

        {lastConfig && (
          <Button variant="secondary" disabled={lastConfigLoading} onClick={handleUseLastTableSetup}>
            {lastConfigLoading ? "Starting…" : `Use Last Table Setup — ${formatLastConfigSummary(lastConfig)}`}
          </Button>
        )}

        <Button variant="secondary" disabled={practiceLoading} onClick={handlePractice}>
          {practiceLoading ? "Loading…" : "▷ Try a Practice Investigation"}
        </Button>

        <button
          onClick={() => setSetupOpen(true)}
          className="mt-1 text-xs text-muted-foreground underline hover:text-foreground"
        >
          Full setup with casino &amp; dealer details
        </button>

        <RefreshCheckForUpdate />
      </div>

      <NavigationDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
      {setupOpen && (
        <NewInvestigationDrawer onClose={() => setSetupOpen(false)} onCreated={onCreated} />
      )}
      {quickSetupOpen && (
        <QuickSetupSheet onClose={() => setQuickSetupOpen(false)} onCreated={onCreated} />
      )}
    </div>
  );
}

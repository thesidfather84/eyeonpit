"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Eye, Menu } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { NavigationDrawer } from "@/components/navigation/NavigationDrawer";
import { NewInvestigationDrawer } from "@/components/investigation-setup/NewInvestigationDrawer";
import { QuickSetupSheet } from "./QuickSetupSheet";
import { findOrCreatePracticeInvestigation } from "@/lib/onboarding/practiceInvestigationSeed";
import { createInvestigation } from "@/lib/db/repositories/investigations";
import { DEFAULT_GAME_CONFIG } from "@/types/investigation";
import { formatLastConfigSummary, loadLastGameConfig } from "@/lib/utils/lastGameConfig";

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

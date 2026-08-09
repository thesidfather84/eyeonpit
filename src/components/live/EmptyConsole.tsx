"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Eye, Menu } from "lucide-react";
import { NavigationDrawer } from "@/components/navigation/NavigationDrawer";
import { NewInvestigationDrawer } from "@/components/investigation-setup/NewInvestigationDrawer";
import { QuickSetupSheet } from "./QuickSetupSheet";
import { findOrCreatePracticeInvestigation } from "@/lib/onboarding/practiceInvestigationSeed";
import { createInvestigation } from "@/lib/db/repositories/investigations";
import { DEFAULT_GAME_CONFIG } from "@/types/investigation";
import { loadLastGameConfig } from "@/lib/utils/lastGameConfig";

/** Reads ?open=new (from the /investigations/new compatibility redirect) and opens Advanced automatically. Isolated in its own component since useSearchParams requires a Suspense boundary. */
function AutoOpenFromQuery({ onOpen }: { onOpen: () => void }) {
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("open") === "new") onOpen();
  }, [searchParams, onOpen]);
  return null;
}

/**
 * EyeOnPit's front door: the launch screen shown whenever there's no active
 * investigation. Exactly three purpose-based actions, no utility clutter —
 * Quick is the visually dominant default path; Advanced and Practice are
 * equal-weight secondary choices. Starting or resuming an investigation
 * swaps this out for InvestigationConsole in place; there is no page
 * navigation involved.
 */
export function EmptyConsole({ onCreated }: { onCreated: (investigationLocalId: string) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [fullSetupOpen, setFullSetupOpen] = useState(false);
  const [quickLoading, setQuickLoading] = useState(false);
  const [practiceLoading, setPracticeLoading] = useState(false);

  /**
   * One tap, no setup screen: uses the last saved table/game config if one
   * exists (localStorage, see lastGameConfig.ts), otherwise falls back to
   * DEFAULT_GAME_CONFIG — every game-config field the repository accepts is
   * itself optional and already falls back to that same default, so leaving
   * them undefined in the no-saved-config branch is correct, not incomplete.
   */
  async function handleQuick() {
    setQuickLoading(true);
    try {
      const last = loadLastGameConfig();
      const investigation = await createInvestigation({
        casino: "",
        tableNumber: last?.tableNumber ?? "",
        dealerName: "",
        investigationDate: new Date().toISOString().slice(0, 10),
        operatorName: "",
        countingSystem: "Hi-Lo",
        shoeTotalDecks: last?.config.deckCount ?? DEFAULT_GAME_CONFIG.deckCount,
        blackjackFormat: last?.config.format,
        ruleProfile: last?.config.ruleProfile,
        entryDirection: last?.config.entryDirection,
        entryMode: last?.config.entryMode,
        playerSpotCount: last?.config.playerSpotCount,
        practiceMode: last?.config.practiceMode,
        pitArea: last?.config.pitArea,
        investigationLabel: last?.config.investigationLabel,
        status: "active",
      });
      onCreated(investigation.localId);
    } finally {
      setQuickLoading(false);
    }
  }

  /** Finds or creates the one fixed, isDemo:true practice investigation and jumps straight in — same live workflow as production, no confirmation step, never mixed into real case data (isDemo is filtered at the repository layer). */
  async function handlePractice() {
    setPracticeLoading(true);
    try {
      const investigation = await findOrCreatePracticeInvestigation();
      onCreated(investigation.localId);
    } finally {
      setPracticeLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-background">
      <Suspense fallback={null}>
        <AutoOpenFromQuery onOpen={() => setAdvancedOpen(true)} />
      </Suspense>

      <header className="flex flex-none items-center px-3 py-3">
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Menu"
          className="tap-target flex items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-10 px-6 pb-12 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10">
            <Eye className="h-8 w-8 text-accent" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">EyeOnPit</h1>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Casino Surveillance &amp; Investigation
            </p>
          </div>
        </div>

        <div className="flex w-full max-w-xs flex-col gap-3">
          <button
            type="button"
            onClick={handleQuick}
            disabled={quickLoading}
            className="tap-target flex flex-col items-center justify-center gap-0.5 rounded-2xl bg-accent px-6 py-5 text-accent-foreground shadow-lg shadow-accent/25 transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            <span className="text-base font-bold tracking-[0.15em]">
              {quickLoading ? "STARTING…" : "QUICK"}
            </span>
            <span className="text-[11px] font-medium text-accent-foreground/85">
              Start now with saved settings
            </span>
          </button>

          <button
            type="button"
            onClick={() => setAdvancedOpen(true)}
            className="tap-target flex flex-col items-center justify-center gap-0.5 rounded-2xl border border-border bg-surface px-6 py-4 text-foreground transition-colors hover:bg-surface-raised"
          >
            <span className="text-sm font-bold tracking-[0.15em]">ADVANCED</span>
            <span className="text-[11px] text-muted-foreground">Custom table &amp; game setup</span>
          </button>

          <button
            type="button"
            onClick={handlePractice}
            disabled={practiceLoading}
            className="tap-target flex flex-col items-center justify-center gap-0.5 rounded-2xl border border-border bg-surface px-6 py-4 text-foreground transition-colors hover:bg-surface-raised disabled:opacity-60"
          >
            <span className="text-sm font-bold tracking-[0.15em]">
              {practiceLoading ? "LOADING…" : "PRACTICE"}
            </span>
            <span className="text-[11px] text-muted-foreground">Train — kept separate from real cases</span>
          </button>
        </div>
      </div>

      <NavigationDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
      {advancedOpen && (
        <QuickSetupSheet
          onClose={() => setAdvancedOpen(false)}
          onCreated={onCreated}
          onOpenFullSetup={() => {
            setAdvancedOpen(false);
            setFullSetupOpen(true);
          }}
        />
      )}
      {fullSetupOpen && (
        <NewInvestigationDrawer onClose={() => setFullSetupOpen(false)} onCreated={onCreated} />
      )}
    </div>
  );
}

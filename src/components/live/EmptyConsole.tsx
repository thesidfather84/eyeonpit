"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, Headphones, Menu } from "lucide-react";
import { NavigationDrawer } from "@/components/navigation/NavigationDrawer";
import { NewInvestigationDrawer } from "@/components/investigation-setup/NewInvestigationDrawer";
import { QuickSetupSheet } from "./QuickSetupSheet";
import { findOrCreatePracticeInvestigation } from "@/lib/onboarding/practiceInvestigationSeed";
import { createInvestigation, type CreateInvestigationInput } from "@/lib/db/repositories/investigations";
import { DEFAULT_GAME_CONFIG } from "@/types/investigation";
import { loadLastGameConfig } from "@/lib/utils/lastGameConfig";

/**
 * The same "no setup screen" defaults Quick uses — last saved table/game
 * config if one exists, otherwise DEFAULT_GAME_CONFIG. Shared by Quick
 * (Surveillance) and Floor so the two launch paths can never quietly drift
 * apart on what "start now with saved settings" actually means; the only
 * difference between them is which screen the resulting investigation
 * opens into, never how the investigation itself is created.
 */
function buildQuickInvestigationInput(): CreateInvestigationInput {
  const last = loadLastGameConfig();
  return {
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
  };
}

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
 * investigation. Four purpose-based actions, no utility clutter — Quick
 * remains the visually dominant default (Surveillance) path; Floor is an
 * equally discoverable, one-tap hands-free launch, styled distinctly so the
 * two are never confused; Advanced and Practice remain equal-weight
 * secondary choices. Quick/Advanced/Practice swap this out for
 * InvestigationConsole in place (no page navigation); Floor is the one
 * exception — it routes to `/investigations/[id]/floor` directly (the same
 * real route reached from inside Surveillance via LiveMenu's "Floor Mode"
 * entry), since Floor Mode's whole premise is a distinct, mobile/voice-first
 * screen rather than a variant rendered in place on "/".
 */
export function EmptyConsole({ onCreated }: { onCreated: (investigationLocalId: string) => void }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [fullSetupOpen, setFullSetupOpen] = useState(false);
  const [quickLoading, setQuickLoading] = useState(false);
  const [floorLoading, setFloorLoading] = useState(false);
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
      const investigation = await createInvestigation(buildQuickInvestigationInput());
      onCreated(investigation.localId);
    } finally {
      setQuickLoading(false);
    }
  }

  /**
   * One tap into the hands-free Floor workflow: the exact same investigation
   * creation Quick uses (same saved/default game config, same
   * `createInvestigation` call, same CardEvent ledger and count engine —
   * there is no separate Floor data model), just routed straight to
   * `/investigations/[id]/floor` instead of opening in place. Never prompts
   * for anything extra — `createInvestigation`'s fields are all optional
   * with sensible defaults, exactly like Quick, so there is no "minimum
   * missing information" gap to fill here.
   */
  async function handleFloor() {
    setFloorLoading(true);
    try {
      const investigation = await createInvestigation(buildQuickInvestigationInput());
      router.push(`/investigations/${investigation.localId}/floor`);
    } finally {
      setFloorLoading(false);
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
            onClick={handleFloor}
            disabled={floorLoading}
            aria-label="Floor — hands-free pit workflow"
            className="tap-target flex flex-col items-center justify-center gap-0.5 rounded-2xl bg-accent-secondary px-6 py-5 text-accent-secondary-foreground shadow-lg shadow-accent-secondary/25 transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            <span className="flex items-center gap-1.5 text-base font-bold tracking-[0.15em]">
              <Headphones className="h-4 w-4" aria-hidden />
              {floorLoading ? "OPENING…" : "FLOOR"}
            </span>
            <span className="text-[11px] font-medium text-accent-secondary-foreground/85">
              Hands-free pit workflow — voice &amp; one-tap
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

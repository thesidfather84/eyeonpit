"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Eye, Menu } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { NavigationDrawer } from "@/components/navigation/NavigationDrawer";
import { NewInvestigationDrawer } from "@/components/investigation-setup/NewInvestigationDrawer";
import { findOrCreatePracticeInvestigation } from "@/lib/onboarding/practiceInvestigationSeed";

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
  const [practiceLoading, setPracticeLoading] = useState(false);

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
        <Button variant="primary" onClick={() => setSetupOpen(true)}>
          + New Investigation
        </Button>
        <Button variant="secondary" disabled={practiceLoading} onClick={handlePractice}>
          {practiceLoading ? "Loading…" : "▷ Try a Practice Investigation"}
        </Button>
      </div>

      <NavigationDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
      {setupOpen && (
        <NewInvestigationDrawer onClose={() => setSetupOpen(false)} onCreated={onCreated} />
      )}
    </div>
  );
}

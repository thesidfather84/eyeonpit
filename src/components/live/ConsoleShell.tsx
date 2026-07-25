"use client";

import { useState } from "react";
import { useActiveInvestigation } from "@/hooks/useActiveInvestigation";
import { InvestigationConsole } from "./InvestigationConsole";
import { EmptyConsole } from "./EmptyConsole";

/**
 * The app's single entry point. Discovers whatever investigation is
 * currently active/paused on this device (via Dexie) and shows its console
 * directly — no "resume" navigation step. Starting a new investigation
 * swaps straight into its console via local state, never a route change.
 */
export function ConsoleShell() {
  const { investigation, loading } = useActiveInvestigation();
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);

  const activeId = justCreatedId ?? investigation?.localId ?? null;

  if (activeId) {
    return <InvestigationConsole investigationId={activeId} />;
  }

  if (loading) {
    return <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  return <EmptyConsole onCreated={setJustCreatedId} />;
}

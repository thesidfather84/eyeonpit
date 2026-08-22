"use client";

import { Pause, Play } from "lucide-react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { EntryLockButton } from "./EntryLockButton";

/**
 * Lock and Pause — real operational controls, but not frequent enough to
 * compete with Table/Mode in the header (AGENTS.md operational UI rebuild
 * §12). A compact two-column row near the round controls, not the top of
 * the screen. EntryLockButton is reused completely unchanged, including
 * its deliberate hold-to-disable gesture — an accidental tap must not
 * unlock entry.
 */
export function OperationalQuickActions() {
  const { investigation, busy, pause, resume } = useInvestigationContext();
  const isPaused = investigation.status === "paused";
  const isClosed = investigation.status === "closed";

  if (isClosed) return null;

  return (
    <div className="grid flex-none grid-cols-2 gap-1.5 border-t border-border bg-surface p-1.5">
      <EntryLockButton />
      <button
        type="button"
        onClick={isPaused ? resume : pause}
        disabled={busy}
        aria-label={isPaused ? "Resume Investigation" : "Pause Investigation"}
        className="tap-target flex items-center justify-center gap-1 rounded-md border border-border bg-surface-raised px-2 text-[11px] font-medium text-foreground disabled:opacity-40"
      >
        {isPaused ? <Play className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}
        {isPaused ? "Resume" : "Pause"}
      </button>
    </div>
  );
}

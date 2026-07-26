"use client";

import { useState } from "react";
import { Eye, Pause, Play, Settings2 } from "lucide-react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { useElapsedTimer } from "@/hooks/useElapsedTimer";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { formatElapsedTime } from "@/lib/utils/formatters";
import { formatGameConfigSummary } from "@/lib/utils/gameConfig";
import { LiveMenu } from "./LiveMenu";
import { EntryLockButton } from "./EntryLockButton";
import { QuickSetupSheet } from "./QuickSetupSheet";

/** Single compact row (~52px) — everything the operator needs to see at a glance, nothing more. */
export function LiveHeader() {
  const { investigation, currentRound, busy, pause, resume, refresh } = useInvestigationContext();
  const elapsedMs = useElapsedTimer(investigation);
  const isOnline = useOnlineStatus();
  const isPaused = investigation.status === "paused";
  const isClosed = investigation.status === "closed";
  const [quickSetupOpen, setQuickSetupOpen] = useState(false);

  return (
    <div className="flex h-[52px] flex-none items-center gap-2 overflow-x-auto border-b border-border bg-surface px-2">
      <LiveMenu />
      <Eye className="h-4 w-4 shrink-0 text-accent" aria-hidden />
      <span className="hidden shrink-0 text-xs font-bold text-foreground sm:inline">EyeOnPit</span>

      <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
        {investigation.displayId}
      </span>
      <span className="shrink-0 text-[11px] text-muted-foreground">
        T{investigation.tableNumber || "—"} · {formatGameConfigSummary(investigation, currentRound.shoeNumber)} · R
        {currentRound.roundNumber}
      </span>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
        {formatElapsedTime(elapsedMs)}
      </span>
      <span
        className="shrink-0"
        aria-label={isOnline ? "Online" : "Offline — saved locally"}
        title={isOnline ? "Online" : "Offline — saved locally"}
      >
        <span
          className={`inline-block h-2 w-2 rounded-full ${isOnline ? "bg-status-green" : "bg-muted-foreground"}`}
        />
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => setQuickSetupOpen(true)}
          aria-label="Quick Setup"
          title="Quick Setup"
          className="tap-target flex items-center justify-center rounded-md border border-border bg-surface-raised px-2 text-foreground"
        >
          <Settings2 className="h-4 w-4" aria-hidden />
        </button>
        <EntryLockButton />
        {isClosed ? (
          <button
            onClick={() => {
              window.location.href = "/";
            }}
            className="tap-target rounded-md bg-accent px-2 text-[11px] font-medium text-accent-foreground"
          >
            + New
          </button>
        ) : (
          <button
            onClick={isPaused ? resume : pause}
            disabled={busy}
            aria-label={isPaused ? "Resume" : "Pause"}
            className="tap-target flex items-center justify-center rounded-md border border-border bg-surface-raised px-2 text-foreground disabled:opacity-40"
          >
            {isPaused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
          </button>
        )}
      </div>

      {quickSetupOpen && (
        <QuickSetupSheet
          investigation={investigation}
          onClose={() => setQuickSetupOpen(false)}
          onApplied={refresh}
        />
      )}
    </div>
  );
}

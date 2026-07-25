"use client";

import Link from "next/link";
import { Eye, Lock, Menu, Pause, Play } from "lucide-react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { useElapsedTimer } from "@/hooks/useElapsedTimer";
import { formatElapsedTime } from "@/lib/utils/formatters";

export function LiveHeader({ onLock }: { onLock: () => void }) {
  const { investigation, busy, pause, resume } = useInvestigationContext();
  const elapsedMs = useElapsedTimer(investigation);
  const isPaused = investigation.status === "paused";

  return (
    <div className="flex flex-none flex-col border-b border-border bg-surface">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            aria-label="Menu"
            className="tap-target flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </Link>
          <div className="flex items-center gap-1.5">
            <Eye className="h-4 w-4 text-accent" aria-hidden />
            <span className="text-sm font-bold tracking-wide text-foreground">EyeOnPit</span>
          </div>
        </div>
        <button
          onClick={onLock}
          aria-label="Quick lock"
          className="tap-target flex items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <Lock className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 px-3 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-xs font-medium text-muted-foreground">
            {investigation.displayId}
          </span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide ${
              isPaused ? "bg-surface-raised text-muted-foreground" : "bg-status-green/15 text-status-green"
            }`}
          >
            {isPaused ? "PAUSED" : "LIVE"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {formatElapsedTime(elapsedMs)}
          </span>
          <button
            onClick={isPaused ? resume : pause}
            disabled={busy}
            aria-label={isPaused ? "Resume" : "Pause"}
            className="tap-target flex items-center justify-center rounded-md border border-border bg-surface-raised px-2 text-foreground disabled:opacity-40"
          >
            {isPaused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </div>
    </div>
  );
}

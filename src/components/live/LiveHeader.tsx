"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, Headphones, Home, Pause, Play, Settings2 } from "lucide-react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { useElapsedTimer } from "@/hooks/useElapsedTimer";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { formatElapsedTime } from "@/lib/utils/formatters";
import { formatGameConfigSummary, formatLiveStatusLine } from "@/lib/utils/gameConfig";
import { LiveMenu } from "./LiveMenu";
import { EntryLockButton } from "./EntryLockButton";
import { QuickSetupSheet } from "./QuickSetupSheet";
import { CountSummaryPanel } from "./CountSummaryPanel";

/**
 * One unified status bar — identity (menu/brand/id/timer), the live count
 * strip, and the top-level controls (online, Quick Setup, Lock, Pause) all
 * in a single header block. Sized by content (padding, not a fixed height),
 * so it stays exactly as short as its busiest line needs and never grows
 * beyond that.
 *
 * Three flex children, in DOM order: identity (flexes/truncates, never
 * wraps internally), the count strip (`order-last` + `w-full` by default —
 * with nothing else able to share a 100%-wide line, this reliably wraps to
 * its own second line on a narrow phone), and the controls cluster
 * (`shrink-0`, always reachable). The wrap decision keys off `short:`, not
 * a viewport-width breakpoint — the root layout caps the whole app at
 * `max-w-md` in portrait and only lifts that under `short:` (see
 * app/layout.tsx), so `short:` is the one signal that real extra width is
 * actually available; a wide-but-tall desktop dev window is still a narrow
 * 448px column and needs the same two-line treatment as an iPhone. Once
 * `short:` is active the count strip's order/width reset to natural, so it
 * sits inline between identity and controls on one line instead —
 * "landscape/desktop takes the full width" falls out of that. Beyond the
 * wrap decision, `short:` also tightens padding/gaps/font size for the
 * genuinely-scarce-height case.
 */
export function LiveHeader() {
  const { investigation, currentRound, busy, pause, resume, refresh } = useInvestigationContext();
  const elapsedMs = useElapsedTimer(investigation);
  const isOnline = useOnlineStatus();
  const isPaused = investigation.status === "paused";
  const isClosed = investigation.status === "closed";
  const [quickSetupOpen, setQuickSetupOpen] = useState(false);

  return (
    <div className="flex flex-none flex-wrap items-center gap-x-1.5 gap-y-1 border-b border-border bg-surface px-2 py-1.5 short:!gap-x-1 short:!gap-y-0 short:!py-1">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <LiveMenu />
        <Eye className="h-4 w-4 shrink-0 text-accent" aria-hidden />
        <span className="hidden shrink-0 text-xs font-bold text-foreground sm:inline">EyeOnPit</span>
        <span className="shrink-0 text-[11px] font-bold text-foreground">SURVEILLANCE</span>
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
          {investigation.displayId}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {formatElapsedTime(elapsedMs)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {formatLiveStatusLine(investigation)}
          <span className="hidden sm:inline">
            {" "}
            · {formatGameConfigSummary(investigation, currentRound.shoeNumber)} · R{currentRound.roundNumber}
          </span>
        </span>
      </div>

      <div className="order-last w-full border-t border-border/60 pt-1 short:order-none short:w-auto short:border-t-0 short:pt-0">
        <CountSummaryPanel />
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        {!isClosed && (
          <Link
            href={`/investigations/${investigation.localId}/floor`}
            aria-label="Switch to Floor Mode"
            title="Floor Mode"
            className="tap-target flex items-center gap-1 rounded-md border border-border bg-surface-raised px-2 text-[11px] font-medium text-foreground"
          >
            <Headphones className="h-3.5 w-3.5" aria-hidden /> Floor
          </Link>
        )}
        {/* Home (AGENTS.md 1.14b UX correction round §1) — the one
            consistent, always-obvious escape from either shell back to the
            main entry point. A plain Link to /app, not a new navigation
            system: ConsoleShell's existing fresh/recoverable/none lifecycle
            (see investigationLifecycle.ts) decides what happens next — an
            active investigation is picked back up exactly as it was, never
            silently destroyed. */}
        <Link
          href="/app"
          aria-label="Home"
          title="Home"
          className="tap-target flex items-center gap-1 rounded-md border border-border bg-surface-raised px-2 text-[11px] font-medium text-foreground"
        >
          <Home className="h-3.5 w-3.5" aria-hidden /> Home
        </Link>
        <span
          className="shrink-0"
          aria-label={isOnline ? "Online" : "Offline — saved locally"}
          title={isOnline ? "Online" : "Offline — saved locally"}
        >
          <span
            className={`inline-block h-2 w-2 rounded-full ${isOnline ? "bg-status-green" : "bg-muted-foreground"}`}
          />
        </span>
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
              window.location.href = "/app";
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

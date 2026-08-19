"use client";

import { useState } from "react";
import { Eye, History as HistoryIcon, Menu, PlayCircle } from "lucide-react";
import Link from "next/link";
import { NavigationDrawer } from "@/components/navigation/NavigationDrawer";
import type { Investigation } from "@/types/investigation";

/**
 * PRIORITY 1.9-3/4/5/16 — shown instead of silently entering an
 * active/paused investigation whenever that investigation is NOT
 * confidently "this session" (see `lib/investigationLifecycle.ts`'s
 * freshness rule) — a stale investigation, or more than one active/paused
 * investigation existing at once. "If state is ambiguous: offer RESUME or
 * START NEW. Do not silently choose stale data."
 *
 * Deliberately as simple as EmptyConsole itself — two real choices, no
 * dashboard, no cards/widgets. "Recent/history access should be
 * secondary" (Priority 16's own words) — History is one small link, not a
 * competing action.
 */
export function ResumeOrNewScreen({
  investigation,
  otherCandidateCount,
  onResume,
  onStartNew,
}: {
  investigation: Investigation;
  otherCandidateCount: number;
  onResume: () => void;
  onStartNew: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const lastUpdated = new Date(investigation.updatedAt);
  const lastUpdatedText = Number.isNaN(lastUpdated.getTime()) ? "" : lastUpdated.toLocaleString();

  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="flex flex-none items-center px-3 py-3">
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Menu"
          className="tap-target flex items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 pb-12 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10">
            <Eye className="h-8 w-8 text-accent" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">EyeOnPit</h1>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Unfinished Investigation Found
            </p>
          </div>
        </div>

        <div className="flex w-full max-w-xs flex-col gap-3">
          <button
            type="button"
            onClick={onResume}
            className="tap-target flex flex-col items-center justify-center gap-1 rounded-2xl bg-accent px-6 py-5 text-accent-foreground shadow-lg shadow-accent/25 transition-transform active:scale-[0.98]"
          >
            <span className="flex items-center gap-1.5 text-base font-bold tracking-[0.1em]">
              <PlayCircle className="h-4 w-4" aria-hidden />
              RESUME INVESTIGATION
            </span>
            <span className="text-sm font-semibold text-accent-foreground/90">{investigation.displayId}</span>
            {lastUpdatedText && (
              <span className="text-[11px] font-medium text-accent-foreground/75">Last updated {lastUpdatedText}</span>
            )}
            {otherCandidateCount > 0 && (
              <span className="text-[10px] font-medium text-accent-foreground/70">
                +{otherCandidateCount} other unfinished investigation{otherCandidateCount > 1 ? "s" : ""} — see History
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onStartNew}
            className="tap-target flex flex-col items-center justify-center gap-0.5 rounded-2xl border border-border bg-surface px-6 py-4 text-foreground transition-colors hover:bg-surface-raised"
          >
            <span className="text-sm font-bold tracking-[0.15em]">START NEW INVESTIGATION</span>
            <span className="text-[11px] text-muted-foreground">{investigation.displayId} stays saved in History either way</span>
          </button>

          <Link
            href="/investigations"
            className="tap-target flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <HistoryIcon className="h-3.5 w-3.5" aria-hidden />
            View History
          </Link>
        </div>
      </div>

      <NavigationDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}

"use client";

import { useState } from "react";
import { Eye, Headphones } from "lucide-react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { QuickSetupSheet } from "./QuickSetupSheet";

/**
 * The ONE operational header, shared by Surveillance and Floor (AGENTS.md
 * operational UI rebuild §3/§5). Premium real estate — mode, table, live
 * status, nothing else. Every other control that used to compete for this
 * row (Home, Settings, mode-switch, hamburger, Lock, Pause, displayId,
 * elapsed timer) has a real home elsewhere now: Home/mode-switch/Settings
 * in BottomNavigation, Lock/Pause in the operational-actions row above the
 * keypad, displayId in the tertiary InvestigationIdFooter. Nothing here
 * duplicates them.
 *
 * The table identity IS the trigger for table/game setup (format, shoe
 * size, rules, dealer) — tapping "TABLE 111" opens the existing
 * QuickSetupSheet unchanged, rather than adding a second gear icon to this
 * already-minimal row. This is the same control, just tied to the subject
 * it edits instead of floating as its own header icon.
 */
export function OperationalHeader({ mode }: { mode: "surveillance" | "floor" }) {
  const { investigation, refresh } = useInvestigationContext();
  const [quickSetupOpen, setQuickSetupOpen] = useState(false);
  const isLive = investigation.status === "active";
  const isClosed = investigation.status === "closed";
  const Icon = mode === "floor" ? Headphones : Eye;
  const label = mode === "floor" ? "FLOOR" : "SURVEILLANCE";

  return (
    <div className="flex flex-none items-center gap-2 border-b border-border bg-surface px-3 py-2.5">
      <Icon className="h-4 w-4 shrink-0 text-accent" aria-hidden />
      <span className="shrink-0 text-sm font-extrabold tracking-wide text-foreground">{label}</span>
      <span className="h-4 w-px shrink-0 bg-border" aria-hidden />
      <button
        type="button"
        onClick={() => setQuickSetupOpen(true)}
        disabled={isClosed}
        aria-label={`Table ${investigation.tableNumber || "unset"} — table and game setup`}
        className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-foreground disabled:opacity-70"
      >
        TABLE {investigation.tableNumber || "—"}
      </button>
      <span
        className="flex shrink-0 items-center gap-1 text-[11px] font-bold"
        aria-label={isLive ? "Live" : investigation.status === "paused" ? "Paused" : investigation.status}
      >
        <span
          className={`inline-block h-2 w-2 rounded-full ${isLive ? "bg-status-green" : "bg-pending"}`}
          aria-hidden
        />
        <span className={isLive ? "text-status-green" : "text-pending"}>
          {isLive ? "LIVE" : investigation.status.toUpperCase()}
        </span>
      </span>

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

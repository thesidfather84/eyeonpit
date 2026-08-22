"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/**
 * The investigation/report ID — important for the record, but tertiary
 * (AGENTS.md operational UI rebuild §14/§19): a thin strip below the
 * operational actions, above BottomNavigation, deliberately never sharing
 * a row with Home/Settings/other buttons so it can never be crowded out
 * or clipped by them.
 */
export function InvestigationIdFooter() {
  const { investigation } = useInvestigationContext();
  const isOnline = useOnlineStatus();

  return (
    <div
      data-testid="investigation-id-footer"
      className="flex flex-none items-center justify-center gap-1.5 border-t border-border/60 bg-surface px-2 py-1"
    >
      <span className="truncate text-[10px] tracking-wide text-muted-foreground">
        INVESTIGATION: {investigation.displayId}
      </span>
      <span
        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${isOnline ? "bg-status-green" : "bg-muted-foreground"}`}
        aria-label={isOnline ? "Online" : "Offline — saved locally"}
        title={isOnline ? "Online" : "Offline — saved locally"}
      />
    </div>
  );
}

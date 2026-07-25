"use client";

import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/**
 * Slim, always-visible connectivity readout for the top bar — plan.md §8/§12:
 * "status is always visible, never a separate screen." A future phase adds a
 * "saved" pulse alongside this once autosave (Phase 3) exists.
 */
export function StatusIndicator() {
  const isOnline = useOnlineStatus();

  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${isOnline ? "bg-accent" : "bg-muted-foreground"}`}
      />
      {isOnline ? "online" : "offline"}
    </span>
  );
}

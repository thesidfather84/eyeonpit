"use client";

import { useEffect, useState } from "react";
import type { Investigation } from "@/types/investigation";

/**
 * Live session elapsed time, excluding paused time. Uses `pausedAt`
 * (set the instant status flips to "paused") so a page reload mid-pause
 * still shows the correct frozen value instead of drifting — plan.md §10
 * decision 1.
 */
export function useElapsedTimer(investigation: Investigation | null): number {
  const [now, setNow] = useState(() => Date.now());

  const isActive = investigation?.status === "active";

  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isActive]);

  if (!investigation) return 0;

  const createdAtMs = new Date(investigation.createdAt).getTime();

  if (investigation.status === "paused" && investigation.pausedAt) {
    const pausedAtMs = new Date(investigation.pausedAt).getTime();
    return Math.max(0, pausedAtMs - createdAtMs - investigation.pausedDurationMs);
  }

  return Math.max(0, now - createdAtMs - investigation.pausedDurationMs);
}

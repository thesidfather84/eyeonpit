"use client";

import { useEffect, useState } from "react";
import { listInvestigations } from "@/lib/db/repositories/investigations";
import type { Investigation } from "@/types/investigation";

/**
 * The investigation the operator is currently mid-way through (active or
 * paused), if any. Drives the bottom nav's Live Entry/Case tabs and Home's
 * "Resume" card. Deliberately a plain fetch-on-mount, not a live query —
 * Phase 1 just needs this to exist so navigation is real; Phase 2+ screens
 * that mutate investigations can re-check it themselves after writes.
 */
export function useActiveInvestigation(): {
  investigation: Investigation | null;
  loading: boolean;
} {
  const [investigation, setInvestigation] = useState<Investigation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    listInvestigations()
      .then((all) => {
        if (cancelled) return;
        const current =
          all.find((inv) => inv.status === "active" || inv.status === "paused") ??
          null;
        setInvestigation(current);
      })
      .catch(() => {
        if (!cancelled) setInvestigation(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { investigation, loading };
}

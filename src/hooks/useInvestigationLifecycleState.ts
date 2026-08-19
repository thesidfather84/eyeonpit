"use client";

import { useEffect, useState } from "react";
import { listInvestigations } from "@/lib/db/repositories/investigations";
import { resolveActiveInvestigationState, type ActiveInvestigationResolution } from "@/lib/investigationLifecycle";
import { diagnostics } from "@/lib/diagnostics/logger";

/**
 * PRIORITY 1.9-2/4/5 — drives ConsoleShell's launch decision. Fetches
 * every active/paused investigation (never closed ones — see
 * `listInvestigations`'s own status filtering, unchanged) and classifies
 * them via the pure `resolveActiveInvestigationState` — see
 * `lib/investigationLifecycle.ts`'s own doc comment for the full rule.
 *
 * Deliberately separate from `useActiveInvestigation` (unchanged, still
 * used by `NavigationDrawer` for its plain "link to whatever's active"
 * menu item, which has no reason to apply a freshness judgment) — this
 * hook is the one place that decision is actually made before deciding
 * what to show the operator at launch.
 */
export function useInvestigationLifecycleState(): {
  resolution: ActiveInvestigationResolution | null;
  loading: boolean;
} {
  const [resolution, setResolution] = useState<ActiveInvestigationResolution | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    listInvestigations()
      .then((all) => {
        if (cancelled) return;
        const candidates = all.filter((inv) => inv.status === "active" || inv.status === "paused");
        const resolved = resolveActiveInvestigationState(candidates);
        diagnostics.info("startup-resolution", "useInvestigationLifecycleState resolved on mount", {
          totalInvestigations: all.length,
          activeOrPausedCandidates: candidates.map((c) => ({ localId: c.localId, displayId: c.displayId, status: c.status, updatedAt: c.updatedAt })),
          resolution: resolved,
        });
        setResolution(resolved);
      })
      .catch(() => {
        if (!cancelled) setResolution({ kind: "none" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { resolution, loading };
}

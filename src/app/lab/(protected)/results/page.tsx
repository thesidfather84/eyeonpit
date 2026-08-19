"use client";

import { useEffect, useState } from "react";
import { listAllSimulationResults } from "@/lib/db/repositories/goldStandard";
import type { SimulationResult } from "@/lib/gold-standard/simulation/result";
import { isResultTrustworthy } from "@/lib/gold-standard/simulation/result";

/** PRIORITY B8 — real, persisted results only; never a fabricated metric. Every result shown here was either produced by lib/gold-standard/simulation/engine.ts (runSimulation) or not shown at all. */
export default function ResultsPage() {
  const [results, setResults] = useState<SimulationResult[] | null>(null);

  useEffect(() => {
    listAllSimulationResults().then(setResults);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-bold text-foreground">Results / Comparisons</h1>
      {results == null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {results?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No simulation results yet. Results are produced by running the deterministic simulation engine
          (lib/gold-standard/simulation/engine.ts) against a saved scenario.
        </p>
      )}
      <div className="flex flex-col gap-2">
        {results?.map((r) => (
          <div key={r.id} className="rounded-xl border border-border bg-surface p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">
                EV/hand: {r.expectedValuePerHand >= 0 ? "+" : ""}
                {r.expectedValuePerHand.toFixed(4)}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isResultTrustworthy(r) ? "bg-status-green/10 text-status-green" : "bg-destructive/10 text-destructive"}`}
              >
                {isResultTrustworthy(r) ? "Validated" : "Validation FAILED"}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {r.handsSimulated.toLocaleString()} hands · seed {r.seed} · variance {r.variance.toFixed(3)} · {r.runtimeMs}ms
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

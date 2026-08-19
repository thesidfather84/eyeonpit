"use client";

import { useEffect, useState } from "react";
import { listSimulationScenarios } from "@/lib/db/repositories/goldStandard";
import type { SimulationScenario } from "@/lib/gold-standard/simulation/scenario";

/** PRIORITY B6 — real, persisted scenarios only. Scenario CREATION (a form covering GameDefinition/CountMethod/BettingStrategy/PlayingStrategy selection, seed, hand count) is a further UI-building step beyond this foundation pass — see docs/EYEONPIT_1_6_ARCHITECTURE.md's "Deferred" section; the data model, validation, and engine that would consume a scenario built here are already complete and tested (lib/gold-standard/simulation/). */
export default function ScenariosPage() {
  const [scenarios, setScenarios] = useState<SimulationScenario[] | null>(null);

  useEffect(() => {
    listSimulationScenarios().then(setScenarios);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-bold text-foreground">Simulation Scenarios</h1>
      <p className="text-xs text-muted-foreground">
        Scenario creation UI is not yet built in this foundation pass — the data model, validation, and simulation
        engine that consume a scenario are complete and tested. See docs/EYEONPIT_1_6_ARCHITECTURE.md.
      </p>
      {scenarios == null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {scenarios?.length === 0 && <p className="text-sm text-muted-foreground">No scenarios yet.</p>}
      <div className="flex flex-col gap-2">
        {scenarios?.map((s) => (
          <div key={s.id} className="rounded-xl border border-border bg-surface p-3">
            <p className="text-sm font-semibold text-foreground">{s.name}</p>
            <p className="text-xs text-muted-foreground">
              {s.handsToSimulate.toLocaleString()} hands · seed {s.seed} · v{s.version}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

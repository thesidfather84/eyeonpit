"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Beaker,
  BookOpen,
  FlaskConical,
  LineChart,
  ListChecks,
  PlusCircle,
  ShieldAlert,
  Users,
  Wrench,
} from "lucide-react";
import { listCountMethods, listSimulationScenarios, listAllSimulationResults, listResearchEntries } from "@/lib/db/repositories/goldStandard";

/**
 * PRIORITY B9/1.7-10 — the /lab home shell. Real counts only (Priority
 * B9's own "no fake data" requirement) — every number here comes from an
 * actual Dexie query, never a hardcoded placeholder. Counter Detection,
 * Player Behavior Analysis, and Validation Benchmarks are real, tested
 * pages (see docs/EYEONPIT_1_7_COUNTER_DETECTION.md) — but every one of
 * them surfaces the same EXPERIMENTAL / NOT VALIDATED status prominently,
 * since the Confidence Engine behind them hasn't been proven against
 * real-world data yet.
 */

interface SectionCard {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  count?: number;
  disabled?: boolean;
  disabledReason?: string;
}

export default function LabHomePage() {
  const [counts, setCounts] = useState<{ methods: number; scenarios: number; results: number; research: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [methods, scenarios, results, research] = await Promise.all([
        listCountMethods(),
        listSimulationScenarios(),
        listAllSimulationResults(),
        listResearchEntries(),
      ]);
      if (!cancelled) {
        setCounts({ methods: methods.length, scenarios: scenarios.length, results: results.length, research: research.length });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sections: SectionCard[] = [
    { href: "/lab/methods", label: "Method Library", icon: BookOpen, description: "Hi-Lo, KO, Zen, Omega II, and any custom count methods.", count: counts?.methods },
    { href: "/lab/methods/new", label: "Add Method", icon: PlusCircle, description: "Define and validate a new count method." },
    { href: "/lab/scenarios", label: "Simulation Scenarios", icon: ListChecks, description: "Seeded, versioned simulation configurations.", count: counts?.scenarios },
    { href: "/lab/results", label: "Results / Comparisons", icon: LineChart, description: "EV, variance, and risk metrics from completed simulations.", count: counts?.results },
    { href: "/lab/research", label: "Research Library", icon: Beaker, description: "Claims and sources under evaluation, with verification status.", count: counts?.research },
    {
      href: "/lab/counter-detection",
      label: "Counter Detection",
      icon: ShieldAlert,
      description: "EXPERIMENTAL Confidence Engine — real, tested, not yet real-world validated. See docs/EYEONPIT_1_7_COUNTER_DETECTION.md.",
    },
    {
      href: "/lab/player-behavior",
      label: "Player Behavior Analysis",
      icon: Users,
      description: "Run the real Confidence Engine against a past investigation's actual recorded data.",
    },
    {
      href: "/lab/validation-benchmarks",
      label: "Validation Benchmarks",
      icon: LineChart,
      description: "Measured sensitivity/specificity/false-positive rate against deterministic synthetic archetypes.",
    },
    { href: "/lab/admin", label: "Admin / Method Validation", icon: Wrench, description: "Review verification status and source citations." },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-6 w-6 text-accent" aria-hidden />
        <h1 className="text-lg font-bold text-foreground">Blackjack Lab</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Research infrastructure for game rules, count methods, and simulation — separate from the operational
        investigation app. Nothing here affects a live investigation&apos;s count or ledger.
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {sections.map((section) => {
          const Icon = section.icon;
          const content = (
            <div
              className={`flex flex-col gap-1 rounded-xl border border-border bg-surface p-3 ${section.disabled ? "opacity-60" : "hover:border-accent"}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-accent" aria-hidden />
                  <span className="text-sm font-semibold text-foreground">{section.label}</span>
                </div>
                {section.count != null && (
                  <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {section.count}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{section.description}</p>
              {section.disabled && section.disabledReason && (
                <p className="text-[10px] font-medium text-pending">{section.disabledReason}</p>
              )}
            </div>
          );
          return section.disabled ? (
            <div key={section.href} aria-disabled="true">
              {content}
            </div>
          ) : (
            <Link key={section.href} href={section.href}>
              {content}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

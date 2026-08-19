"use client";

import { useState } from "react";
import { FlaskConical, PlayCircle } from "lucide-react";
import { runBenchmark, evaluate50HandDefensibility, type BenchmarkSummary } from "@/lib/player-analytics/validation/benchmarkHarness";

/**
 * PRIORITY 1.7-10 — Validation Benchmarks. Every number on this page comes
 * from a REAL, freshly-run benchmark (lib/player-analytics/validation/
 * benchmarkHarness.ts) against the deterministic synthetic archetypes —
 * "No fake charts or placeholder numbers" (this priority's own rule). This
 * is internal validation tooling, not a claim about real player detection
 * accuracy — see docs/EYEONPIT_1_7_COUNTER_DETECTION.md before citing any
 * number from this page anywhere product-facing.
 */
export default function ValidationBenchmarksPage() {
  const [summary, setSummary] = useState<BenchmarkSummary | null>(null);
  const [running, setRunning] = useState(false);

  function run() {
    setRunning(true);
    // Deterministic and fast (a few hundred ms) — see benchmarkHarness.test.ts
    // for the exact numbers this same call produces.
    setTimeout(() => {
      setSummary(runBenchmark({ seeds: [1, 2, 3, 4, 5] }));
      setRunning(false);
    }, 0);
  }

  const verdict = summary ? evaluate50HandDefensibility(summary) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-5 w-5 text-accent" aria-hidden />
        <h1 className="text-lg font-bold text-foreground">Validation Benchmarks</h1>
      </div>
      <p className="rounded-md border border-pending/40 bg-pending/10 p-2 text-xs font-medium text-pending">
        EXPERIMENTAL — NOT VALIDATED against real-world data. This benchmark measures the Confidence Engine against
        deterministic, labeled SYNTHETIC player archetypes only — evidence about this engine&apos;s internal logic, not
        a claim about real casino players. See docs/EYEONPIT_1_7_COUNTER_DETECTION.md.
      </p>

      <button
        type="button"
        onClick={run}
        disabled={running}
        className="tap-target flex w-fit items-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground disabled:opacity-60"
      >
        <PlayCircle className="h-4 w-4" aria-hidden /> {running ? "Running…" : summary ? "Re-run Benchmark" : "Run Benchmark"}
      </button>

      {summary && verdict && (
        <>
          <section className="rounded-xl border border-border bg-surface p-3">
            <h2 className="mb-2 text-sm font-bold text-foreground">50-Hand Defensibility Verdict</h2>
            <p className="text-sm text-foreground">
              <span className="font-semibold">{verdict.recommendation.replace(/-/g, " ")}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{verdict.reasoning}</p>
          </section>

          <section className="rounded-xl border border-border bg-surface p-3">
            <h2 className="mb-2 text-sm font-bold text-foreground">Hands-to-HIGH</h2>
            <p className="text-sm text-foreground">
              Average: {summary.averageHandsToHigh ?? "—"} hands · Median: {summary.medianHandsToHigh ?? "—"} hands · Never reached:{" "}
              {summary.neverReachedHighCount} counter run(s)
            </p>
          </section>

          <section className="overflow-x-auto rounded-xl border border-border bg-surface p-3">
            <h2 className="mb-2 text-sm font-bold text-foreground">Metrics by Hand Checkpoint</h2>
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="pr-3 py-1">Hands</th>
                  <th className="pr-3 py-1">TP</th>
                  <th className="pr-3 py-1">FP</th>
                  <th className="pr-3 py-1">TN</th>
                  <th className="pr-3 py-1">FN</th>
                  <th className="pr-3 py-1">Sensitivity</th>
                  <th className="pr-3 py-1">Specificity</th>
                  <th className="pr-3 py-1">FP Rate</th>
                  <th className="pr-3 py-1">Precision</th>
                </tr>
              </thead>
              <tbody>
                {summary.handCheckpoints.map((cp) => {
                  const m = summary.metricsByCheckpoint[cp];
                  const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(0)}%`);
                  return (
                    <tr key={cp} className="border-t border-border text-foreground">
                      <td className="pr-3 py-1 font-semibold">{cp}</td>
                      <td className="pr-3 py-1">{m.truePositives}</td>
                      <td className="pr-3 py-1">{m.falsePositives}</td>
                      <td className="pr-3 py-1">{m.trueNegatives}</td>
                      <td className="pr-3 py-1">{m.falseNegatives}</td>
                      <td className="pr-3 py-1">{pct(m.sensitivity)}</td>
                      <td className="pr-3 py-1">{pct(m.specificity)}</td>
                      <td className="pr-3 py-1">{pct(m.falsePositiveRate)}</td>
                      <td className="pr-3 py-1">{pct(m.precision)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="rounded-xl border border-border bg-surface p-3">
            <h2 className="mb-2 text-sm font-bold text-foreground">Worst-Case False-Positive Patterns</h2>
            {summary.worstCaseFalsePositivePatterns.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                None — no adversarial non-counter archetype (progressive/martingale/high-roller/random-insurance/etc.)
                was ever classified HIGH or VERY_HIGH in this run.
              </p>
            ) : (
              <ul className="flex flex-col gap-0.5 text-xs text-destructive">
                {summary.worstCaseFalsePositivePatterns.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

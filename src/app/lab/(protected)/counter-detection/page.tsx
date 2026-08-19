import Link from "next/link";
import { LineChart, ShieldAlert, Users } from "lucide-react";

/**
 * PRIORITY 1.7-6/10 — Counter Detection overview. The Confidence Engine
 * itself (lib/player-analytics/confidenceEngine.ts) IS implemented and
 * tested — see the linked pages for its real, live output — but it is
 * EXPERIMENTAL / NOT VALIDATED against real-world data, and no automatic
 * classification is ever surfaced inside a live investigation or a report
 * without a deliberate analyst action. See
 * docs/EYEONPIT_1_7_COUNTER_DETECTION.md for the full architecture,
 * signal list, and required validation metrics.
 */
export default function CounterDetectionPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-accent" aria-hidden />
        <h1 className="text-lg font-bold text-foreground">Counter Detection</h1>
      </div>
      <p className="rounded-md border border-pending/40 bg-pending/10 p-2 text-xs font-medium text-pending">
        EXPERIMENTAL — NOT VALIDATED. The Confidence Engine below is real, tested code — but its thresholds are an
        initial design, not yet proven against real-world player data. Never presented as an accusation or
        conclusion; human judgment is always final. See docs/EYEONPIT_1_7_COUNTER_DETECTION.md.
      </p>
      <p className="text-sm text-muted-foreground">
        Classification never happens automatically inside a live investigation or a Final Report — it requires a
        deliberate analyst action here in the Lab, and any report section built from it is explicitly labeled
        EXPERIMENTAL (see the Report Preview&apos;s own Counter Analysis section, when attached).
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Link href="/lab/player-behavior" className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-3 hover:border-accent">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-accent" aria-hidden />
            <span className="text-sm font-semibold text-foreground">Player Behavior Analysis</span>
          </div>
          <p className="text-xs text-muted-foreground">Run the real Confidence Engine against a past investigation&apos;s actual recorded data.</p>
        </Link>
        <Link href="/lab/validation-benchmarks" className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-3 hover:border-accent">
          <div className="flex items-center gap-2">
            <LineChart className="h-4 w-4 text-accent" aria-hidden />
            <span className="text-sm font-semibold text-foreground">Validation Benchmarks</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Measured sensitivity/specificity/false-positive rate against deterministic synthetic archetypes, including
            the 50-hand defensibility question.
          </p>
        </Link>
      </div>
    </div>
  );
}

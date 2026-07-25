import { computeShoeStats } from "@/lib/analysis/shoeStats";
import { computeApLikelihood } from "@/lib/analysis/apLikelihood";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { COUNTING_SYSTEMS } from "@/lib/counting-systems/countingSystems";

const LEVEL_LABEL = { low: "LOW", moderate: "MODERATE", elevated: "ELEVATED" } as const;
const TREND_GLYPH = { up: "▲", down: "▼", flat: "–" } as const;

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/**
 * Every supported counting system, always shown together — the operator
 * never picks one, and one card entry updates all of them at once. See
 * lib/analysis/shoeStats.ts.
 */
export function CountSummaryPanel() {
  const { investigation, currentRound } = useInvestigationContext();
  const stats = computeShoeStats(investigation, currentRound.shoeNumber);
  const ap = computeApLikelihood(investigation, currentRound.shoeNumber);
  const apColorClass = ap.level === "low" ? "text-status-green" : "text-status-orange";

  return (
    <div className="border-b border-border bg-surface p-3">
      <div className="grid grid-cols-4 gap-1.5">
        {COUNTING_SYSTEMS.map((system) => {
          const count = stats.counts[system];
          return (
            <div key={system} className="rounded-lg border border-border bg-surface-raised p-1.5 text-center">
              <p className="truncate text-[9px] uppercase tracking-wide text-muted-foreground">
                {system}
              </p>
              <p className="text-base font-bold text-foreground">
                {formatSigned(count.runningCount)}
                <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">
                  {TREND_GLYPH[count.trend]}
                </span>
              </p>
              <p className="text-[10px] text-accent">TC {formatSigned(count.trueCount)}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div>
          <span className="text-xs font-medium text-foreground">Round {currentRound.roundNumber}</span>
          <span className="ml-2 text-xs text-muted-foreground">Shoe {currentRound.shoeNumber}</span>
        </div>
        <div className="text-right">
          <span className={`text-xs font-bold ${apColorClass}`}>AP {LEVEL_LABEL[ap.level]}</span>
          <p className="text-[9px] leading-tight text-muted-foreground">
            Reference only — not a conclusion.
          </p>
        </div>
      </div>
    </div>
  );
}

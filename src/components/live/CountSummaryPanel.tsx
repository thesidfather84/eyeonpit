import { computeShoeStats } from "@/lib/analysis/shoeStats";
import { computeApLikelihood } from "@/lib/analysis/apLikelihood";
import { useInvestigationContext } from "@/contexts/InvestigationContext";

const LEVEL_LABEL = { low: "LOW", moderate: "MODERATE", elevated: "ELEVATED" } as const;

export function CountSummaryPanel() {
  const { investigation, currentRound } = useInvestigationContext();
  const stats = computeShoeStats(investigation, currentRound.shoeNumber, investigation.countingSystem);
  const ap = computeApLikelihood(investigation, currentRound.shoeNumber);

  const apColorClass = ap.level === "low" ? "text-status-green" : "text-status-orange";

  return (
    <div className="grid grid-cols-2 gap-2 border-b border-border bg-surface p-3 sm:grid-cols-4">
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Running Count</p>
        <p className="text-lg font-bold text-foreground">
          {stats.runningCount > 0 ? `+${stats.runningCount}` : stats.runningCount}
        </p>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">True Count</p>
        <p className="text-lg font-bold text-accent">
          {stats.trueCount > 0 ? `+${stats.trueCount}` : stats.trueCount}
        </p>
        <p className="text-[10px] text-muted-foreground">{investigation.countingSystem}</p>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Round</p>
        <p className="text-lg font-bold text-foreground">{currentRound.roundNumber}</p>
        <p className="text-[10px] text-muted-foreground">Shoe {currentRound.shoeNumber}</p>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">AP Likelihood</p>
        <p className={`text-lg font-bold ${apColorClass}`}>{LEVEL_LABEL[ap.level]}</p>
        <p className="text-[10px] leading-tight text-muted-foreground">
          Reference only — not a conclusion.
        </p>
      </div>
    </div>
  );
}

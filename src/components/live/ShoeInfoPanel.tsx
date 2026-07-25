import { computeShoeStats } from "@/lib/analysis/shoeStats";
import { useInvestigationContext } from "@/contexts/InvestigationContext";

/** Purely informational — the New Shoe action itself lives in RoundControlsRow, alongside Undo/Redo/Save/Next/End Shoe. */
export function ShoeInfoPanel() {
  const { investigation, currentRound } = useInvestigationContext();
  const stats = computeShoeStats(investigation, currentRound.shoeNumber, investigation.countingSystem);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
      <span>
        Decks remaining <b className="text-foreground">{stats.decksRemaining.toFixed(1)}</b>
      </span>
      <span>
        Cards seen <b className="text-foreground">{stats.cardsSeen}</b>
      </span>
      <span>
        System <b className="text-foreground">{investigation.countingSystem}</b>
      </span>
      <span>
        Penetration <b className="text-foreground">{stats.penetrationPct.toFixed(0)}%</b>
      </span>
    </div>
  );
}

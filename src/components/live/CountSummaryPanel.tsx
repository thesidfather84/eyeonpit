import { computeShoeStats } from "@/lib/analysis/shoeStats";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { COUNTING_SYSTEMS } from "@/lib/counting-systems/countingSystems";

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

const ABBR: Record<string, string> = { "Hi-Lo": "HI-LO", KO: "KO", Zen: "ZEN", "Omega II": "OMEGA" };

/** One compact strip (~40px) — every system updates from the same card entries; the primary system (investigation.countingSystem) is emphasized, others shown as quick comparison values. */
export function CountSummaryPanel() {
  const { investigation, currentRound } = useInvestigationContext();
  const stats = computeShoeStats(investigation, currentRound.shoeNumber);
  const primary = investigation.countingSystem;
  const others = COUNTING_SYSTEMS.filter((s) => s !== primary);

  return (
    <div className="flex h-10 flex-none items-center gap-2 overflow-x-auto border-b border-border bg-surface px-2 text-[11px]">
      <span className="shrink-0 font-bold text-foreground">{ABBR[primary]}</span>
      <span className="shrink-0 font-bold text-foreground">
        RC {formatSigned(stats.counts[primary].runningCount)}
      </span>
      <span className="shrink-0 font-bold text-accent">
        TC {formatSigned(stats.counts[primary].trueCount)}
      </span>
      {others.map((system) => (
        <span key={system} className="shrink-0 text-muted-foreground">
          <span className="text-muted-foreground/70">|</span> {ABBR[system]}{" "}
          {formatSigned(stats.counts[system].runningCount)}
        </span>
      ))}
      <span className="shrink-0 text-muted-foreground">
        <span className="text-muted-foreground/70">|</span> {stats.decksRemaining.toFixed(1)} decks left
      </span>
    </div>
  );
}

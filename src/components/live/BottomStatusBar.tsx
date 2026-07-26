import { computeShoeStats } from "@/lib/analysis/shoeStats";
import { useInvestigationContext } from "@/contexts/InvestigationContext";

/** Final section of the single Live screen — shoe progress plus investigation-wide totals, all derived live, nothing stored redundantly. */
export function BottomStatusBar() {
  const { investigation, currentRound } = useInvestigationContext();
  const stats = computeShoeStats(investigation, currentRound.shoeNumber);

  const totalHands = investigation.rounds.reduce(
    (sum, round) =>
      sum + Object.values(round.seats).filter((seat) => seat?.betAmount != null).length,
    0
  );

  const items: { label: string; value: string }[] = [
    { label: "Cards Seen", value: String(stats.cardsSeen) },
    { label: "Decks Remaining", value: stats.decksRemaining.toFixed(1) },
    { label: "Penetration", value: `${stats.penetrationPct.toFixed(0)}%` },
    { label: "Rounds", value: String(investigation.rounds.length) },
    { label: "Hands", value: String(totalHands) },
    { label: "Occupied Seats", value: investigation.occupiedSeats.join(", ") || "none" },
  ];

  return (
    <div className="grid grid-cols-3 gap-x-2 gap-y-2 border-t border-border bg-surface p-3 text-xs sm:grid-cols-6">
      {items.map((item) => (
        <div key={item.label}>
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{item.label}</p>
          <p className="font-semibold text-foreground">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { computeApLikelihoodBySeat } from "@/lib/analysis/apLikelihood";

const LEVEL_LABEL = { low: "LOW", moderate: "MODERATE", elevated: "ELEVATED" } as const;

export function AnalysisScreen() {
  const { investigation, currentRound } = useInvestigationContext();
  const apBySeat = computeApLikelihoodBySeat(investigation, currentRound.shoeNumber);
  const rounds = [...investigation.rounds].sort((a, b) => a.roundNumber - b.roundNumber);

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="rounded-lg border border-accent/30 bg-accent/10 p-3 text-xs text-muted-foreground">
        Correlation indicators below are reference information only — a statistical
        relationship between recorded bets and the count, not a conclusion about any
        individual.
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Running &amp; True Count Timeline
        </h2>
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5">Round</th>
                <th className="px-2 py-1.5">Shoe</th>
                <th className="px-2 py-1.5">Running</th>
                <th className="px-2 py-1.5">True</th>
              </tr>
            </thead>
            <tbody>
              {rounds.map((round) => (
                <tr key={round.id} className="border-t border-border text-foreground">
                  <td className="px-2 py-1.5">{round.roundNumber}</td>
                  <td className="px-2 py-1.5">{round.shoeNumber}</td>
                  <td className="px-2 py-1.5">{round.runningCount ?? "—"}</td>
                  <td className="px-2 py-1.5">{round.trueCount ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Seat-by-Seat Timelines</h2>
        <div className="flex flex-col gap-3">
          {investigation.trackedSeats.map((seatNumber) => {
            const ap = apBySeat[seatNumber];
            const seatRounds = rounds.filter((r) => r.seats[seatNumber]);
            return (
              <div key={seatNumber} className="rounded-lg border border-border bg-surface p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Seat {seatNumber}</span>
                  <span
                    className={`text-xs font-bold ${
                      ap && ap.level !== "low" ? "text-status-orange" : "text-status-green"
                    }`}
                  >
                    {ap ? LEVEL_LABEL[ap.level] : "LOW"}
                  </span>
                </div>
                <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {seatRounds.map((round) => {
                    const rec = round.seats[seatNumber]!;
                    return (
                      <li key={round.id} className="flex justify-between gap-2">
                        <span>R{round.roundNumber}</span>
                        <span className="text-foreground">
                          {rec.betAmount != null ? `$${rec.betAmount}` : "—"}
                        </span>
                        <span>
                          {rec.wagerChange.direction === "up"
                            ? `▲ $${rec.wagerChange.amount ?? 0}`
                            : rec.wagerChange.direction === "down"
                              ? `▼ $${rec.wagerChange.amount ?? 0}`
                              : rec.wagerChange.direction === "first"
                                ? "first"
                                : "same"}
                        </span>
                        <span>{rec.outcome ?? "—"}</span>
                      </li>
                    );
                  })}
                  {seatRounds.length === 0 && <li>No rounds recorded yet.</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

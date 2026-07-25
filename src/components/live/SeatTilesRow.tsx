import { computeApLikelihoodBySeat } from "@/lib/analysis/apLikelihood";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import type { CardTarget } from "@/contexts/InvestigationContext";
import type { HandOutcome } from "@/types/investigation";

const SEATS = [1, 2, 3, 4, 5, 6, 7];

const OUTCOME_ABBR: Record<NonNullable<HandOutcome>, string> = {
  win: "WIN",
  loss: "LOSS",
  push: "PUSH",
  blackjack: "BJ",
  surrender: "SUR",
  void: "VOID",
};

/** "TABLE SEATS" — tapping a tracked seat selects it for bet changes, card entry, actions, and notes. */
export function SeatTilesRow() {
  const { investigation, currentRound, activeTarget, setActiveTarget } = useInvestigationContext();
  const apBySeat = computeApLikelihoodBySeat(investigation, currentRound.shoeNumber);

  return (
    <div className="flex-none border-b border-border bg-surface p-2">
      <p className="mb-1.5 px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        Table Seats
      </p>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {SEATS.map((seat) => {
          const isOccupied = investigation.occupiedSeats.includes(seat);
          const isTracked = investigation.trackedSeats.includes(seat);
          const isActive = activeTarget === (seat as CardTarget);
          const record = currentRound.seats[seat];
          const ap = apBySeat[seat];

          let toneClasses = "border-border/40 bg-transparent text-muted-foreground/40";
          let statusLabel = "—";
          if (isTracked) {
            const elevated = ap && ap.level !== "low";
            toneClasses = elevated
              ? "border-status-orange/50 bg-status-orange/15 text-status-orange"
              : "border-status-green/50 bg-status-green/15 text-status-green";
            statusLabel = elevated ? "ORANGE" : "GREEN";
          } else if (isOccupied) {
            toneClasses = "border-border bg-surface-raised text-muted-foreground";
            statusLabel = "OCCUPIED";
          }

          const displayLabel = record?.outcome ? OUTCOME_ABBR[record.outcome] : statusLabel;

          return (
            <button
              key={seat}
              type="button"
              disabled={!isTracked}
              onClick={() => setActiveTarget(seat)}
              className={`tap-target flex w-16 shrink-0 flex-col items-center justify-center rounded-lg border py-1.5 ${toneClasses} ${
                isActive ? "ring-2 ring-accent" : ""
              }`}
            >
              <span className="text-xs font-bold">{seat}</span>
              <span className="text-xs font-semibold">
                {record?.betAmount != null ? `$${record.betAmount}` : "—"}
              </span>
              <span className="text-[8px] font-medium tracking-wide">{displayLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

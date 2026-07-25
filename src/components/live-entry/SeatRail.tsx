const SEATS = [1, 2, 3, 4, 5, 6, 7];

interface SeatRailProps {
  occupiedSeats: number[];
  trackedSeats: number[];
  activeSeat: number | null;
  onSelect: (seat: number) => void;
}

/** Seven-seat layout with occupied/tracked/active visual states — plan.md §10/§12. Only tracked seats are selectable. */
export function SeatRail({ occupiedSeats, trackedSeats, activeSeat, onSelect }: SeatRailProps) {
  return (
    <div className="flex gap-2 overflow-x-auto border-b border-border bg-surface p-3">
      {SEATS.map((seat) => {
        const isOccupied = occupiedSeats.includes(seat);
        const isTracked = trackedSeats.includes(seat);
        const isActive = seat === activeSeat;

        const stateClasses = isActive
          ? "border-accent bg-accent text-accent-foreground"
          : isTracked
            ? "border-accent/50 bg-accent/10 text-accent"
            : isOccupied
              ? "border-border bg-surface-raised text-muted-foreground"
              : "border-border/40 bg-transparent text-muted-foreground/40";

        return (
          <button
            key={seat}
            type="button"
            disabled={!isTracked}
            onClick={() => onSelect(seat)}
            aria-pressed={isActive}
            className={`tap-target min-w-[44px] flex-shrink-0 rounded-lg border text-sm font-semibold ${stateClasses}`}
          >
            {seat}
          </button>
        );
      })}
    </div>
  );
}

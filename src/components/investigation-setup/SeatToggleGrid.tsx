"use client";

const SEATS = [1, 2, 3, 4, 5, 6, 7];

interface SeatToggleGridProps {
  occupiedSeats: number[];
  trackedSeats: number[];
  onChangeOccupied: (seats: number[]) => void;
  onChangeTracked: (seats: number[]) => void;
}

/**
 * Shared per-seat occupied/tracked toggle UI — used by both Seat Setup
 * (wizard step 2) and EditSeatsSheet (mid-investigation edit), so operators
 * learn one control and see it again unchanged later. Plan.md §2 Phase 2
 * refinement: occupancy is marked per seat, not as a single count, since
 * real tables aren't always contiguously filled.
 */
export function SeatToggleGrid({
  occupiedSeats,
  trackedSeats,
  onChangeOccupied,
  onChangeTracked,
}: SeatToggleGridProps) {
  function toggleOccupied(seat: number) {
    const nextOccupied = occupiedSeats.includes(seat)
      ? occupiedSeats.filter((s) => s !== seat)
      : [...occupiedSeats, seat].sort((a, b) => a - b);
    onChangeOccupied(nextOccupied);

    if (!nextOccupied.includes(seat) && trackedSeats.includes(seat)) {
      onChangeTracked(trackedSeats.filter((s) => s !== seat));
    }
  }

  function toggleTracked(seat: number) {
    if (!occupiedSeats.includes(seat)) return;
    const nextTracked = trackedSeats.includes(seat)
      ? trackedSeats.filter((s) => s !== seat)
      : [...trackedSeats, seat].sort((a, b) => a - b);
    onChangeTracked(nextTracked);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Occupied seats</p>
        <div className="grid grid-cols-7 gap-2">
          {SEATS.map((seat) => {
            const isOccupied = occupiedSeats.includes(seat);
            return (
              <button
                key={seat}
                type="button"
                onClick={() => toggleOccupied(seat)}
                aria-pressed={isOccupied}
                className={`tap-target rounded-lg text-sm font-semibold ${
                  isOccupied
                    ? "bg-accent text-accent-foreground"
                    : "border border-border bg-surface text-muted-foreground"
                }`}
              >
                {seat}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Seats you&apos;re tracking</p>
        <div className="grid grid-cols-7 gap-2">
          {SEATS.map((seat) => {
            const isOccupied = occupiedSeats.includes(seat);
            const isTracked = trackedSeats.includes(seat);
            return (
              <button
                key={seat}
                type="button"
                onClick={() => toggleTracked(seat)}
                disabled={!isOccupied}
                aria-pressed={isTracked}
                className={`tap-target rounded-lg border text-sm font-semibold ${
                  isTracked
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border bg-surface text-muted-foreground"
                }`}
              >
                {seat}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

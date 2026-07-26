import { SeatTilesRow } from "./SeatTilesRow";

/**
 * The table map — seven seats plus the dealer, all fixed positions in one
 * grid, always visible together. The dealer is just another table
 * position (styled red to stand out instantly), not a separate control
 * box — its actions live in the shared control dock below, exactly like
 * a seat's. Selecting any position highlights it in place; nothing here
 * is ever replaced by a separate screen.
 */
export function TableMap() {
  return (
    <div className="mx-1.5 mt-1.5 flex-none overflow-hidden rounded-2xl border border-border/80 bg-surface-raised/30">
      <SeatTilesRow />
    </div>
  );
}

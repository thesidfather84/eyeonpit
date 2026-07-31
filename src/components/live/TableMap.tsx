import { SeatTilesRow } from "./SeatTilesRow";
import { DealerTile } from "./DealerTile";

/**
 * The table map — the six-position arch (plus optional Position 7) above
 * the dealer, all fixed positions in one view, always visible together,
 * laid out as the dealer sees it while standing at the table. The dealer
 * is just another table position (styled red to stand out instantly), not
 * a separate control box — its actions live in the shared control dock
 * below, exactly like a seat's. Selecting any position highlights it in
 * place; nothing here is ever replaced by a separate screen.
 */
export function TableMap() {
  return (
    <div className="mx-1.5 flex-none overflow-hidden rounded-2xl border border-border/80 bg-surface-raised/30 short:mx-0 short:flex short:h-full short:min-h-0 short:flex-row short:border-0">
      <SeatTilesRow />
      <div className="flex justify-center border-t border-border/60 bg-surface px-1 py-1 short:w-[68px] short:flex-none short:flex-col short:justify-center short:border-l short:border-t-0 short:px-1 short:py-0">
        <div className="w-1/3 min-w-[92px] short:w-full short:min-w-0">
          <DealerTile />
        </div>
      </div>
    </div>
  );
}

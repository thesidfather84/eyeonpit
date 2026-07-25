import { formatCard } from "@/lib/utils/cards";
import { CardPlaceholder } from "./CardPlaceholder";
import type { SeatRoundRecord } from "@/types/investigation";

const RESULT_LABELS = ["Win", "Loss", "Push", "BJ", "Surr."];

interface ActiveSeatPanelProps {
  seatNumber: number;
  seatRecord: SeatRoundRecord | undefined;
}

/**
 * The active tracked seat's cards/wager/result/notes. Placeholder only —
 * real interaction (tap-pad cards, bet quick-entry, result tags, notes)
 * lands in Phase 3 (plan.md §11).
 */
export function ActiveSeatPanel({ seatNumber, seatRecord }: ActiveSeatPanelProps) {
  return (
    <div className="flex flex-col gap-4 p-3">
      <p className="text-sm font-semibold text-foreground">Seat {seatNumber}</p>

      <div>
        <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
          Player Cards
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {seatRecord?.playerCards.map((card, index) => (
            <CardPlaceholder key={index} label={formatCard(card)} />
          ))}
          <button
            disabled
            title="Card entry lands in Phase 3"
            className="tap-target rounded-lg border border-dashed border-border px-3 text-sm text-muted-foreground opacity-60"
          >
            + Add Card
          </button>
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Wager</p>
        <p className="mb-1 text-lg font-semibold text-foreground">
          {seatRecord?.betAmount != null ? `$${seatRecord.betAmount}` : "—"}
        </p>
        <button
          disabled
          className="tap-target w-full rounded-lg border border-dashed border-border text-sm text-muted-foreground opacity-60"
        >
          Set Wager (Phase 3)
        </button>
      </div>

      <div>
        <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Result</p>
        <div className="flex flex-wrap gap-2">
          {RESULT_LABELS.map((label) => (
            <button
              key={label}
              disabled
              className="tap-target rounded-lg border border-border bg-surface-raised px-3 text-xs text-muted-foreground opacity-50"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
        <button
          disabled
          className="tap-target w-full rounded-lg border border-dashed border-border text-sm text-muted-foreground opacity-60"
        >
          + Add Note (Phase 3)
        </button>
      </div>
    </div>
  );
}

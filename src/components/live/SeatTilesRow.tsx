"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { computeApLikelihoodBySeat } from "@/lib/analysis/apLikelihood";
import { computeHandTotal } from "@/lib/utils/blackjackTotal";
import { formatCard } from "@/lib/utils/cards";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import type { CardTarget } from "@/contexts/InvestigationContext";
import { EditSeatsSheet } from "@/components/investigation-setup/EditSeatsSheet";

const SEATS = [1, 2, 3, 4, 5, 6, 7];

/**
 * Player seats — first and most prominent. Tapping an empty seat marks it
 * occupied and active in one tap; tapping any occupied seat selects it,
 * promoting it to tracked on the fly if it wasn't already. No separate
 * "edit mode" gates normal interaction — the pencil icon is only for
 * removing/bulk-adjusting seats.
 */
export function SeatTilesRow() {
  const { investigation, currentRound, activeTarget, activateSeat, refresh } =
    useInvestigationContext();
  const apBySeat = computeApLikelihoodBySeat(investigation, currentRound.shoeNumber);
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="flex-none border-b border-border bg-surface p-1.5">
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
        {SEATS.map((seat) => {
          const isOccupied = investigation.occupiedSeats.includes(seat);
          const isTracked = investigation.trackedSeats.includes(seat);
          const isActive = activeTarget === (seat as CardTarget);
          const record = currentRound.seats[seat];
          const ap = apBySeat[seat];
          const total =
            record && record.playerCards.length > 0 ? computeHandTotal(record.playerCards) : null;

          let toneClasses = "border-border bg-surface-raised text-muted-foreground";
          if (isTracked) {
            const elevated = ap && ap.level !== "low";
            toneClasses = elevated
              ? "border-status-orange/60 bg-status-orange/10 text-foreground"
              : "border-status-green/60 bg-status-green/10 text-foreground";
          } else if (isOccupied) {
            toneClasses = "border-border bg-surface-raised text-foreground";
          }

          return (
            <button
              key={seat}
              type="button"
              onClick={() => activateSeat(seat)}
              className={`tap-target flex min-h-[68px] flex-col items-center justify-center rounded-lg border py-1.5 ${toneClasses} ${
                isActive ? "border-[3px] border-accent bg-accent/20" : ""
              }`}
            >
              <span className="text-xs font-bold">SEAT {seat}</span>
              {isOccupied ? (
                <>
                  <span className="text-sm font-semibold">
                    {record?.betAmount != null ? `$${record.betAmount}` : "—"}
                  </span>
                  <span className="text-[10px] leading-tight">
                    {record && record.playerCards.length > 0
                      ? record.playerCards.map(formatCard).join(" · ")
                      : " "}
                  </span>
                  <span className="text-[10px] font-medium leading-tight">
                    {total ? `${total.soft ? "S" : ""}${total.value}` : " "}
                  </span>
                </>
              ) : (
                <span className="text-[10px] text-muted-foreground">EMPTY</span>
              )}
            </button>
          );
        })}
      </div>

      <button
        onClick={() => setEditOpen(true)}
        aria-label="Edit seats"
        className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
      >
        <Pencil className="h-3 w-3" aria-hidden />
        Edit Seats
      </button>

      {editOpen && (
        <EditSeatsSheet
          investigation={investigation}
          onClose={() => setEditOpen(false)}
          onUpdated={refresh}
        />
      )}
    </div>
  );
}

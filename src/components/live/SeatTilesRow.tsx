"use client";

import { useRef, useState } from "react";
import { MoreVertical, Users } from "lucide-react";
import { computeApLikelihoodBySeat } from "@/lib/analysis/apLikelihood";
import { computeHandTotal } from "@/lib/utils/blackjackTotal";
import { formatCard } from "@/lib/utils/cards";
import { seatNumbersFor } from "@/lib/utils/seats";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import type { CardTarget } from "@/contexts/InvestigationContext";
import { SeatOptionsSheet } from "./SeatOptionsSheet";
import { ManageSeatsSheet } from "./ManageSeatsSheet";

const LONG_PRESS_MS = 500;

const AP_DOT_CLASSES: Record<string, string> = {
  low: "bg-status-green/70",
  moderate: "bg-status-orange/70",
  elevated: "bg-destructive/80",
};

/**
 * Player seats — occupancy, active selection, and player grouping are
 * rendered as three separate signals on the same tile, never merged:
 * occupancy is a quiet fill + thin AP dot, active selection is the only
 * strong border/label, and grouping is a text badge ("P1" / "2 OF 2"), not
 * a color. A normal tap occupies-and-selects an empty seat or just selects
 * an occupied one; press-and-hold (or the small ⋮ button) is the only way
 * to reach anything destructive or structural (link/unlink/mark empty).
 */
export function SeatTilesRow() {
  const { investigation, currentRound, activeTarget, occupySeat, selectSeat } =
    useInvestigationContext();
  const apBySeat = computeApLikelihoodBySeat(investigation, currentRound.shoeNumber);
  const seats = seatNumbersFor(investigation);
  const [optionsSeat, setOptionsSeat] = useState<number | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  function startPress(seat: number) {
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setOptionsSeat(seat);
    }, LONG_PRESS_MS);
  }

  function endPress(seat: number) {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    if (longPressed.current) return;
    if (investigation.occupiedSeats.includes(seat)) {
      selectSeat(seat);
    } else {
      occupySeat(seat);
    }
  }

  function cancelPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  }

  return (
    <div className="flex-none border-b border-border bg-surface p-1.5">
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
        {seats.map((seat) => {
          const isOccupied = investigation.occupiedSeats.includes(seat);
          const isActive = activeTarget === (seat as CardTarget);
          const record = currentRound.seats[seat];
          const ap = apBySeat[seat];
          const total =
            record && record.playerCards.length > 0 ? computeHandTotal(record.playerCards) : null;

          const groupId = investigation.seatPlayerGroups[seat];
          const group = groupId ? investigation.playerGroups[groupId] : undefined;
          const linkedSeatNumbers = groupId
            ? Object.entries(investigation.seatPlayerGroups)
                .filter(([, gId]) => gId === groupId)
                .map(([s]) => Number(s))
                .sort((a, b) => a - b)
            : [];
          const spotIndex = linkedSeatNumbers.indexOf(seat) + 1;
          const spotCount = linkedSeatNumbers.length;

          let toneClasses = "border-dashed border-border/60 bg-transparent text-muted-foreground";
          if (isOccupied) {
            toneClasses = "border-border bg-surface-raised text-foreground";
          }
          if (isActive) {
            toneClasses = "border-accent-secondary bg-accent-secondary/10 text-foreground";
          }

          return (
            <div
              key={seat}
              role="button"
              tabIndex={0}
              onPointerDown={() => startPress(seat)}
              onPointerUp={() => endPress(seat)}
              onPointerLeave={cancelPress}
              onContextMenu={(e) => e.preventDefault()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") endPress(seat);
              }}
              style={{ touchAction: "manipulation" }}
              className={`tap-target relative flex min-h-[68px] flex-col justify-center gap-0.5 rounded-lg py-1.5 pl-2 pr-1 ${toneClasses} ${
                isActive ? "border-2" : "border"
              }`}
            >
              {isOccupied && !isActive && ap && (
                <span
                  className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${AP_DOT_CLASSES[ap.level]}`}
                  aria-hidden
                />
              )}

              <button
                type="button"
                aria-label={`Seat ${seat} options`}
                onClick={(e) => {
                  e.stopPropagation();
                  cancelPress();
                  setOptionsSeat(seat);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <MoreVertical className="h-3.5 w-3.5" aria-hidden />
              </button>

              <span className="text-[10px] font-bold leading-tight">
                {isActive ? `ACTIVE · SEAT ${seat}` : `SEAT ${seat}`}
              </span>

              {isOccupied ? (
                <>
                  <span className="flex items-center gap-1 text-[10px] font-medium leading-tight text-muted-foreground">
                    {spotCount > 1 && <Users className="h-2.5 w-2.5 flex-none" aria-hidden />}
                    <span className="truncate">
                      {group?.label ?? ""}
                      {spotCount > 1 ? ` · ${spotIndex} OF ${spotCount}` : ""}
                    </span>
                  </span>
                  <span className="text-sm font-semibold leading-tight">
                    {record?.betAmount != null ? `$${record.betAmount}` : "—"}
                  </span>
                  <span className="text-[10px] leading-tight">
                    {record && record.playerCards.length > 0
                      ? record.playerCards.map(formatCard).join(" · ")
                      : " "}
                  </span>
                  <span
                    className={`text-[10px] font-medium leading-tight ${total?.bust ? "text-dealer" : ""}`}
                  >
                    {total ? `${total.bust ? "BUST " : total.soft ? "S" : ""}${total.value}` : " "}
                  </span>
                </>
              ) : (
                <span className="text-[10px] text-muted-foreground">EMPTY</span>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={() => setManageOpen(true)}
        className="mt-1 rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground"
      >
        Manage Seats
      </button>

      {optionsSeat != null && (
        <SeatOptionsSheet seatNumber={optionsSeat} onClose={() => setOptionsSeat(null)} />
      )}
      {manageOpen && <ManageSeatsSheet onClose={() => setManageOpen(false)} />}
    </div>
  );
}

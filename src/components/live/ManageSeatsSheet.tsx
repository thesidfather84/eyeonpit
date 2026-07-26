"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { seatNumbersFor } from "@/lib/utils/seats";
import { SeatOptionsSheet } from "./SeatOptionsSheet";

/**
 * The full-table view of seat state — Add/Mark Empty/Link/Unlink/Rename for
 * every seat in one place. This is a convenience for bulk table setup, not
 * a gate: routine seat selection during play always works via a normal tap
 * on the seat tile itself, without ever opening this sheet.
 */
export function ManageSeatsSheet({ onClose }: { onClose: () => void }) {
  const { investigation } = useInvestigationContext();
  const [optionsSeat, setOptionsSeat] = useState<number | null>(null);
  const seats = seatNumbersFor(investigation);

  return (
    <>
      <BottomSheet open onClose={onClose} title="Manage Seats">
        <div className="flex flex-col gap-1 pb-4">
          {seats.map((seat) => {
            const isOccupied = investigation.occupiedSeats.includes(seat);
            const groupId = investigation.seatPlayerGroups[seat];
            const group = groupId ? investigation.playerGroups[groupId] : undefined;
            const spots = groupId
              ? Object.values(investigation.seatPlayerGroups).filter((g) => g === groupId).length
              : 1;

            return (
              <button
                key={seat}
                onClick={() => setOptionsSeat(seat)}
                className="tap-target flex items-center justify-between rounded-lg border border-border px-3 hover:bg-surface-raised"
              >
                <span className="text-sm font-semibold text-foreground">Seat {seat}</span>
                {isOccupied ? (
                  <span className="text-xs text-muted-foreground">
                    {group?.label ?? "Occupied"}
                    {spots > 1 ? ` · linked (${spots})` : ""}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Empty</span>
                )}
              </button>
            );
          })}
        </div>
      </BottomSheet>

      {optionsSeat != null && (
        <SeatOptionsSheet seatNumber={optionsSeat} onClose={() => setOptionsSeat(null)} />
      )}
    </>
  );
}

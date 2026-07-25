"use client";

import { useState } from "react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { EditSeatsSheet } from "@/components/investigation-setup/EditSeatsSheet";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

const SEATS = [1, 2, 3, 4, 5, 6, 7];

export function SeatsScreen() {
  const { investigation, refresh } = useInvestigationContext();
  const [editOpen, setEditOpen] = useState(false);

  const rounds = investigation.rounds;

  return (
    <div className="flex flex-col gap-3 p-3">
      <Button variant="secondary" onClick={() => setEditOpen(true)}>
        Edit Seat Tracking
      </Button>

      <div className="flex flex-col gap-2">
        {SEATS.map((seat) => {
          const isOccupied = investigation.occupiedSeats.includes(seat);
          const isTracked = investigation.trackedSeats.includes(seat);
          const seatRounds = rounds.filter((r) => r.seats[seat]?.betAmount != null);
          const startingWager = seatRounds[0]?.seats[seat]?.betAmount ?? null;
          const latestWager = seatRounds[seatRounds.length - 1]?.seats[seat]?.betAmount ?? null;
          const latestResult = [...rounds].reverse().find((r) => r.seats[seat]?.outcome)?.seats[seat]
            ?.outcome;

          return (
            <div key={seat} className="rounded-lg border border-border bg-surface p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Seat {seat}</span>
                <div className="flex gap-1.5">
                  {isTracked && <Badge tone="accent">TRACKED</Badge>}
                  {!isTracked && isOccupied && <Badge>OCCUPIED</Badge>}
                  {!isOccupied && <Badge>EMPTY</Badge>}
                </div>
              </div>
              {isTracked && (
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Starting <b className="text-foreground">{startingWager != null ? `$${startingWager}` : "—"}</b>
                  </span>
                  <span>
                    Latest <b className="text-foreground">{latestWager != null ? `$${latestWager}` : "—"}</b>
                  </span>
                  <span>
                    Hands <b className="text-foreground">{seatRounds.length}</b>
                  </span>
                  <span>
                    Result <b className="text-foreground">{latestResult ?? "—"}</b>
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

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

"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { updateSeatConfiguration } from "@/lib/db/repositories/investigations";
import { SeatToggleGrid } from "./SeatToggleGrid";
import type { Investigation } from "@/types/investigation";

interface EditSeatsSheetProps {
  investigation: Investigation;
  onClose: () => void;
  onUpdated: () => void;
}

/**
 * Mid-investigation seat changes — plan.md §9 decision 5. Players join and
 * leave a table routinely, so this reopens the same toggle UI from Seat
 * Setup rather than forcing a restart, but always confirms before
 * committing since it does change the shape of an in-progress investigation.
 *
 * The caller only mounts this component while it should be visible (see
 * LiveEntryScreen) — that's what gives each opening a fresh draft straight
 * from `investigation`, with no effect needed to re-sync state on open.
 */
export function EditSeatsSheet({ investigation, onClose, onUpdated }: EditSeatsSheetProps) {
  const [occupiedSeats, setOccupiedSeats] = useState(investigation.occupiedSeats);
  const [trackedSeats, setTrackedSeats] = useState(investigation.trackedSeats);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    setSaving(true);
    try {
      await updateSeatConfiguration(investigation.localId, occupiedSeats, trackedSeats);
      onUpdated();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open onClose={onClose} title="Edit Seats">
      {!confirming ? (
        <div className="flex flex-col gap-4">
          <SeatToggleGrid
            occupiedSeats={occupiedSeats}
            trackedSeats={trackedSeats}
            onChangeOccupied={setOccupiedSeats}
            onChangeTracked={setTrackedSeats}
          />
          <Button
            variant="primary"
            fullWidth
            disabled={trackedSeats.length === 0}
            onClick={() => setConfirming(true)}
          >
            Save Changes
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-foreground">
            Tracking seats {trackedSeats.join(", ") || "none"} going forward. Past
            rounds are unaffected.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setConfirming(false)}>
              Back
            </Button>
            <Button variant="primary" fullWidth disabled={saving} onClick={handleConfirm}>
              {saving ? "Saving…" : "Confirm"}
            </Button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { createInvestigation } from "@/lib/db/repositories/investigations";
import { TableSetupStep } from "./TableSetupStep";
import { SeatSetupStep } from "./SeatSetupStep";
import { InitialBetsStep } from "./InitialBetsStep";
import { ShoeSetupStep } from "./ShoeSetupStep";
import type { WizardDraft } from "./types";

interface NewInvestigationDrawerProps {
  onClose: () => void;
  onCreated: (investigationLocalId: string) => void;
}

const INITIAL_DRAFT: WizardDraft = {
  casino: "",
  tableNumber: "",
  dealerName: "",
  operatorName: "",
  investigationDate: "",
  occupiedSeats: [],
  trackedSeats: [],
  initialWagers: {},
  countingSystem: "Hi-Lo",
  shoeTotalDecks: 6,
  startingShoeNumber: 1,
  setupNotes: "",
};

/**
 * One scrollable sheet, not a paginated wizard — the operator completes
 * setup without leaving the console. Casino/Table/Dealer/Operator/Date,
 * seat occupancy + tracking, initial wagers, shoe number/size, and optional
 * notes are all here at once; Start Investigation stays disabled until
 * every required field is filled.
 */
export function NewInvestigationDrawer({ onClose, onCreated }: NewInvestigationDrawerProps) {
  const [draft, setDraft] = useState<WizardDraft>(INITIAL_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateDraft(patch: Partial<WizardDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  const canStart = Boolean(
    draft.casino.trim() &&
      draft.tableNumber.trim() &&
      draft.dealerName.trim() &&
      draft.operatorName.trim() &&
      draft.investigationDate &&
      draft.occupiedSeats.length > 0 &&
      draft.trackedSeats.length > 0 &&
      draft.trackedSeats.every((seat) => (draft.initialWagers[seat] ?? 0) > 0)
  );

  async function handleStart() {
    setSubmitting(true);
    setError(null);
    try {
      const investigation = await createInvestigation({
        casino: draft.casino.trim(),
        tableNumber: draft.tableNumber.trim(),
        dealerName: draft.dealerName.trim(),
        investigationDate: draft.investigationDate,
        operatorName: draft.operatorName.trim(),
        occupiedSeats: draft.occupiedSeats,
        trackedSeats: draft.trackedSeats,
        initialWagers: draft.initialWagers,
        countingSystem: draft.countingSystem,
        shoeTotalDecks: draft.shoeTotalDecks,
        startingShoeNumber: draft.startingShoeNumber,
        setupNotes: draft.setupNotes,
        status: "active",
      });
      onCreated(investigation.localId);
      onClose();
    } catch (err) {
      console.error("Failed to create investigation:", err);
      setError("Couldn't save the investigation. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <BottomSheet open onClose={onClose} title="New Investigation">
      <div className="flex flex-col gap-5 pb-4">
        <TableSetupStep draft={draft} onChange={updateDraft} />
        <div className="border-t border-border pt-4">
          <SeatSetupStep draft={draft} onChange={updateDraft} />
        </div>
        <div className="border-t border-border pt-4">
          <InitialBetsStep draft={draft} onChange={updateDraft} />
        </div>
        <div className="border-t border-border pt-4">
          <ShoeSetupStep draft={draft} onChange={updateDraft} />
        </div>

        {error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <Button variant="primary" fullWidth disabled={!canStart || submitting} onClick={handleStart}>
          {submitting ? "Starting…" : "Start Investigation"}
        </Button>
      </div>
    </BottomSheet>
  );
}

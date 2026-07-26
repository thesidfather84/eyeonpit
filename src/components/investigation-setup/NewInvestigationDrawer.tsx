"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { createInvestigation } from "@/lib/db/repositories/investigations";
import { TableSetupStep } from "./TableSetupStep";
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
  countingSystem: "Hi-Lo",
  shoeTotalDecks: 6,
  startingShoeNumber: 1,
  setupNotes: "",
};

/**
 * Identity + shoe basics only — never leaves the operator staring at a long
 * form. Seats are populated live, straight from the console (tap a seat to
 * occupy it), so there's nothing seat-related to ask up front.
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
      draft.investigationDate
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

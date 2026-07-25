"use client";

import { useState } from "react";
import { Redo2, Undo2 } from "lucide-react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export function RoundControlsRow() {
  const { currentRound, canUndo, canRedo, undo, redo, mutate, nextRound, newShoe, busy } =
    useInvestigationContext();
  const [shoeConfirmOpen, setShoeConfirmOpen] = useState(false);

  function handleSaveRound() {
    mutate((round) => round, {
      type: "round-saved",
      message: `Round ${currentRound.roundNumber} saved`,
    });
  }

  async function handleConfirmShoe() {
    await newShoe();
    setShoeConfirmOpen(false);
  }

  return (
    <div className="flex-none border-b border-border bg-surface p-3">
      <div className="mb-2 grid grid-cols-2 gap-2">
        <button
          onClick={undo}
          disabled={!canUndo || busy}
          className="tap-target flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-raised text-xs font-medium text-foreground disabled:opacity-40"
        >
          <Undo2 className="h-4 w-4" aria-hidden /> Undo
        </button>
        <button
          onClick={redo}
          disabled={!canRedo || busy}
          className="tap-target flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-raised text-xs font-medium text-foreground disabled:opacity-40"
        >
          <Redo2 className="h-4 w-4" aria-hidden /> Redo
        </button>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2">
        <button
          onClick={handleSaveRound}
          disabled={busy}
          className="tap-target rounded-lg border border-border bg-surface-raised text-xs font-medium text-foreground disabled:opacity-40"
        >
          Save Round
        </button>
        <button
          onClick={nextRound}
          disabled={busy}
          className="tap-target rounded-lg bg-accent text-xs font-bold text-accent-foreground disabled:opacity-40"
        >
          Next Round ▶▶
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setShoeConfirmOpen(true)}
          disabled={busy}
          className="tap-target rounded-lg border border-border bg-surface-raised text-xs font-medium text-foreground disabled:opacity-40"
        >
          New Shoe
        </button>
        <button
          onClick={() => setShoeConfirmOpen(true)}
          disabled={busy}
          className="tap-target rounded-lg bg-destructive text-xs font-bold text-destructive-foreground disabled:opacity-40"
        >
          End Shoe
        </button>
      </div>

      <ConfirmDialog
        open={shoeConfirmOpen}
        title="End this shoe and start fresh counting?"
        message="Running and true count reset to zero for the new shoe. Every round already recorded stays in history."
        confirmLabel="Start New Shoe"
        busy={busy}
        onConfirm={handleConfirmShoe}
        onCancel={() => setShoeConfirmOpen(false)}
      />
    </div>
  );
}

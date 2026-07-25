"use client";

import { useState } from "react";
import { Pause, Play, Redo2, Undo2 } from "lucide-react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { completeInvestigation } from "@/lib/db/repositories/investigations";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export function RoundControlsRow() {
  const {
    investigation,
    currentRound,
    canUndo,
    canRedo,
    undo,
    redo,
    mutate,
    nextRound,
    newShoe,
    pause,
    resume,
    refresh,
    busy,
  } = useInvestigationContext();
  const [shoeConfirmOpen, setShoeConfirmOpen] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [ending, setEnding] = useState(false);

  const isPaused = investigation.status === "paused";
  const isActive = investigation.status === "active";

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

  async function handleEndInvestigation() {
    setEnding(true);
    try {
      await completeInvestigation(investigation.localId);
      // Stay on this console rather than navigating away — the operator
      // can review Reports/Export for this investigation immediately via
      // the Menu (LiveHeader shows a "New Investigation" way back to the
      // empty console once they're ready to move on).
      await refresh();
    } finally {
      setEnding(false);
      setEndConfirmOpen(false);
    }
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
          disabled={busy || !isActive}
          className="tap-target rounded-lg border border-border bg-surface-raised text-xs font-medium text-foreground disabled:opacity-40"
        >
          Save Round
        </button>
        <button
          onClick={nextRound}
          disabled={busy || !isActive}
          className="tap-target rounded-lg bg-accent text-xs font-bold text-accent-foreground disabled:opacity-40"
        >
          Next Round ▶▶
        </button>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2">
        <button
          onClick={() => setShoeConfirmOpen(true)}
          disabled={busy || !isActive}
          className="tap-target rounded-lg border border-border bg-surface-raised text-xs font-medium text-foreground disabled:opacity-40"
        >
          New Shoe
        </button>
        <button
          onClick={isPaused ? resume : pause}
          disabled={busy || investigation.status === "closed"}
          className="tap-target flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-raised text-xs font-medium text-foreground disabled:opacity-40"
        >
          {isPaused ? (
            <>
              <Play className="h-4 w-4" aria-hidden /> Resume
            </>
          ) : (
            <>
              <Pause className="h-4 w-4" aria-hidden /> Pause
            </>
          )}
        </button>
      </div>

      <button
        onClick={() => setEndConfirmOpen(true)}
        disabled={busy || investigation.status === "closed"}
        className="tap-target w-full rounded-lg bg-destructive text-xs font-bold text-destructive-foreground disabled:opacity-40"
      >
        End Investigation
      </button>

      <ConfirmDialog
        open={shoeConfirmOpen}
        title="Start a new shoe?"
        message="Running and true count reset to zero for the new shoe, across every counting system. Every round already recorded stays in history."
        confirmLabel="Start New Shoe"
        busy={busy}
        onConfirm={handleConfirmShoe}
        onCancel={() => setShoeConfirmOpen(false)}
      />

      <ConfirmDialog
        open={endConfirmOpen}
        title="End this investigation?"
        message={`${investigation.rounds.length} rounds recorded across ${investigation.trackedSeats.length} tracked seat(s). You can still reopen it later from History.`}
        confirmLabel="End Investigation"
        destructive
        busy={ending}
        onConfirm={handleEndInvestigation}
        onCancel={() => setEndConfirmOpen(false)}
      />
    </div>
  );
}

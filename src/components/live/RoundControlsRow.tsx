"use client";

import { useState } from "react";
import { Redo2, StickyNote, Undo2, XCircle } from "lucide-react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { AddNoteSheet } from "./AddNoteSheet";

/**
 * Fixed bottom action bar — never falls below the viewport. One dynamic
 * primary action: "Complete Round" while the dealer/seats aren't fully
 * resolved yet, "Start Next Round" once they are — a single button instead
 * of two that could be tapped in a confusing order.
 */
export function RoundControlsRow() {
  const {
    investigation,
    currentRound,
    canUndo,
    canRedo,
    undo,
    redo,
    clearActiveEntry,
    completeRound,
    reopenRound,
    nextRound,
    busy,
  } = useInvestigationContext();
  const [noteOpen, setNoteOpen] = useState(false);

  const isActive = investigation.status === "active";

  return (
    <div className="flex-none border-t border-border bg-surface p-1.5">
      <div className="mb-1.5 grid grid-cols-4 gap-1.5">
        <button
          onClick={undo}
          disabled={!canUndo || busy}
          aria-label="Undo"
          className="tap-target flex items-center justify-center gap-1 rounded-md border border-border bg-surface-raised text-[11px] font-medium text-foreground disabled:opacity-40"
        >
          <Undo2 className="h-3.5 w-3.5" aria-hidden /> Undo
        </button>
        <button
          onClick={redo}
          disabled={!canRedo || busy}
          aria-label="Redo"
          className="tap-target flex items-center justify-center gap-1 rounded-md border border-border bg-surface-raised text-[11px] font-medium text-foreground disabled:opacity-40"
        >
          <Redo2 className="h-3.5 w-3.5" aria-hidden /> Redo
        </button>
        <button
          onClick={() => setNoteOpen(true)}
          disabled={busy}
          aria-label="Add note"
          className="tap-target flex items-center justify-center gap-1 rounded-md border border-border bg-surface-raised text-[11px] font-medium text-foreground disabled:opacity-40"
        >
          <StickyNote className="h-3.5 w-3.5" aria-hidden /> Note
        </button>
        <button
          onClick={clearActiveEntry}
          disabled={busy || !isActive || currentRound.completed}
          aria-label="Clear current entry"
          className="tap-target flex items-center justify-center gap-1 rounded-md border border-border bg-surface-raised text-[11px] font-medium text-foreground disabled:opacity-40"
        >
          <XCircle className="h-3.5 w-3.5" aria-hidden /> Clear
        </button>
      </div>

      {currentRound.completed ? (
        <>
          <button
            onClick={nextRound}
            disabled={busy || !isActive}
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            className="tap-target w-full rounded-lg bg-accent text-sm font-bold text-accent-foreground disabled:opacity-40"
          >
            Start Next Round ▶▶
          </button>
          <button
            onClick={reopenRound}
            disabled={busy || !isActive}
            className="mt-1 w-full text-center text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            Round locked — Reopen Round
          </button>
        </>
      ) : (
        <button
          onClick={completeRound}
          disabled={busy || !isActive}
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          className="tap-target w-full rounded-lg bg-accent text-sm font-bold text-accent-foreground disabled:opacity-40"
        >
          Complete Round
        </button>
      )}

      {noteOpen && <AddNoteSheet onClose={() => setNoteOpen(false)} />}
    </div>
  );
}

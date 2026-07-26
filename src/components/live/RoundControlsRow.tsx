"use client";

import { useState } from "react";
import { Redo2, StickyNote, Undo2, XCircle } from "lucide-react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { canCompleteRound } from "@/lib/utils/roundValidation";
import { AddNoteSheet } from "./AddNoteSheet";

/**
 * Fixed bottom action bar — never falls below the viewport. One primary
 * action, "Complete Round": disabled until canCompleteRound() passes, and
 * on tap it saves the round and begins the next one in the same shoe
 * immediately — no separate "Start Next Round" tap, nothing else to ask.
 * An accidental completion is corrected with the same Undo used for every
 * other mistake, not a special-case button.
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
    completeRoundAndAdvance,
    busy,
  } = useInvestigationContext();
  const [noteOpen, setNoteOpen] = useState(false);

  const isActive = investigation.status === "active";
  const check = canCompleteRound(investigation, currentRound);

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

      <button
        onClick={completeRoundAndAdvance}
        disabled={busy || !isActive || !check.canComplete}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        className="tap-target w-full rounded-lg bg-accent text-sm font-bold text-accent-foreground disabled:opacity-40"
      >
        Complete Round
      </button>
      {!check.canComplete && (
        <p className="mt-1 text-center text-[10px] text-muted-foreground">{check.reasons[0]}</p>
      )}

      {noteOpen && <AddNoteSheet onClose={() => setNoteOpen(false)} />}
    </div>
  );
}

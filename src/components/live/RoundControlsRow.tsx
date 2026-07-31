"use client";

import { useState } from "react";
import { Redo2, StickyNote, XCircle } from "lucide-react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { canCompleteRound } from "@/lib/utils/roundValidation";
import { AddNoteSheet } from "./AddNoteSheet";

/**
 * Done / Next / Undo — the three controls an operator reaches for
 * constantly, grouped together directly above the card keypad as the most
 * prominent row here. Redo/Note/Clear are real but rarer actions, so they
 * sit in a smaller secondary row beneath instead of competing for the same
 * visual weight — and the primary forward control never lives at the
 * bottom of the page behind scrollable content.
 *
 * Done and Next are deliberately separate (not fused into one "complete
 * and advance" tap): Done locks the round (completeRound — the existing
 * "Complete Round" primitive). Next moves forward using whichever of the
 * two existing advance primitives applies — advanceToNext (the next
 * required card-entry position, e.g. dealer -> seat1 -> seat2 in guided
 * mode) while the round is still open, or nextRound once Done has already
 * locked it. There is exactly one way to complete a round and exactly one
 * way to advance — never two competing "finish this round" buttons.
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
    advanceToNext,
    nextRound,
    busy,
  } = useInvestigationContext();
  const [noteOpen, setNoteOpen] = useState(false);

  const isActive = investigation.status === "active";
  const check = canCompleteRound(investigation, currentRound);

  function handleNext() {
    if (currentRound.completed) {
      nextRound();
    } else {
      advanceToNext();
    }
  }

  return (
    <div className="flex-none border-t border-border bg-surface p-1.5">
      <div className="grid grid-cols-3 gap-1.5">
        <button
          onClick={completeRound}
          disabled={busy || !isActive || currentRound.completed || !check.canComplete}
          aria-label="Done — complete this round"
          className="tap-target flex items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-foreground disabled:opacity-40"
        >
          Done
        </button>
        <button
          onClick={handleNext}
          disabled={busy || !isActive}
          aria-label="Next"
          className="tap-target flex items-center justify-center rounded-lg border border-border bg-surface-raised text-sm font-bold text-foreground disabled:opacity-40"
        >
          Next
        </button>
        <button
          onClick={undo}
          disabled={!canUndo || busy}
          aria-label="Undo"
          className="tap-target flex items-center justify-center rounded-lg border border-border bg-surface-raised text-sm font-bold text-foreground disabled:opacity-40"
        >
          Undo
        </button>
      </div>
      {!currentRound.completed && !check.canComplete && (
        <p className="mt-1 text-center text-[10px] text-muted-foreground">{check.reasons[0]}</p>
      )}

      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
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

      {noteOpen && <AddNoteSheet onClose={() => setNoteOpen(false)} />}
    </div>
  );
}

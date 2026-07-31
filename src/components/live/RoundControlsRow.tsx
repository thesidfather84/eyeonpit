"use client";

import { useState } from "react";
import { MoreHorizontal, Redo2, StickyNote, XCircle } from "lucide-react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { useRoundControls } from "@/hooks/useRoundControls";
import { canCompleteRound } from "@/lib/utils/roundValidation";
import { AddNoteSheet } from "./AddNoteSheet";

/**
 * Done / Next / Undo — the three controls an operator reaches for
 * constantly, permanently grouped in one compact toolbar row directly
 * above the card keypad. Redo/Note/Clear are real but rarer actions, so
 * they're tucked behind the "⋯" toggle instead of permanently consuming
 * screen height — opening it is the exception, not the steady state, so it
 * never competes with the keypad below for space.
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
  const { investigation, currentRound, canRedo, redo, clearActiveEntry, busy } = useInvestigationContext();
  const { handleDone, handleNext, handleUndo, doneDisabled, nextDisabled, undoDisabled } = useRoundControls();
  const [noteOpen, setNoteOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);

  const isActive = investigation.status === "active";
  const check = canCompleteRound(investigation, currentRound);

  return (
    <div className="flex-none border-t border-border bg-surface p-0.5 short:border-t-0">
      <div className="grid grid-cols-[1.3fr_1fr_1fr_44px] gap-1.5 short:gap-1">
        <button
          onClick={handleDone}
          disabled={doneDisabled}
          aria-label="Done — complete this round"
          className="tap-target flex items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-foreground disabled:opacity-40"
        >
          Done
        </button>
        <button
          onClick={handleNext}
          disabled={nextDisabled}
          aria-label="Next"
          className="tap-target flex items-center justify-center rounded-lg border border-border bg-surface-raised text-sm font-bold text-foreground disabled:opacity-40"
        >
          Next
        </button>
        <button
          onClick={handleUndo}
          disabled={undoDisabled}
          aria-label="Undo"
          className="tap-target flex items-center justify-center rounded-lg border border-border bg-surface-raised text-sm font-bold text-foreground disabled:opacity-40"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={() => setOverflowOpen((v) => !v)}
          aria-label="More round actions — Redo, Note, Clear"
          aria-expanded={overflowOpen}
          className={`tap-target flex items-center justify-center rounded-lg border text-foreground ${
            overflowOpen ? "border-accent bg-accent/15" : "border-border bg-surface-raised"
          }`}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {!currentRound.completed && !check.canComplete && (
        <p className="mt-1 text-center text-[10px] text-muted-foreground short:mt-0.5 short:text-[9px]">
          {check.reasons[0]}
        </p>
      )}

      {overflowOpen && (
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
      )}

      {noteOpen && <AddNoteSheet onClose={() => setNoteOpen(false)} />}
    </div>
  );
}

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
 * `floorMode` (operator-loop correction) is the one behavioral difference
 * between the two shells this row is mounted in:
 * - Surveillance (default): Done and Next stay deliberately separate —
 *   Done locks the round (`completeRound`), Next then explicitly starts
 *   the following one (`nextRound`) or advances the active target
 *   mid-round (`advanceToNext`). Kept exactly as before for deliberate,
 *   reviewable, one-step-at-a-time control.
 * - Floor (`floorMode`): a Floor operator narrates a hand and says "Done"
 *   — there is no natural moment for a second "Next" in that rhythm, and
 *   requiring one was an approved-workflow violation, not a deliberate
 *   safety pause. Done itself now completes AND advances in one step (see
 *   useRoundControls' own doc comment on `completeRoundAndAdvance`). Next
 *   is NOT removed — it keeps its pre-Done meaning (advance the active
 *   target mid-hand, e.g. skip ahead without narrating a target by name),
 *   and remains available as manual recovery/navigation. It simply stops
 *   being a REQUIRED post-Done step, because Done no longer leaves
 *   anything for it to do there — `nextRound()` itself still refuses to
 *   run on an already-fresh round (see its own `!currentRound.completed`
 *   guard), so there is no way for a stray Next to double-advance.
 */
export function RoundControlsRow({ floorMode = false }: { floorMode?: boolean } = {}) {
  const { investigation, currentRound, canRedo, redo, clearActiveEntry, busy } = useInvestigationContext();
  const { handleDone, handleNext, handleUndo, doneDisabled, nextDisabled, undoDisabled, undoLabel } =
    useRoundControls(floorMode);
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
          title={undoLabel}
          className="tap-target flex items-center justify-center truncate rounded-lg border border-border bg-surface-raised px-1 text-[13px] font-bold text-foreground disabled:opacity-40"
        >
          {undoLabel}
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

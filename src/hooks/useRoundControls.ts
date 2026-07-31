"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { canCompleteRound } from "@/lib/utils/roundValidation";

/**
 * The Done/Next/Undo orchestration RoundControlsRow's three primary
 * buttons drive — pulled out so a second entry surface (VoiceControl) can
 * call the identical existing handlers with the identical enablement rules,
 * instead of re-deriving its own copy of "is Next currently allowed."
 * RoundControlsRow keeps its own Redo/Note/Clear overflow — those aren't
 * in this beta's voice command set.
 */
export function useRoundControls() {
  const { investigation, currentRound, canUndo, undo, completeRound, advanceToNext, nextRound, busy } =
    useInvestigationContext();

  const isActive = investigation.status === "active";
  const check = canCompleteRound(investigation, currentRound);

  const doneDisabled = busy || !isActive || currentRound.completed || !check.canComplete;
  const nextDisabled = busy || !isActive;
  const undoDisabled = !canUndo || busy;

  function handleDone() {
    if (doneDisabled) return;
    completeRound();
  }

  function handleNext() {
    if (nextDisabled) return;
    if (currentRound.completed) {
      nextRound();
    } else {
      advanceToNext();
    }
  }

  function handleUndo() {
    if (undoDisabled) return;
    undo();
  }

  return { handleDone, handleNext, handleUndo, doneDisabled, nextDisabled, undoDisabled };
}

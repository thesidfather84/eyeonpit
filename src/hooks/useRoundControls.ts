"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { canCompleteRound } from "@/lib/utils/roundValidation";
import { useSettingsStore } from "@/store/useSettingsStore";
import { speak } from "@/lib/voice/speechOutput";
import { buildStatusAnnouncement } from "@/lib/voice/spokenSummary";
import { getInvestigation } from "@/lib/db/repositories/investigations";
import { getCardEventsForInvestigation } from "@/lib/db/repositories/cardEvents";

/**
 * The Done/Next/Undo orchestration RoundControlsRow's three primary
 * buttons drive — pulled out so a second entry surface (VoiceControl) can
 * call the identical existing handlers with the identical enablement rules,
 * instead of re-deriving its own copy of "is Next currently allowed."
 * RoundControlsRow keeps its own Redo/Note/Clear overflow — those aren't
 * in this beta's voice command set.
 *
 * `handleDone`/`handleUndo` are the ONE place Done/Undo ever run from — a
 * tap (RoundControlsRow) and the matching voice command (VoiceControl)
 * both call these exact functions — so putting the post-action spoken
 * count summary here, rather than duplicating it in both callers, makes
 * "say or tap Done/Undo, hear the count" true everywhere either control
 * exists, not just Floor specifically (VoiceControl doesn't distinguish
 * which shell it's mounted in, and a hands-free confirmation is equally
 * useful either way).
 *
 * `handleDone` awaits its completion call and only speaks after it
 * resolves, using the count/cardEvents captured BEFORE the await:
 * completing a round only locks it (and, in Floor, immediately starts the
 * next one) — neither ever adds or removes a CardEvent, so those values
 * are already correct no matter which of the two it used — no staleness
 * risk, no extra refetch needed. If `doneDisabled` is true, nothing is
 * ever called and nothing is ever announced — a blocked Done must never
 * speak a count as though the hand had just completed.
 *
 * `floorMode` (operator-loop correction) selects which of the two existing,
 * already-tested completion primitives handleDone drives:
 * - Surveillance (`floorMode` false, the default): `completeRound()` alone
 *   — locks the round and stops there. Done and Next stay deliberately
 *   separate controls for deliberate review, exactly as RoundControlsRow's
 *   own doc comment already explains.
 * - Floor (`floorMode` true): `completeRoundAndAdvance()` — the existing
 *   "Complete Round button's action" (see InvestigationContext.tsx) that
 *   locks the round AND starts the next one in the same shoe, in one
 *   atomic step, under one `busy` window. This was already built and
 *   fully wired into the context (including its own undo history entry)
 *   but had no caller anywhere in the app until this correction — Floor's
 *   Done now uses it so a Floor operator never has to say or tap "Next"
 *   after an ordinary hand. Next keeps its pre-Done meaning in Floor too
 *   (advance the active target mid-hand) — see RoundControlsRow's and
 *   VoiceControl's own doc comments for why it's still there.
 *
 * `nextDisabled` still gates on `busy` — while the auto-advance's own
 * complete+advance sequence is in flight, Next stays disabled, so a fast
 * "Done" immediately followed by "Next" can never race into a duplicate
 * round advance.
 *
 * `handleUndo` is different: undo DOES change the CardEvent ledger (that's
 * the entire point), so the pre-undo `cardEvents` closure would speak the
 * WRONG (pre-reversal) count. It awaits `undo()` (see
 * InvestigationContext's own doc comment — undo() resolves only once its
 * write AND the following refresh() have both landed) and then re-reads
 * investigation/cardEvents directly from the repository — not this
 * render's own stale closures — before building the spoken summary, the
 * same "read live, not stale" pattern VoiceControl's own New Shoe handling
 * already uses.
 */
export function useRoundControls(floorMode = false) {
  const {
    investigation,
    currentRound,
    cardEvents,
    canUndo,
    undo,
    undoLabel,
    completeRound,
    completeRoundAndAdvance,
    advanceToNext,
    nextRound,
    busy,
  } = useInvestigationContext();
  const voiceAudioFeedback = useSettingsStore((s) => s.voiceAudioFeedback);
  const floorSpokenCountContent = useSettingsStore((s) => s.floorSpokenCountContent);

  const isActive = investigation.status === "active";
  const check = canCompleteRound(investigation, currentRound);

  const doneDisabled = busy || !isActive || currentRound.completed || !check.canComplete;
  const nextDisabled = busy || !isActive;
  const undoDisabled = !canUndo || busy;

  async function handleDone() {
    if (doneDisabled) return;
    const shoeNumber = currentRound.shoeNumber;
    if (floorMode) {
      await completeRoundAndAdvance();
    } else {
      await completeRound();
    }
    if (voiceAudioFeedback && floorSpokenCountContent !== "off") {
      speak(buildStatusAnnouncement(investigation, cardEvents, shoeNumber, floorSpokenCountContent));
    }
  }

  function handleNext() {
    if (nextDisabled) return;
    if (currentRound.completed) {
      nextRound();
    } else {
      advanceToNext();
    }
  }

  async function handleUndo() {
    if (undoDisabled) return;
    const investigationLocalId = investigation.localId;
    await undo();
    if (voiceAudioFeedback && floorSpokenCountContent !== "off") {
      const fresh = await getInvestigation(investigationLocalId);
      if (!fresh) return;
      const freshEvents = await getCardEventsForInvestigation(investigationLocalId);
      const freshRound = fresh.rounds[fresh.rounds.length - 1];
      const summary = buildStatusAnnouncement(fresh, freshEvents, freshRound.shoeNumber, floorSpokenCountContent);
      speak(`Undone. ${summary}`);
    }
  }

  return { handleDone, handleNext, handleUndo, doneDisabled, nextDisabled, undoDisabled, undoLabel };
}

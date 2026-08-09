"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { resolveCardEntryTarget } from "@/lib/utils/cardEntryResolution";
import type { Rank } from "@/types/investigation";

/**
 * The card-entry orchestration CardEntryPad's keypad taps drive — target
 * resolution (dealer / seat / split), the disabled gate, and the exact
 * addCard() call shape — pulled out into a hook so a second entry surface
 * (VoiceControl) can drive the identical path instead of re-deriving its
 * own copy of this logic. CardEntryPad still owns everything about how it
 * *looks* (labels, keypad grid, last-card-entered text); this hook owns
 * only what a tap or a voice command actually *does*, driven by whichever
 * target is currently active. Voice entry also uses `resolveCardEntryTarget`
 * directly when a target is spoken in the same utterance ("dealer king") —
 * see VoiceControl.tsx — so the disabled/lock rules can never drift between
 * the two entry surfaces.
 */
export function useCardEntry() {
  const { investigation, currentRound, activeTarget, addCard, busy } = useInvestigationContext();
  const resolution = resolveCardEntryTarget(investigation, currentRound, activeTarget, busy);

  function enterCard(rank: Rank) {
    if (resolution.disabled) return;
    const card = { rank, suit: "unspecified" as const };
    addCard(
      { targetType: resolution.targetType, targetId: resolution.targetId, rank },
      (round) => resolution.applyCard(round, card),
      { type: "card", message: resolution.eventMessage(card) }
    );
  }

  return {
    enterCard,
    disabled: resolution.disabled,
    locked: resolution.locked,
    notEnabled: resolution.notEnabled,
    targetLabel: resolution.targetLabel,
  };
}

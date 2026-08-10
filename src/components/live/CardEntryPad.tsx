"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { useCardEntry } from "@/hooks/useCardEntry";
import type { Rank } from "@/types/investigation";

const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

/**
 * The primary control surface — largest, most prominent element on the
 * live screen, always two full rows of five buttons (never a narrow
 * vertical strip): A 2 3 4 5 / 6 7 8 9 10. Applies to whichever target
 * (dealer / seat / split hand) is currently active. A tap simply appends
 * the card to the target's list — dealer and seats use the exact same
 * append, no upcard/hole-card distinction, no confirmation, no forced
 * order. EyeOnPit records what the operator observed; it never asks them
 * to play the hand out.
 *
 * There is no separate "Undo Last Card" button here anymore — Undo already
 * has one first-class, always-visible home (RoundControlsRow, directly
 * above this pad) and the same context function either way; a second
 * button for the identical action only cost this pad the vertical space
 * its buttons need most.
 *
 * There is no "ENTER CARD → SEAT n" label here anymore either — that fact
 * now lives in exactly one place, ActiveSeatHeader (directly above this,
 * always rendered, dealer or seat), which is what "ENTER CARDS" as its own
 * second line already states. Repeating it here was exactly the "same fact
 * stated four times" duplication the count-first UI pass removed. This
 * keeps only its own status text (not the target name): "Seat not
 * enabled…", "Hand locked", or the last card's own event message.
 */
export function CardEntryPad() {
  const { currentRound } = useInvestigationContext();
  const { enterCard, disabled, locked, notEnabled } = useCardEntry();

  const lastCardEvent = [...currentRound.eventLog].reverse().find((e) => e.type === "card");

  return (
    <div className="flex flex-none flex-col gap-0.5 border-b border-border bg-surface px-2 py-0.5 short:gap-0 short:border-b-0 short:px-1.5 short:py-0.5">
      {(lastCardEvent || locked || notEnabled) && (
        <p
          className={`min-w-0 truncate text-[10px] leading-none short:text-[9px] ${locked || notEnabled ? "font-semibold text-pending" : "text-muted-foreground"}`}
        >
          {notEnabled
            ? "Seat not enabled — double-tap to enable"
            : locked
              ? "Hand locked"
              : lastCardEvent!.message}
        </p>
      )}
      {/* Compact keypad, sized off available height (clamp, not a device
          breakpoint) rather than a device breakpoint pair — `short:` only
          lowers the floor further, since a landscape phone has width to
          spare for five columns but never much height. */}
      <div className="grid grid-cols-5 gap-1.5 short:gap-1">
        {RANKS.map((rank) => (
          <button
            key={rank}
            disabled={disabled}
            onClick={() => enterCard(rank)}
            className="tap-target flex h-[clamp(40px,7dvh,52px)] items-center justify-center rounded-xl border border-border bg-surface-raised text-xl font-bold text-foreground active:bg-accent active:text-accent-foreground disabled:opacity-40 short:!h-[clamp(30px,9dvh,40px)] short:text-base"
          >
            {rank}
          </button>
        ))}
      </div>
    </div>
  );
}

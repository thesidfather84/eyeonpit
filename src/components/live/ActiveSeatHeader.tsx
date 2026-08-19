"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import type { CardTarget } from "@/contexts/InvestigationContext";
import { resolveSeatTarget } from "@/lib/utils/seatTarget";

/**
 * The ONE place that states, unambiguously, what the card keypad currently
 * applies to — dealer or seat, always rendered (there is no longer a
 * "dealer active, nothing shown" gap). Before this consolidation, the same
 * fact was restated up to four times on screen (the seat tile's own
 * "ACTIVE · SEAT n", this banner's old "ACTIVE — SEAT n / group / bet",
 * CardEntryPad's "ENTER CARD → SEAT n", and QuickBetPanel's "CURRENT WAGER
 * — SEAT n" title) — this is the single source of truth CardEntryPad now
 * defers to entirely (it only shows "ENTER CARDS", not the target name
 * again). The seat tile's own highlight is left alone — a tile lighting up
 * is spatial context, not a text duplicate, so it stays.
 *
 * Deliberately drops the bet amount and spot-of-count that used to live
 * here: the bet now lives in the collapsed wager/player-detail entry point
 * directly below (see PlayerDetailBar), and spot-of-count is already shown
 * on the seat tile itself (SeatTilesRow) — repeating either here would just
 * be duplication again, the exact thing this consolidation removes.
 *
 * `terminology` (PRIORITY 1.9-10/12 — global operator terminology rule,
 * superseding the earlier Floor-only "Spot"/Surveillance-only "Seat"
 * split): "Spot" is now the default VISIBLE word for a numbered player
 * position everywhere in the app — no normal operator-facing surface may
 * show the bare internal shorthand "S1"-"S7", and "Seat" is no longer
 * Surveillance's own default either, until a future property-level
 * terminology preference (docs/EYEONPIT_1_8_GLOBAL_ARCHITECTURE.md §3) is
 * actually wired in. Defaults to "spot" so every existing call site
 * (Surveillance's LiveScreen included) needed no change to pick up the new
 * default. This is presentation-only: the underlying seat number/
 * identifier is completely unaffected either way, and voice input keeps
 * accepting "seat"/"spot"/"player" as synonyms regardless of which word is
 * on screen (see docs/EYEONPIT_PRODUCT_SPEC.md §4's terminology standard,
 * updated for this priority).
 */
export function ActiveSeatHeader({ target, terminology = "spot" }: { target: CardTarget; terminology?: "seat" | "spot" }) {
  const { investigation, currentRound } = useInvestigationContext();
  const word = terminology === "seat" ? "SEAT" : "SPOT";

  let identity: string;
  if (target === "dealer") {
    identity = "DEALER";
  } else {
    const { seatNumber, isSplit } = resolveSeatTarget(currentRound, target);
    const groupId = investigation.seatPlayerGroups[seatNumber];
    const group = groupId ? investigation.playerGroups[groupId] : undefined;
    identity = `${word} ${seatNumber}${isSplit ? " · SPLIT" : ""}${group ? ` · ${group.label}` : ""}`;
  }

  return (
    <div
      data-testid="active-seat-header"
      className="flex-none border-b border-accent-secondary/40 bg-accent-secondary/10 px-2 py-0.5 short:flex short:items-baseline short:gap-1.5 short:py-0"
    >
      <p className="text-[11px] font-bold leading-tight tracking-wide text-accent-secondary short:text-[10px]">
        {identity}
      </p>
      <p className="text-[10px] font-medium leading-tight text-muted-foreground short:text-[9px]">
        ENTER CARDS
      </p>
    </div>
  );
}

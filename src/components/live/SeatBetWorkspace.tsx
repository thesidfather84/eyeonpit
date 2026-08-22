"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import type { CardTarget } from "@/contexts/InvestigationContext";
import { resolveSeatTarget } from "@/lib/utils/seatTarget";
import { QuickBetPanel } from "./QuickBetPanel";

/**
 * Fills the otherwise-empty middle workspace (between ActiveSeatPanel and
 * CardEntryPad) with the EXISTING QuickBetPanel — denomination chips,
 * current wager, +/-/Repeat/Clear — the instant an occupied player spot
 * becomes the active target, instead of leaving that space blank until the
 * operator hunts for the CHANGE BET button. Dealer active, or an
 * unoccupied/empty spot active, renders nothing here — no wager controls
 * make sense for either, matching ActiveSeatPanel's own enabled/dealer
 * branching. This mounts the exact same QuickBetPanel component
 * PlayerDetailSheet already uses (same wager mutation, same SET-total
 * semantics) — just a second mount point for it, no new wager logic.
 */
export function SeatBetWorkspace({ target }: { target: CardTarget }) {
  const { investigation, currentRound } = useInvestigationContext();

  if (target === "dealer") return null;

  const { seatNumber } = resolveSeatTarget(currentRound, target);
  const enabled = investigation.occupiedSeats.includes(seatNumber);
  if (!enabled) return null;

  return <QuickBetPanel target={target} />;
}

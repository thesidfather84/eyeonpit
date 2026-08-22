"use client";

import { useState } from "react";
import { Check, MoreVertical } from "lucide-react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import type { CardTarget } from "@/contexts/InvestigationContext";
import { resolveSeatTarget, splitTargetFor } from "@/lib/utils/seatTarget";
import { formatCard } from "@/lib/utils/cards";
import { formatCurrency } from "@/lib/utils/currency";
import { computeSeatStatusLabel } from "@/lib/utils/seatStatusLabel";
import { PlayerDetailSheet } from "./PlayerDetailSheet";

/**
 * The one always-visible contextual working area for whatever is currently
 * active — dealer or seat (AGENTS.md operational UI rebuild §8). Replaces
 * the old ActiveSeatHeader + collapsed PlayerDetailBar pair: the bet is
 * never hidden behind a "Player Details" tap anymore — BET/CARDS/STATUS
 * are always shown here, with one obvious CHANGE BET button and one Seat
 * Actions button, both opening the exact same existing PlayerDetailSheet
 * (QuickBetPanel + PlayerActionsRow, unchanged) — no new wager store, no
 * new mutation path, only where the trigger lives and what it's labeled.
 *
 * `terminology` mirrors the same seat/spot switch every other live surface
 * already respects (see ActiveSeatHeader's own prior doc comment for the
 * full history) — defaults to "spot", the current global default.
 */
export function ActiveSeatPanel({
  target,
  terminology = "spot",
}: {
  target: CardTarget;
  terminology?: "seat" | "spot";
}) {
  const { investigation, currentRound, setActiveTarget } = useInvestigationContext();
  const [detailOpen, setDetailOpen] = useState(false);
  const word = terminology === "seat" ? "SEAT" : "SPOT";

  if (target === "dealer") {
    const cards = currentRound.dealerHand.cards;
    return (
      <div
        data-testid="active-seat-panel"
        className="flex-none border-b border-accent-secondary/40 bg-accent-secondary/10 px-3 py-2"
      >
        <p className="text-xs font-extrabold tracking-wide text-accent-secondary">DEALER</p>
        <div className="mt-1 flex items-center gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Cards</p>
            <p className="text-sm font-bold text-foreground">
              {cards.length > 0 ? cards.map(formatCard).join(", ") : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Status</p>
            <p className="text-sm font-bold text-foreground">
              {cards.length > 0 ? "IN PLAY" : "WAITING FOR CARDS"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { seatNumber, isSplit, record } = resolveSeatTarget(currentRound, target);
  const enabled = investigation.occupiedSeats.includes(seatNumber);
  const hasSplit = Boolean(currentRound.splitHands[seatNumber]);
  const groupId = investigation.seatPlayerGroups[seatNumber];
  const group = groupId ? investigation.playerGroups[groupId] : undefined;
  const bet = record?.betAmount;
  const cards = record?.playerCards ?? [];
  const status = computeSeatStatusLabel(record);

  return (
    <div
      data-testid="active-seat-panel"
      className="flex-none border-b border-accent-secondary/40 bg-accent-secondary/10 px-3 py-2"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-extrabold tracking-wide text-accent-secondary">
          {word} {seatNumber}
          {group ? ` · ${group.label}` : ""}
        </p>
        {enabled && (
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            aria-label="Seat actions"
            className="tap-target flex shrink-0 items-center gap-1 rounded-md border border-border bg-surface-raised px-2 text-[11px] font-medium text-foreground"
          >
            <MoreVertical className="h-3.5 w-3.5" aria-hidden /> Seat Actions
          </button>
        )}
      </div>

      {hasSplit && (
        <div className="mt-1.5 grid grid-cols-2 gap-1.5" role="group" aria-label={`Select which hand at ${word.toLowerCase()} ${seatNumber} to enter cards for`}>
          <button
            type="button"
            onClick={() => setActiveTarget(seatNumber)}
            aria-pressed={!isSplit}
            data-testid="select-hand-1"
            className={`flex min-h-11 items-center justify-center gap-1 rounded-lg border-2 text-sm font-bold ${
              !isSplit ? "border-accent-secondary bg-accent-secondary text-accent-secondary-foreground" : "border-border bg-surface text-foreground"
            }`}
          >
            {!isSplit && <Check className="h-4 w-4" aria-hidden />} HAND 1
          </button>
          <button
            type="button"
            onClick={() => setActiveTarget(splitTargetFor(seatNumber))}
            aria-pressed={isSplit}
            data-testid="select-hand-2"
            className={`flex min-h-11 items-center justify-center gap-1 rounded-lg border-2 text-sm font-bold ${
              isSplit ? "border-accent-secondary bg-accent-secondary text-accent-secondary-foreground" : "border-border bg-surface text-foreground"
            }`}
          >
            {isSplit && <Check className="h-4 w-4" aria-hidden />} HAND 2
          </button>
        </div>
      )}

      {enabled ? (
        <div className="mt-1.5 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Bet</p>
            <p className="text-xl font-extrabold leading-tight text-foreground">
              {bet != null && bet > 0 ? formatCurrency(bet) : "—"}
            </p>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Cards</p>
            <p className="truncate text-sm font-bold text-foreground">
              {cards.length > 0 ? cards.map(formatCard).join(", ") : "—"}
            </p>
          </div>
          <div className="min-w-0 shrink-0 text-right">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Status</p>
            <p className="truncate text-[11px] font-bold text-foreground">{status}</p>
          </div>
        </div>
      ) : (
        <p className="mt-1 text-[11px] font-medium text-muted-foreground">
          {word[0]}{word.slice(1).toLowerCase()} not enabled — tap it, or say its name, to enable it
        </p>
      )}

      {enabled && (
        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          data-testid="change-bet-button"
          className="tap-target mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent text-sm font-bold text-accent-foreground"
        >
          {bet != null && bet > 0 ? "CHANGE BET" : "SET BET"}
        </button>
      )}

      {enabled && (
        <PlayerDetailSheet open={detailOpen} onClose={() => setDetailOpen(false)} target={target} />
      )}
    </div>
  );
}

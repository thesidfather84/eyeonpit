"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { formatCard } from "@/lib/utils/cards";
import { SeatOptionsSheet } from "./SeatOptionsSheet";

/**
 * Floor Mode's compact play-field summary — the answer to "when the
 * operator talks, one glance confirms what EyeOnPit heard." Deliberately
 * NOT SeatTilesRow/TableMap (the full Surveillance table): no hand totals,
 * blackjack/bust labels, player groups, or AP indicators — just dealer
 * cards, each seat's occupied/empty state, its current wager and cards,
 * and which target is active. Reads only the existing
 * `investigation`/`currentRound`/`activeTarget` state every other
 * live-screen component already uses — no new ledger, no new data model,
 * no state of its own.
 *
 * Tap parity with the full table: tapping the dealer row selects it
 * (setActiveTarget), and tapping ANY seat row — empty or occupied — calls
 * occupySeat, the exact same production path SeatTilesRow's own tap
 * handler uses (it already no-ops to a plain select when the seat is
 * already occupied). An explicit voice target does the same thing (see
 * VoiceControl.tsx) — the compact view and voice entry can never disagree
 * about what "selecting seat 2" means.
 *
 * Edit Mode (AGENTS.md 1.14b §3/§5/§19) — the exact same one-shot pattern
 * TableMap uses, reusing the same SeatOptionsSheet unchanged: a Floor
 * operator needs Mark Empty (player leaves) reachable without turning
 * every ordinary tap into an ambiguous gesture, so it stays a deliberate,
 * momentary mode rather than a per-tile icon.
 *
 * Labels read "SPOT n" (Floor Mode operator usability cleanup) — Floor
 * Mode's visible terminology standard, distinct from Surveillance's "SEAT
 * n" (see ActiveSeatHeader's `terminology` prop and
 * docs/EYEONPIT_PRODUCT_SPEC.md's "Floor Mode Terminology Standard"). This
 * used to read the bare internal seat number ("S3") — an operator should
 * never need to know that "S" is short for the internal `seat` identifier;
 * "SPOT 3" is what a casino-floor observer actually says out loud.
 */
export function FloorPlayField() {
  const { investigation, currentRound, activeTarget, occupySeat, setActiveTarget } = useInvestigationContext();
  const [editMode, setEditMode] = useState(false);
  const [optionsSeat, setOptionsSeat] = useState<number | null>(null);

  const dealerCards = currentRound.dealerHand.cards;
  const isDealerActive = activeTarget === "dealer";

  function handleSeatTap(seat: number) {
    if (editMode) {
      setOptionsSeat(seat);
      setEditMode(false);
      return;
    }
    occupySeat(seat);
  }

  return (
    <div
      className="flex-none border-b border-border bg-surface px-1.5 py-1"
      data-testid="floor-play-field"
    >
      <div className="mb-0.5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setActiveTarget("dealer")}
          aria-label={isDealerActive ? "Dealer, active" : "Dealer"}
          data-testid="floor-dealer"
          style={{ touchAction: "manipulation" }}
          className={`flex min-w-0 flex-1 items-center justify-between rounded-md px-1.5 py-0.5 text-left ${
            isDealerActive ? "bg-accent-secondary/15" : "bg-transparent"
          }`}
        >
          <span
            className={`truncate text-[10px] font-bold leading-none ${
              isDealerActive ? "text-accent-secondary" : "text-dealer"
            }`}
          >
            {isDealerActive ? "ACTIVE · DEALER" : "DEALER"}
          </span>
          <span className="shrink-0 text-[10px] leading-none text-muted-foreground">
            {dealerCards.length > 0 ? dealerCards.map(formatCard).join(" ") : "—"}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setEditMode((v) => !v)}
          aria-label={editMode ? "Exit Edit Mode" : "Edit Spots"}
          aria-pressed={editMode}
          data-testid="floor-edit-mode-toggle"
          style={{ touchAction: "manipulation" }}
          className={`tap-target ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
            editMode
              ? "border-accent bg-accent text-accent-foreground"
              : "border-border bg-surface-raised text-muted-foreground"
          }`}
        >
          <Pencil className="h-3 w-3" aria-hidden />
        </button>
      </div>

      {editMode && (
        <div className="mb-0.5 rounded-md bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold text-accent">
          EDIT MODE — tap a spot for options
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-1.5 gap-y-1 short:grid-cols-4 short:gap-y-0.5">
        {([1, 2, 3, 4, 5, 6, 7] as const).map((seat) => {
          const isOccupied = investigation.occupiedSeats.includes(seat);
          const isActive = activeTarget === seat;
          const record = currentRound.seats[seat];
          const cards = record?.playerCards ?? [];
          const bet = record?.betAmount;
          const hasBet = isOccupied && bet != null && bet > 0;

          // Occupancy/active state (AGENTS.md 1.14b UX correction round §6)
          // — never color alone: EMPTY keeps a dashed outline and no fill,
          // OCCUPIED gets a solid border AND a filled background, ACTIVE
          // additionally gets the thicker 2px border it already had. Seat
          // number stays the largest, boldest text in the tile.
          const toneClasses = isActive
            ? "border-2 border-accent-secondary bg-accent-secondary/15"
            : isOccupied
              ? "border border-status-green/70 bg-status-green/10"
              : "border border-dashed border-border/60 bg-transparent";

          return (
            <button
              key={seat}
              type="button"
              onClick={() => handleSeatTap(seat)}
              aria-label={
                editMode
                  ? `Spot ${seat} options`
                  : isActive
                    ? `Spot ${seat}, active${hasBet ? `, bet $${bet}` : ""}`
                    : isOccupied
                      ? `Spot ${seat}, occupied${hasBet ? `, bet $${bet}` : ""}`
                      : `Spot ${seat}, empty`
              }
              data-testid={`floor-seat-${seat}`}
              style={{ touchAction: "manipulation" }}
              className={`flex min-w-0 flex-col gap-0 rounded-md px-1.5 py-1 text-left short:py-0.5 ${toneClasses} ${
                editMode ? "outline outline-2 outline-offset-1 outline-accent" : ""
              }`}
            >
              <span
                className={`truncate text-xs font-extrabold leading-none short:text-[11px] ${
                  isActive ? "text-accent-secondary" : isOccupied ? "text-status-green" : "text-muted-foreground"
                }`}
              >
                {isActive ? `ACTIVE · SPOT ${seat}` : `SPOT ${seat}`}
              </span>
              {isOccupied ? (
                <>
                  <span className={`text-sm font-extrabold leading-tight ${hasBet ? "text-foreground" : "text-muted-foreground"}`}>
                    {hasBet ? `$${bet}` : "NO BET"}
                  </span>
                  <span className="truncate text-[10px] leading-none text-muted-foreground">
                    {cards.length > 0 ? cards.map(formatCard).join(" ") : "—"}
                  </span>
                </>
              ) : (
                <span className="text-[10px] leading-none text-muted-foreground">EMPTY</span>
              )}
            </button>
          );
        })}
      </div>

      {optionsSeat != null && (
        <SeatOptionsSheet seatNumber={optionsSeat} onClose={() => setOptionsSeat(null)} />
      )}
    </div>
  );
}

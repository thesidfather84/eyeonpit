"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { computeApLikelihoodBySeat } from "@/lib/analysis/apLikelihood";
import { computeHandTotal, isAutoDetectedBlackjack } from "@/lib/utils/blackjackTotal";
import { formatCard } from "@/lib/utils/cards";
import {
  ARCH_SEAT_NUMBERS,
  isPosition7Enabled,
  legacyOverflowSeatNumbersFor,
} from "@/lib/utils/seats";
import { splitTargetFor } from "@/lib/utils/seatTarget";
import { seatRingFor } from "@/lib/utils/seatGroupColor";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import type { CardTarget } from "@/contexts/InvestigationContext";
import { useSettingsStore } from "@/store/useSettingsStore";
import { SeatOptionsSheet } from "./SeatOptionsSheet";
import { ManageSeatsSheet } from "./ManageSeatsSheet";

const AP_DOT_CLASSES: Record<string, string> = {
  low: "bg-status-green/70",
  moderate: "bg-status-orange/70",
  elevated: "bg-destructive/80",
};

/** Per-column vertical offset (px) that bows positions 1-6 into an arch, concave toward the dealer — middle positions sit furthest from the dealer, end positions nearest, matching a real table's curved rail. Scaled down from the original [14,6,0,0,6,14] alongside the shorter tiles below — same curve, smaller footprint. */
const ARCH_TRANSLATE_Y = [9, 4, 0, 0, 4, 9];

interface SeatTilesRowProps {
  /** Owned by TableMap. While true, a tap on any seat opens its SeatOptionsSheet instead of selecting/occupying it. */
  editMode: boolean;
  /** Called the instant a tap-while-editing actually opens a seat's options sheet — TableMap uses this to exit Edit Mode immediately, one-shot. */
  onSeatOptionsOpened: () => void;
}

/**
 * Player seats — six permanent positions in a dealer's-eye-view arch, plus
 * an optional Position 7 centered beneath it. Tiles never shift, rise, or
 * curve for any reason *within a position* — the arch shape comes from each
 * column's fixed offset, not from tile state. Three signals stay visually
 * separate on every tile: enabled/occupied (green border), active
 * card-entry target (cyan border, overrides green when both apply), and
 * player grouping (a ring color + optional letter badge, unrelated to
 * either). A fourth, Edit Mode's accent outline, layers on top of all of
 * them without touching any of that existing border logic.
 *
 * A single tap is the tile's one and only primary action in normal
 * operation — occupySeat() already no-ops to a plain select when the seat
 * is already occupied, so one plain `onClick` correctly covers both "sit a
 * new player down" and "make this the active card-entry target" with no
 * gesture ambiguity. Marking a seat empty, linking/unlinking, and every
 * other secondary action live exclusively behind Edit Mode (see TableMap)
 * or the "Manage Seats" list — never behind a per-tile icon button, a
 * long-press, or a double-tap on the tile body, all of which too easily
 * misfired during fast, repeated entry taps.
 */
export function SeatTilesRow({ editMode, onSeatOptionsOpened }: SeatTilesRowProps) {
  const {
    investigation,
    currentRound,
    activeTarget,
    occupySeat,
    setActiveTarget,
    cardEvents,
  } = useInvestigationContext();
  const showGroupLabels = useSettingsStore((s) => s.showGroupLabels);
  const apBySeat = computeApLikelihoodBySeat(investigation, cardEvents, currentRound.shoeNumber);
  const position7Enabled = isPosition7Enabled(investigation);
  const legacySeats = legacyOverflowSeatNumbersFor(investigation, currentRound);
  const [optionsSeat, setOptionsSeat] = useState<number | null>(null);
  const [manageOpen, setManageOpen] = useState(false);

  function handleTap(seat: number) {
    if (editMode) {
      setOptionsSeat(seat);
      onSeatOptionsOpened();
      return;
    }
    occupySeat(seat);
  }

  function renderSeat(seat: number) {
    const isOccupied = investigation.occupiedSeats.includes(seat);
    const isActive = activeTarget === (seat as CardTarget);
    const record = currentRound.seats[seat];
    const splitRecord = currentRound.splitHands[seat];
    const isSplitActive = activeTarget === splitTargetFor(seat);
    const ap = apBySeat[seat];
    const total =
      record && record.playerCards.length > 0 ? computeHandTotal(record.playerCards) : null;
    const isBlackjack = record ? isAutoDetectedBlackjack(record.playerCards) : false;

    const groupId = investigation.seatPlayerGroups[seat];
    const group = groupId ? investigation.playerGroups[groupId] : undefined;
    const linkedSeatNumbers = groupId
      ? Object.entries(investigation.seatPlayerGroups)
          .filter(([, gId]) => gId === groupId)
          .map(([s]) => Number(s))
          .sort((a, b) => a - b)
      : [];
    const spotIndex = linkedSeatNumbers.indexOf(seat) + 1;
    const spotCount = linkedSeatNumbers.length;
    const ring = seatRingFor(isOccupied, spotCount, groupId);

    // Off: muted neutral. Enabled/occupied: green. Active: cyan,
    // always wins over green so "both enabled and active" stays
    // visibly distinct from "enabled only" — never merged into one
    // in-between color.
    let toneClasses = "border-dashed border-border/60 bg-transparent text-muted-foreground";
    if (isOccupied) {
      toneClasses = "border-status-green bg-status-green/10 text-foreground";
    }
    if (isActive) {
      toneClasses = "border-accent-secondary bg-accent-secondary/10 text-foreground";
    }

    return (
            <div
              key={seat}
              role="button"
              tabIndex={0}
              aria-label={editMode ? `Spot ${seat} options` : `Spot ${seat}`}
              onClick={() => handleTap(seat)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") handleTap(seat);
              }}
              style={{
                touchAction: "manipulation",
                boxShadow: ring ? `0 0 0 2px ${ring.color}` : undefined,
              }}
              className={`relative flex min-h-[38px] flex-col justify-center gap-0 rounded-xl py-0.5 pl-2 pr-1 transition-shadow duration-200 short:min-h-[52px] ${toneClasses} ${
                isActive ? "border-2" : "border"
              } ${editMode ? "outline outline-2 outline-offset-2 outline-accent" : ""}`}
            >
              {ring && showGroupLabels && ring.letter && (
                <span
                  className="absolute -left-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
                  style={{ backgroundColor: ring.color }}
                  aria-label={`Linked player group ${ring.letter}`}
                >
                  {ring.letter}
                </span>
              )}

              {isOccupied && !isActive && ap && (
                <span
                  className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${AP_DOT_CLASSES[ap.level]}`}
                  aria-hidden
                />
              )}

              <span className="text-[10px] font-bold leading-none">
                {isActive ? `ACTIVE · SPOT ${seat}` : `SPOT ${seat}`}
              </span>

              {isOccupied ? (
                <>
                  <span className="flex items-center gap-1 text-[10px] font-medium leading-none text-muted-foreground">
                    {spotCount > 1 && <Users className="h-2.5 w-2.5 flex-none" aria-hidden />}
                    <span className="truncate">
                      {group?.label ?? ""}
                      {spotCount > 1 ? ` · ${spotIndex} OF ${spotCount}` : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 text-sm font-semibold leading-none">
                    {record?.betAmount != null ? `$${record.betAmount}` : "—"}
                    {record?.doubled && (
                      <span className="rounded bg-pending/20 px-1 text-[8px] font-bold text-pending">2X</span>
                    )}
                    {(record?.insuranceAmount ?? 0) > 0 && (
                      <span className="rounded bg-accent/20 px-1 text-[8px] font-bold text-accent">INS</span>
                    )}
                  </span>
                  <span className="text-[10px] leading-none">
                    {record && record.playerCards.length > 0
                      ? record.playerCards.map(formatCard).join(" · ")
                      : " "}
                  </span>
                  <span
                    className={`text-[10px] font-medium leading-none ${total?.bust ? "text-dealer" : ""}`}
                  >
                    {isBlackjack
                      ? "BLACKJACK"
                      : total
                        ? `${total.bust ? "BUST " : total.soft ? "S" : ""}${total.value}`
                        : " "}
                  </span>
                </>
              ) : (
                <span className="text-[10px] leading-none text-muted-foreground">EMPTY</span>
              )}

              {splitRecord && (
                <button
                  type="button"
                  aria-label={`Spot ${seat} split hand`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveTarget(splitTargetFor(seat));
                  }}
                  className={`absolute bottom-0.5 left-0.5 flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold ${
                    isSplitActive
                      ? "bg-accent-secondary text-accent-secondary-foreground"
                      : "bg-surface-raised text-muted-foreground"
                  }`}
                >
                  H2
                </button>
              )}
            </div>
    );
  }

  return (
    <div className="flex-none bg-surface px-1 pb-1 short:flex short:h-full short:min-h-0 short:flex-1 short:flex-col short:justify-center short:pb-0">
      {/* Positions 1-6: a fixed arch, numbered left to right exactly as the
          dealer sees them, bowed concave toward the dealer below. In
          `short:` (landscape) the arch flattens into a plain 3x2 grid
          instead — a curve reads fine in a tall narrow column, but in a
          short wide one it just makes labels overlap between rows; a flat
          grid scans better at that aspect ratio. Seat numbering/order never
          changes, only the offset that's applied to it. */}
      <div className="grid grid-cols-6 gap-x-1 gap-y-0 pt-2.5 short:grid-cols-3 short:grid-rows-2 short:items-start short:gap-1.5 short:pt-0">
        {ARCH_SEAT_NUMBERS.map((seat, i) => (
          <div
            key={seat}
            className="short:!translate-y-0"
            style={{ transform: `translateY(${ARCH_TRANSLATE_Y[i]}px)` }}
          >
            {renderSeat(seat)}
          </div>
        ))}
      </div>

      {/* Position 7: optional, centered beneath the arch. Turning it off removes only this slot — positions 1-6 above are untouched. */}
      {position7Enabled && (
        <div className="mx-auto mt-1 w-1/3 min-w-[84px] short:mt-0.5 short:w-1/4 short:min-w-[64px] short:flex-none">
          {renderSeat(7)}
        </div>
      )}

      {/* Legacy positions 8-10: only ever present on investigations set up before the 6+1 arch existed. Never hidden or discarded — shown here, clearly labeled, so recorded data stays reachable. */}
      {legacySeats.length > 0 && (
        <div className="mt-2 rounded-lg border border-pending/40 bg-pending/10 p-1.5 short:hidden">
          <p className="mb-1 text-[10px] font-semibold text-pending">
            Legacy table layout — position{legacySeats.length > 1 ? "s" : ""} {legacySeats.join(", ")}{" "}
            predate the 6+1 arch. Recorded data is preserved below, not hidden.
          </p>
          <div className="grid grid-cols-4 gap-x-1 gap-y-0">{legacySeats.map((seat) => renderSeat(seat))}</div>
        </div>
      )}

      {/* Reachable from the table map in portrait; in `short:` the column
          has no spare row for it, but every action it opens (add/remove
          seats, position 7 toggle) is still reachable per-seat via Edit
          Mode (see TableMap) or a row inside this same sheet. */}
      <button
        onClick={() => setManageOpen(true)}
        className="mt-1 rounded-md px-2 text-[10px] font-medium text-muted-foreground hover:text-foreground short:hidden"
      >
        Manage Spots
      </button>

      {optionsSeat != null && (
        <SeatOptionsSheet seatNumber={optionsSeat} onClose={() => setOptionsSeat(null)} />
      )}
      {manageOpen && <ManageSeatsSheet onClose={() => setManageOpen(false)} />}
    </div>
  );
}

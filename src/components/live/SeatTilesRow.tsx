"use client";

import { useRef, useState } from "react";
import { MoreVertical, Users } from "lucide-react";
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
import { seatHasCurrentRoundData } from "@/lib/db/repositories/investigations";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SeatOptionsSheet } from "./SeatOptionsSheet";
import { ManageSeatsSheet } from "./ManageSeatsSheet";

const LONG_PRESS_MS = 500;
const DOUBLE_TAP_MS = 300;

const AP_DOT_CLASSES: Record<string, string> = {
  low: "bg-status-green/70",
  moderate: "bg-status-orange/70",
  elevated: "bg-destructive/80",
};

/** Per-column vertical offset (px) that bows positions 1-6 into an arch, concave toward the dealer — middle positions sit furthest from the dealer, end positions nearest, matching a real table's curved rail. Scaled down from the original [14,6,0,0,6,14] alongside the shorter tiles below — same curve, smaller footprint. */
const ARCH_TRANSLATE_Y = [9, 4, 0, 0, 4, 9];

/**
 * Player seats — six permanent positions in a dealer's-eye-view arch, plus
 * an optional Position 7 centered beneath it. Tiles never shift, rise, or
 * curve for any reason *within a position* — the arch shape comes from each
 * column's fixed offset, not from tile state. Three signals stay visually
 * separate on every tile: enabled/occupied (green border), active
 * card-entry target (cyan border, overrides green when both apply), and
 * player grouping (a ring color + optional letter badge, unrelated to
 * either). A single tap only ever changes which target is active — it
 * never enables or disables a seat, and never implies an entry order:
 * any position can be selected and entered in any order. Enabling/disabling
 * takes a deliberate double-tap (or the long-press/⋮ options menu, which
 * also offers it alongside link/unlink/label).
 */
export function SeatTilesRow() {
  const {
    investigation,
    currentRound,
    activeTarget,
    occupySeat,
    markSeatEmpty,
    selectSeat,
    setActiveTarget,
    cardEvents,
  } = useInvestigationContext();
  const showGroupLabels = useSettingsStore((s) => s.showGroupLabels);
  const apBySeat = computeApLikelihoodBySeat(investigation, cardEvents, currentRound.shoeNumber);
  const position7Enabled = isPosition7Enabled(investigation);
  const legacySeats = legacyOverflowSeatNumbersFor(investigation, currentRound);
  const [optionsSeat, setOptionsSeat] = useState<number | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [disableConfirmSeat, setDisableConfirmSeat] = useState<number | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const lastTapRef = useRef<{ seat: number; time: number } | null>(null);

  function startPress(seat: number) {
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setOptionsSeat(seat);
    }, LONG_PRESS_MS);
  }

  function toggleEnabled(seat: number) {
    if (investigation.occupiedSeats.includes(seat)) {
      if (seatHasCurrentRoundData(currentRound, seat)) {
        setDisableConfirmSeat(seat);
      } else {
        markSeatEmpty(seat);
      }
    } else {
      occupySeat(seat);
    }
  }

  function endPress(seat: number) {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    if (longPressed.current) return;

    // endPress only ever runs from a pointerup event handler, never during
    // render — the purity rule can't see that from the closure alone, so
    // this is a real false positive, not an actual impurity.
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && last.seat === seat && now - last.time < DOUBLE_TAP_MS) {
      lastTapRef.current = null;
      toggleEnabled(seat);
      return;
    }
    lastTapRef.current = { seat, time: now };
    // A single tap only ever selects — it never occupies or unoccupies.
    selectSeat(seat);
  }

  function cancelPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
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
              onPointerDown={() => startPress(seat)}
              onPointerUp={() => endPress(seat)}
              onPointerLeave={cancelPress}
              onContextMenu={(e) => e.preventDefault()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") endPress(seat);
              }}
              style={{
                touchAction: "manipulation",
                boxShadow: ring ? `0 0 0 2px ${ring.color}` : undefined,
              }}
              className={`relative flex min-h-[38px] flex-col justify-center gap-0 rounded-xl py-0.5 pl-2 pr-1 transition-shadow duration-200 short:min-h-[52px] ${toneClasses} ${
                isActive ? "border-2" : "border"
              }`}
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

              <button
                type="button"
                aria-label={`Seat ${seat} options`}
                onClick={(e) => {
                  e.stopPropagation();
                  cancelPress();
                  setOptionsSeat(seat);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <MoreVertical className="h-3.5 w-3.5" aria-hidden />
              </button>

              <span className="text-[10px] font-bold leading-none">
                {isActive ? `ACTIVE · SEAT ${seat}` : `SEAT ${seat}`}
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
                  aria-label={`Seat ${seat} split hand`}
                  onClick={(e) => {
                    e.stopPropagation();
                    cancelPress();
                    setActiveTarget(splitTargetFor(seat));
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
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
          seats, position 7 toggle) is still reachable per-seat via the ⋮
          options menu on each tile. */}
      <button
        onClick={() => setManageOpen(true)}
        className="mt-1 rounded-md px-2 text-[10px] font-medium text-muted-foreground hover:text-foreground short:hidden"
      >
        Manage Seats
      </button>

      {optionsSeat != null && (
        <SeatOptionsSheet seatNumber={optionsSeat} onClose={() => setOptionsSeat(null)} />
      )}
      {manageOpen && <ManageSeatsSheet onClose={() => setManageOpen(false)} />}

      <ConfirmDialog
        open={disableConfirmSeat != null}
        title="Disable this seat?"
        message={`Seat ${disableConfirmSeat} contains a bet or hand data. Disable this seat?`}
        confirmLabel="Disable Seat"
        destructive
        onConfirm={() => {
          if (disableConfirmSeat != null) markSeatEmpty(disableConfirmSeat);
          setDisableConfirmSeat(null);
        }}
        onCancel={() => setDisableConfirmSeat(null)}
      />
    </div>
  );
}

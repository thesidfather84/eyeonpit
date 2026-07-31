"use client";

import { useRef, useState } from "react";
import { MoreVertical, Users } from "lucide-react";
import { computeApLikelihoodBySeat } from "@/lib/analysis/apLikelihood";
import { computeHandTotal, isAutoDetectedBlackjack } from "@/lib/utils/blackjackTotal";
import { formatCard } from "@/lib/utils/cards";
import { seatNumbersFor } from "@/lib/utils/seats";
import { splitTargetFor } from "@/lib/utils/seatTarget";
import { seatRingFor } from "@/lib/utils/seatGroupColor";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import type { CardTarget } from "@/contexts/InvestigationContext";
import { useSettingsStore } from "@/store/useSettingsStore";
import { seatHasCurrentRoundData } from "@/lib/db/repositories/investigations";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SeatOptionsSheet } from "./SeatOptionsSheet";
import { ManageSeatsSheet } from "./ManageSeatsSheet";
import { DealerTile } from "./DealerTile";

const LONG_PRESS_MS = 500;
const DOUBLE_TAP_MS = 300;

const AP_DOT_CLASSES: Record<string, string> = {
  low: "bg-status-green/70",
  moderate: "bg-status-orange/70",
  elevated: "bg-destructive/80",
};

/**
 * Player seats — a fixed, flat 4-column grid; tiles never shift, rise, or
 * curve for any reason, selected or not. Three signals stay visually
 * separate on every tile: enabled/occupied (green border), active
 * card-entry target (cyan border, overrides green when both apply), and
 * player grouping (a ring color + optional letter badge, unrelated to
 * either). A single tap only ever changes which target is active — it
 * never enables or disables a seat. Enabling/disabling takes a deliberate
 * double-tap (or the long-press/⋮ options menu, which also offers it
 * alongside link/unlink/label).
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
  const seats = seatNumbersFor(investigation);
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

  return (
    <div className="flex-none bg-surface px-1">
      <div className="grid grid-cols-4 gap-x-1 gap-y-0">
        {seats.map((seat) => {
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
              className={`tap-target relative flex min-h-[48px] flex-col justify-center gap-0 rounded-xl py-0.5 pl-2 pr-1 transition-shadow duration-200 ${toneClasses} ${
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
                      ? `${record.playerCards.map(formatCard).join(" · ")} · ${record.playerCards.length} Cards`
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
        })}

        <DealerTile />
      </div>

      <button
        onClick={() => setManageOpen(true)}
        className="rounded-md px-2 text-[10px] font-medium text-muted-foreground hover:text-foreground"
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

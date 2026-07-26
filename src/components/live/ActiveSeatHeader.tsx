"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";

/**
 * The one place that states, unambiguously, what the keypad and every
 * action row below it currently apply to — matching the active seat's
 * outline on the tile above. Format: "ACTIVE — SEAT 2 / PLAYER A · SPOT 2
 * OF 2 / BET $50". Never confusable with mere occupancy, which has no
 * strong border and no "ACTIVE" label anywhere.
 */
export function ActiveSeatHeader({ seatNumber }: { seatNumber: number }) {
  const { investigation, currentRound } = useInvestigationContext();

  const record = currentRound.seats[seatNumber];
  const groupId = investigation.seatPlayerGroups[seatNumber];
  const group = groupId ? investigation.playerGroups[groupId] : undefined;
  const linkedSeatNumbers = groupId
    ? Object.entries(investigation.seatPlayerGroups)
        .filter(([, gId]) => gId === groupId)
        .map(([s]) => Number(s))
        .sort((a, b) => a - b)
    : [];
  const spotIndex = linkedSeatNumbers.indexOf(seatNumber) + 1;
  const spotCount = linkedSeatNumbers.length;
  const bet = record?.betAmount;

  const parts = [
    `SEAT ${seatNumber}`,
    group ? `${group.label}${spotCount > 1 ? ` · SPOT ${spotIndex} OF ${spotCount}` : ""}` : null,
    `BET ${bet != null ? `$${bet}` : "—"}`,
  ].filter(Boolean);

  return (
    <div className="flex-none border-b border-accent-secondary/40 bg-accent-secondary/10 px-2 py-1">
      <span className="text-[11px] font-bold tracking-wide text-accent-secondary">
        ACTIVE — {parts.join(" / ")}
      </span>
    </div>
  );
}

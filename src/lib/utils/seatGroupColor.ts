/**
 * Deterministic color (and accessibility letter) per player group, derived
 * from the group's id — never stored, so no schema change and no risk of
 * two devices disagreeing about "which color is group A" after a reload.
 * Same groupId always maps to the same palette entry.
 */

const GROUP_RING_PALETTE: { color: string; letter: string }[] = [
  { color: "#3b82f6", letter: "A" }, // blue
  { color: "#a855f7", letter: "B" }, // purple
  { color: "#f97316", letter: "C" }, // orange
  { color: "#ec4899", letter: "D" }, // pink
  { color: "#14b8a6", letter: "E" }, // teal
  { color: "#eab308", letter: "F" }, // yellow
];

/** A solo occupied seat (not linked to any other seat) — the default "tracked" ring. */
export const ACTIVE_SEAT_RING_COLOR = "#22c55e"; // green

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function groupRingStyle(groupId: string): { color: string; letter: string } {
  return GROUP_RING_PALETTE[hashString(groupId) % GROUP_RING_PALETTE.length];
}

/**
 * The one function seat tiles need: null for an empty/untracked seat, green
 * for a solo occupied seat, or the seat's linked-group color/letter when 2+
 * seats share a player group.
 */
export function seatRingFor(
  isOccupied: boolean,
  spotCount: number,
  groupId: string | undefined
): { color: string; letter: string | null } | null {
  if (!isOccupied) return null;
  if (spotCount > 1 && groupId) {
    const { color, letter } = groupRingStyle(groupId);
    return { color, letter };
  }
  return { color: ACTIVE_SEAT_RING_COLOR, letter: null };
}

/**
 * Formats the "BJ-YYYYMMDD" prefix for a given investigation date.
 *
 * Takes the ISO date string ("2026-07-25") directly rather than a Date
 * object — going through `new Date(isoString)` and back invites timezone
 * rollover bugs (UTC midnight can format as the previous day in negative
 * offsets). The investigation date is already in the right shape; this just
 * strips the dashes.
 */
export function investigationIdDatePrefix(isoDate: string): string {
  return `BJ-${isoDate.replaceAll("-", "")}`;
}

/**
 * Generates the next display ID for a given investigation date, given how
 * many investigations already exist locally for that date.
 *
 * `displayId` is provisional, not a global unique key — see plan.md §3.
 * It's generated purely from on-device state, so it is NOT collision-proof
 * across multiple devices working offline on the same day. The true unique
 * key is always `Investigation.localId` (a uuid); nothing in this app treats
 * `displayId` as a primary key. A future sync backend is what would assign
 * canonical, collision-free display IDs across devices.
 */
export function generateInvestigationId(
  isoDate: string,
  existingCountForDate: number
): string {
  const sequence = existingCountForDate + 1;
  const padded = String(sequence).padStart(5, "0");
  return `${investigationIdDatePrefix(isoDate)}-${padded}`;
}

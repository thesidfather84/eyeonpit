/** Zero must render as "0", not be swallowed by a falsy check — never `value && ...` / `value || ""` / `value ? ... : null` here. Shared by every visual and spoken surface that shows a count value, so the sign convention can never drift between them. */
export function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/** Unbalanced systems (KO) have no meaningful true count — never fabricate one by falling back to 0 or to the running count. Rounding happens only in roundTrueCountForDisplay (calculateTrueCount.ts) — this only formats an already-rounded value. */
export function formatTrueCount(roundedValue: number | null): string {
  return roundedValue == null ? "N/A" : formatSigned(roundedValue);
}

/**
 * Display-only wager formatting — "$10,000", never "$10000". The
 * underlying monetary representation (a plain number, dollars, no cents)
 * is completely unchanged; this is the one place that formatting happens
 * for on-screen display. Never used for persistence or math.
 */
export function formatCurrency(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

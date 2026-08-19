import { toBcp47, type Locale } from "./locale";

/**
 * PRIORITY 1.8-4 — locale-aware data presentation. Every function here
 * wraps the browser/Node's own built-in `Intl` APIs — never a hand-rolled
 * formatter — and takes a plain, already-canonical value (an ISO
 * timestamp, a plain number, a ledger amount) and returns a
 * DISPLAY-ONLY string. "Do not localize canonical stored values" (this
 * priority's own rule): nothing here ever writes back to or replaces a
 * stored value — `Investigation`/`Report`/`CardEvent` fields, Dexie keys,
 * and every canonical ID stay exactly as recorded regardless of which
 * locale a viewer has selected.
 */

export function formatDate(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(toBcp47(locale), { dateStyle: "medium" }).format(date);
}

export function formatDateTime(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(toBcp47(locale), { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function formatNumber(value: number, locale: Locale, fractionDigits?: number): string {
  return new Intl.NumberFormat(toBcp47(locale), {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatCurrency(amount: number, currencyCode: string, locale: Locale): string {
  return new Intl.NumberFormat(toBcp47(locale), { style: "currency", currency: currencyCode }).format(amount);
}

/** A signed count/correlation figure (e.g. "+3", "-1.5") — locale-aware sign/decimal handling via Intl's own `signDisplay`, matching the existing (non-localized) `formatSigned` convention in lib/utils/countFormatting.ts conceptually, without touching that file. */
export function formatSignedNumber(value: number, locale: Locale, fractionDigits?: number): string {
  return new Intl.NumberFormat(toBcp47(locale), {
    signDisplay: "exceptZero",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/**
 * Deep Eye's diagnostic shape — deliberately independent of the counting
 * engine's own types (imports FROM lib/counting-engine and lib/db, never
 * the other way around). A diagnostic never mutates anything it inspects;
 * every function in this directory takes already-loaded data (Investigation,
 * CardEvent[]) and returns a report. None of them touch Dexie, React, or
 * the live screen.
 */

export type DiagnosticStatus = "pass" | "warn" | "fail";

export interface DiagnosticCheck {
  /** Stable, kebab-case — used as a React key and referenced by tests, never shown to the operator directly. */
  id: string;
  /** Short operator-facing label, e.g. "Sequence numbers contiguous". */
  label: string;
  status: DiagnosticStatus;
  /** One sentence explaining the result — always present, even for "pass" (what was actually verified, not just that it was fine). */
  detail: string;
}

export interface DiagnosticReport {
  /** false the instant any check is "fail" — "warn" alone does not fail the report (see each diagnostic's own doc comment for what it uses "warn" for). */
  ok: boolean;
  checks: DiagnosticCheck[];
}

/** Rolls a list of checks into a report — the one place "ok" is decided, so every diagnostic module defines the same thing by "ok". */
export function buildReport(checks: DiagnosticCheck[]): DiagnosticReport {
  return { ok: !checks.some((c) => c.status === "fail"), checks };
}

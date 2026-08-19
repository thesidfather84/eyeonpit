import type { Investigation } from "@/types/investigation";

/**
 * PRIORITY 1.9-2/4/5 — the investigation lifecycle rule. EyeOnPit's
 * operational entry point must distinguish four states an operator
 * actually experiences:
 *
 *   READY      — no genuinely active/paused investigation exists.
 *   ACTIVE     — `Investigation.status === "active"`.
 *   PAUSED     — `Investigation.status === "paused"`.
 *   COMPLETED  — `Investigation.status === "closed"` — historical, never
 *                the current operational workspace again.
 *
 * No new status values were added — `types/investigation.ts`'s existing
 * `InvestigationStatus` ("draft" | "active" | "paused" | "closed") already
 * covers this exactly (`"draft"` is a defensive repository default that no
 * real UI path ever produces — every launch path explicitly passes
 * `status: "active"` — so it is not a reachable operational state and
 * needs no special handling here).
 *
 * What WAS missing, and what this file exists to fix: the app never
 * distinguished "an investigation was touched moments ago, safe to jump
 * straight back into" from "an investigation has been sitting
 * active/paused for a long time and silently auto-resuming it would be
 * choosing stale data for the operator." This file is that judgment,
 * expressed as one pure, tested function — see
 * `docs/EYEONPIT_1_9_OPERATOR_LIFECYCLE.md` for the full root-cause
 * writeup.
 */

/**
 * How long an active/paused investigation is treated as "this session, no
 * question asked" — long enough to survive a refresh, a crashed tab, or a
 * device restart mid-shift without ever making the operator confirm
 * anything (Priority 4's own requirement), short enough that an
 * investigation left active/paused across a shift change is never
 * silently re-entered as if it were still being worked. 12 hours comfortably
 * covers a single shift (including a short break) while still catching
 * "this was left open days ago."
 */
export const ACTIVE_INVESTIGATION_FRESHNESS_WINDOW_MS = 12 * 60 * 60 * 1000;

export type ActiveInvestigationResolution =
  | { kind: "none" }
  | { kind: "fresh"; investigation: Investigation }
  | { kind: "recoverable"; investigation: Investigation; otherCandidateCount: number };

function isFresh(investigation: Investigation, now: number): boolean {
  const updatedAt = Date.parse(investigation.updatedAt);
  if (Number.isNaN(updatedAt)) return false; // malformed timestamp — never trust it as fresh
  return now - updatedAt <= ACTIVE_INVESTIGATION_FRESHNESS_WINDOW_MS;
}

/**
 * The single source of truth for "what should the app do when it opens."
 * Pure — takes the full investigation list and the current time, returns a
 * classification, touches no storage/router/state itself.
 *
 * - Zero active/paused investigations -> `"none"` (clean READY state).
 * - Exactly ONE active/paused investigation, updated within the freshness
 *   window -> `"fresh"` (safe to silently resume — refresh/crash/tab-close
 *   recovery stays instant, exactly as before this file existed).
 * - Anything else with at least one candidate — a single STALE
 *   investigation, or more than one active/paused investigation at once
 *   (itself a sign one was forgotten, never a normal single-operator
 *   state) -> `"recoverable"`, naming the most-recently-updated one as the
 *   one to offer resuming, WITHOUT silently entering it. "If state is
 *   ambiguous: offer RESUME or START NEW. Do not silently choose stale
 *   data" (Priority 5's own words) — multiple simultaneous candidates is
 *   exactly that ambiguity.
 *
 * A `"closed"` investigation is never a candidate at all — filtered out
 * before this function is even reached (see `listInvestigations`'s status
 * filter usage at the call site), so completed work can never resurface
 * here by construction.
 */
export function resolveActiveInvestigationState(
  candidates: Investigation[],
  now: number = Date.now()
): ActiveInvestigationResolution {
  if (candidates.length === 0) return { kind: "none" };

  const sorted = [...candidates].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const mostRecent = sorted[0];

  if (candidates.length === 1 && isFresh(mostRecent, now)) {
    return { kind: "fresh", investigation: mostRecent };
  }

  return { kind: "recoverable", investigation: mostRecent, otherCandidateCount: candidates.length - 1 };
}

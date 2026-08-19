"use client";

import { useState } from "react";
import { useInvestigationLifecycleState } from "@/hooks/useInvestigationLifecycleState";
import { InvestigationConsole } from "./InvestigationConsole";
import { EmptyConsole } from "./EmptyConsole";
import { ResumeOrNewScreen } from "./ResumeOrNewScreen";

/**
 * PRIORITY 1.9-2/3/4/5 — the app's single entry point, and the one place
 * the READY/ACTIVE/PAUSED/COMPLETED lifecycle rule is enforced (see
 * `docs/EYEONPIT_1_9_OPERATOR_LIFECYCLE.md`). Discovers whatever
 * investigation is currently active/paused on this device and classifies
 * it via `useInvestigationLifecycleState` (`lib/investigationLifecycle.ts`):
 *
 * - `"fresh"` — touched within the freshness window (see that file's own
 *   doc comment) — shows its console directly, no confirmation step, EXACTLY
 *   as before this priority: refresh/crash/tab-close recovery stays instant.
 * - `"recoverable"` — a stale investigation, or more than one active/paused
 *   at once — shows `ResumeOrNewScreen` instead of silently entering it.
 * - `"none"` — the clean READY state (`EmptyConsole`), unchanged.
 *
 * A CLOSED investigation is never a candidate here at all (filtered out
 * before this component ever sees it) — completed work can never resurface
 * as the operational workspace by construction, satisfying "a completed
 * investigation must never remain the operational working state."
 */
export function ConsoleShell() {
  const { resolution, loading } = useInvestigationLifecycleState();
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
  const [resumeOverrideId, setResumeOverrideId] = useState<string | null>(null);
  const [startingNew, setStartingNew] = useState(false);

  const activeId =
    justCreatedId ??
    resumeOverrideId ??
    (resolution?.kind === "fresh" ? resolution.investigation.localId : null);

  if (activeId) {
    return <InvestigationConsole investigationId={activeId} />;
  }

  if (loading) {
    return <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  if (resolution?.kind === "recoverable" && !startingNew) {
    return (
      <ResumeOrNewScreen
        investigation={resolution.investigation}
        otherCandidateCount={resolution.otherCandidateCount}
        onResume={() => setResumeOverrideId(resolution.investigation.localId)}
        onStartNew={() => setStartingNew(true)}
      />
    );
  }

  return <EmptyConsole onCreated={setJustCreatedId} />;
}

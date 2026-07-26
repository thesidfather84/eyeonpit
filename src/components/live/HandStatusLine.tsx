"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { computeWorkflowStatus } from "@/lib/utils/workflowStatus";

/** Compact "Status: ..." line in the sticky header — the fourth-highest priority item on screen, right after active seat/dealer, cards, and card entry. */
export function HandStatusLine() {
  const { investigation, currentRound } = useInvestigationContext();
  const status = computeWorkflowStatus(investigation, currentRound);

  return (
    <div className="flex-none border-b border-border bg-surface px-2 py-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Status </span>
      <span className="text-[11px] font-medium text-foreground">{status.message}</span>
    </div>
  );
}

"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { useSettingsStore } from "@/store/useSettingsStore";
import { computeWorkflowStatus } from "@/lib/utils/workflowStatus";

/**
 * A quiet, always-passive status line — never a chatbot, never a popup,
 * never blocks input. It just states the next logical step based on
 * current investigation state, the way an experienced surveillance
 * trainer would point something out without taking the controls. Off
 * hides it entirely; Basic shows the short message; Guided adds a fuller
 * explanation underneath for operators still learning the workflow.
 */
export function OperatorAssistantBar() {
  const { investigation, currentRound } = useInvestigationContext();
  const workflowAssistance = useSettingsStore((s) => s.workflowAssistance);

  if (workflowAssistance === "off") return null;

  const status = computeWorkflowStatus(investigation, currentRound);

  return (
    <div className="flex-none border-t border-border bg-surface-raised px-2 py-1">
      <p className="text-[11px] text-muted-foreground">
        <span className="text-status-green">✓</span> {status.message}
      </p>
      {workflowAssistance === "guided" && (
        <p className="mt-0.5 text-[10px] text-muted-foreground/80">{status.guidance}</p>
      )}
    </div>
  );
}

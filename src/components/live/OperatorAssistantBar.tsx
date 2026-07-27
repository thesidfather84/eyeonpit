"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { useSettingsStore } from "@/store/useSettingsStore";
import { computeWorkflowStatus } from "@/lib/utils/workflowStatus";

/**
 * A quiet, always-passive fuller explanation for operators still learning
 * the workflow — never a chatbot, never a popup, never blocks input. The
 * short next-step message itself always lives in HandStatusLine (visible
 * regardless of this setting); this bar only adds to it, so Guided is the
 * only level with anything to show here. Off and Basic render nothing —
 * showing this bar's old duplicate copy of the same short message was
 * wasted vertical space for no extra information.
 */
export function OperatorAssistantBar() {
  const { investigation, currentRound } = useInvestigationContext();
  const workflowAssistance = useSettingsStore((s) => s.workflowAssistance);

  if (workflowAssistance !== "guided") return null;

  const status = computeWorkflowStatus(investigation, currentRound);

  return (
    <div className="flex-none border-t border-border bg-surface-raised px-2 py-1">
      <p className="text-[10px] text-muted-foreground/80">{status.guidance}</p>
    </div>
  );
}

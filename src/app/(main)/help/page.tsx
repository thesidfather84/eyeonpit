import { WorkflowHelpContent } from "@/components/settings/WorkflowHelpContent";

/** Same content shown in the Live screen's Help overlay — one source of truth, two presentations. */
export default function HelpPage() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="text-lg font-semibold text-foreground">How EyeOnPit Works</h1>
      <WorkflowHelpContent />
    </div>
  );
}

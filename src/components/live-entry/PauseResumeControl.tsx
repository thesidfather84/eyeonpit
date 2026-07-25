import { Button } from "@/components/ui/Button";
import type { InvestigationStatus } from "@/types/investigation";

interface PauseResumeControlProps {
  status: InvestigationStatus;
  busy: boolean;
  onPause: () => void;
  onResume: () => void;
}

/** Pause stops the session timer only — round data is always preserved. Plan.md §10 decision 1. */
export function PauseResumeControl({ status, busy, onPause, onResume }: PauseResumeControlProps) {
  if (status === "paused") {
    return (
      <Button variant="primary" onClick={onResume} disabled={busy}>
        ▶ Resume
      </Button>
    );
  }

  return (
    <Button variant="secondary" onClick={onPause} disabled={busy}>
      ⏸ Pause
    </Button>
  );
}

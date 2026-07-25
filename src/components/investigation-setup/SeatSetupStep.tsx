import { FieldHint } from "@/components/onboarding/FieldHint";
import { SeatToggleGrid } from "./SeatToggleGrid";
import type { WizardDraft } from "./SetupWizardShell";

interface StepProps {
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft>) => void;
}

export function SeatSetupStep({ draft, onChange }: StepProps) {
  return (
    <div className="flex flex-col gap-2">
      <SeatToggleGrid
        occupiedSeats={draft.occupiedSeats}
        trackedSeats={draft.trackedSeats}
        onChangeOccupied={(occupiedSeats) => onChange({ occupiedSeats })}
        onChangeTracked={(trackedSeats) => onChange({ trackedSeats })}
      />
      <FieldHint id="seat-setup">
        You can add or remove seats later if players join or leave the table.
      </FieldHint>
    </div>
  );
}

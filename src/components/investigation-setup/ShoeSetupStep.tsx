import { COUNTING_SYSTEMS } from "@/lib/counting-systems/countingSystems";
import { FieldHint } from "@/components/onboarding/FieldHint";
import type { WizardDraft } from "./SetupWizardShell";

interface StepProps {
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft>) => void;
}

const DECK_PRESETS = [1, 2, 4, 6, 8];

export function ShoeSetupStep({ draft, onChange }: StepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Counting system</p>
        <div className="grid grid-cols-2 gap-2">
          {COUNTING_SYSTEMS.map((system) => (
            <button
              key={system}
              type="button"
              onClick={() => onChange({ countingSystem: system })}
              className={`tap-target rounded-lg border text-sm font-semibold ${
                draft.countingSystem === system
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border bg-surface text-foreground"
              }`}
            >
              {system}
            </button>
          ))}
        </div>
        <FieldHint id="counting-system">
          Determines how the live running and true count are calculated.
        </FieldHint>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Shoe size (decks)</p>
        <div className="grid grid-cols-5 gap-2">
          {DECK_PRESETS.map((decks) => (
            <button
              key={decks}
              type="button"
              onClick={() => onChange({ shoeTotalDecks: decks })}
              className={`tap-target rounded-lg border text-sm font-semibold ${
                draft.shoeTotalDecks === decks
                  ? "bg-accent text-accent-foreground"
                  : "border-border bg-surface text-foreground"
              }`}
            >
              {decks}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

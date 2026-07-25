import { FieldHint } from "@/components/onboarding/FieldHint";
import type { WizardDraft } from "./SetupWizardShell";

interface StepProps {
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft>) => void;
}

const DECK_PRESETS = [1, 2, 4, 6, 8];

/** Counting system is not a setup choice — the Live screen computes every supported system simultaneously from the same cards. */
export function ShoeSetupStep({ draft, onChange }: StepProps) {
  return (
    <div className="flex flex-col gap-4">
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
        <FieldHint id="shoe-size">
          Used to calculate decks remaining and penetration as cards are entered.
        </FieldHint>
      </div>
    </div>
  );
}

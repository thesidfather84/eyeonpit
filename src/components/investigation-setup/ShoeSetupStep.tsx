import { FieldHint } from "@/components/onboarding/FieldHint";
import type { WizardDraft } from "./types";

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
        <p className="mb-2 text-sm font-medium text-foreground">Shoe number</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Decrease shoe number"
            onClick={() => onChange({ startingShoeNumber: Math.max(1, draft.startingShoeNumber - 1) })}
            className="tap-target rounded-lg border border-border bg-surface-raised text-lg font-semibold text-foreground"
          >
            −
          </button>
          <input
            type="number"
            inputMode="numeric"
            value={draft.startingShoeNumber}
            onChange={(e) => onChange({ startingShoeNumber: Math.max(1, Number(e.target.value) || 1) })}
            className="tap-target w-full rounded-lg border border-border bg-surface px-3 text-center text-base text-foreground focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            aria-label="Increase shoe number"
            onClick={() => onChange({ startingShoeNumber: draft.startingShoeNumber + 1 })}
            className="tap-target rounded-lg border border-border bg-surface-raised text-lg font-semibold text-foreground"
          >
            +
          </button>
        </div>
        <FieldHint id="shoe-number">
          Matches whatever shoe count the pit is already on — usually 1 at the start of a shift.
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
        <FieldHint id="shoe-size">
          Used to calculate decks remaining and penetration as cards are entered.
        </FieldHint>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-foreground" htmlFor="setup-notes">
          Notes (optional)
        </label>
        <textarea
          id="setup-notes"
          value={draft.setupNotes}
          onChange={(e) => onChange({ setupNotes: e.target.value })}
          rows={3}
          placeholder="Anything worth noting before recording begins…"
          className="w-full rounded-lg border border-border bg-surface p-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
        />
      </div>
    </div>
  );
}

import { FieldHint } from "@/components/onboarding/FieldHint";
import type { WizardDraft } from "./types";

interface StepProps {
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft>) => void;
}

const CHIP_PRESETS = [5, 25, 100];
const STEP_AMOUNT = 5;

export function InitialBetsStep({ draft, onChange }: StepProps) {
  function setWager(seat: number, amount: number) {
    const nextAmount = Math.max(0, amount);
    onChange({
      initialWagers: { ...draft.initialWagers, [seat]: nextAmount },
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm font-medium text-foreground">Initial wagers</p>
      {draft.trackedSeats.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Track at least one seat above to set its opening wager.
        </p>
      )}
      {draft.trackedSeats.map((seat) => {
        const amount = draft.initialWagers[seat] ?? 0;
        return (
          <div key={seat} className="rounded-lg border border-border bg-surface p-3">
            <p className="mb-2 text-sm font-medium text-foreground">
              Opening wager — Seat {seat}
            </p>

            <div className="mb-2 flex gap-2">
              {CHIP_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setWager(seat, preset)}
                  className={`tap-target flex-1 rounded-lg text-sm font-semibold ${
                    amount === preset
                      ? "bg-accent text-accent-foreground"
                      : "border border-border bg-surface-raised text-foreground"
                  }`}
                >
                  ${preset}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={`Decrease seat ${seat} wager`}
                onClick={() => setWager(seat, amount - STEP_AMOUNT)}
                className="tap-target rounded-lg border border-border bg-surface-raised text-lg font-semibold text-foreground"
              >
                −
              </button>
              <input
                type="number"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setWager(seat, Number(e.target.value) || 0)}
                className="tap-target w-full rounded-lg border border-border bg-surface-raised px-3 text-center text-base text-foreground focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                aria-label={`Increase seat ${seat} wager`}
                onClick={() => setWager(seat, amount + STEP_AMOUNT)}
                className="tap-target rounded-lg border border-border bg-surface-raised text-lg font-semibold text-foreground"
              >
                +
              </button>
            </div>
          </div>
        );
      })}
      <FieldHint id="initial-bets">
        This is each tracked seat&apos;s starting bet — you&apos;ll log every
        actual wager round by round once recording begins.
      </FieldHint>
    </div>
  );
}

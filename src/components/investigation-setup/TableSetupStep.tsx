import { FieldHint } from "@/components/onboarding/FieldHint";
import { todayIsoDate } from "@/lib/utils/formatters";
import type { WizardDraft } from "./types";

interface StepProps {
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft>) => void;
}

const inputClasses =
  "tap-target w-full rounded-lg border border-border bg-surface px-3 text-base text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none";

export function TableSetupStep({ draft, onChange }: StepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="casino">
          Casino
        </label>
        <input
          id="casino"
          className={inputClasses}
          value={draft.casino}
          onChange={(e) => onChange({ casino: e.target.value })}
          placeholder="e.g. Golden Aces Resort"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="table">
          Table #
        </label>
        <input
          id="table"
          className={inputClasses}
          value={draft.tableNumber}
          onChange={(e) => onChange({ tableNumber: e.target.value })}
          placeholder="e.g. 4"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="dealer">
          Dealer
        </label>
        <input
          id="dealer"
          className={inputClasses}
          value={draft.dealerName}
          onChange={(e) => onChange({ dealerName: e.target.value })}
          placeholder="Name or badge #"
        />
        <FieldHint id="dealer-name">
          Name or badge number, whatever identifies the dealer on camera.
        </FieldHint>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="operator">
          Operator
        </label>
        <input
          id="operator"
          className={inputClasses}
          value={draft.operatorName}
          onChange={(e) => onChange({ operatorName: e.target.value })}
          placeholder="Your name"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="date">
          Date
        </label>
        <div className="flex gap-2">
          <input
            id="date"
            type="date"
            className={inputClasses}
            value={draft.investigationDate}
            onChange={(e) => onChange({ investigationDate: e.target.value })}
          />
          <button
            type="button"
            onClick={() => onChange({ investigationDate: todayIsoDate() })}
            className="tap-target shrink-0 rounded-lg border border-border bg-surface px-4 text-sm text-foreground hover:bg-surface-raised"
          >
            Today
          </button>
        </div>
      </div>
    </div>
  );
}

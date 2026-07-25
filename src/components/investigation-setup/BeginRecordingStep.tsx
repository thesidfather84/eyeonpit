import type { WizardDraft } from "./SetupWizardShell";

export function BeginRecordingStep({ draft }: { draft: WizardDraft }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div>
        <p className="text-sm text-muted-foreground">Casino / Table</p>
        <p className="font-medium text-foreground">
          {draft.casino} · Table {draft.tableNumber}
        </p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Dealer / Operator</p>
        <p className="font-medium text-foreground">
          {draft.dealerName} / {draft.operatorName}
        </p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Date</p>
        <p className="font-medium text-foreground">{draft.investigationDate}</p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Tracking seats</p>
        <p className="font-medium text-foreground">{draft.trackedSeats.join(", ")}</p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Opening wagers</p>
        <p className="font-medium text-foreground">
          {draft.trackedSeats
            .map((seat) => `Seat ${seat}: $${draft.initialWagers[seat] ?? 0}`)
            .join(" · ")}
        </p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Counting system / Shoe</p>
        <p className="font-medium text-foreground">
          {draft.countingSystem} · {draft.shoeTotalDecks} decks
        </p>
      </div>
    </div>
  );
}

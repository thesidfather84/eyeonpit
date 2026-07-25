const WORKFLOW_STEPS = [
  "Start a new investigation and enter casino/table details.",
  "Mark which seats are occupied, then which are tracked.",
  "Enter each tracked seat's opening wager.",
  "Choose the shoe size — every counting system runs automatically as you play.",
  "Begin recording — the Live screen opens and stays open for the whole shift.",
  "Tap the dealer or a seat to target it, then tap cards as they're dealt.",
  "Use Bet Controls, Player Actions, and Result buttons as the round plays out.",
  "Tap Next Round to save and advance; New Shoe resets every count to zero.",
  "Pause anytime from the header or Round Controls — nothing already saved is affected.",
  "Open the Menu for History, Reports, Export, or Settings without leaving the Live screen.",
];

/** Shared between the Settings screen/overlay and the Live screen's Help overlay — one copy of the workflow steps. */
export function WorkflowHelpContent() {
  return (
    <ol className="flex flex-col gap-1.5 text-xs text-muted-foreground">
      {WORKFLOW_STEPS.map((step, i) => (
        <li key={i}>
          <span className="text-foreground">{i + 1}.</span> {step}
        </li>
      ))}
    </ol>
  );
}

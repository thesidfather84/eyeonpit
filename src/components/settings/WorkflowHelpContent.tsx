const WORKFLOW_STEPS = [
  "Tap Floor for hands-free counting, or Advanced/Quick for the full Surveillance table.",
  "Put in a headset (AirPods or similar) if you're using voice, then turn Voice on — it keeps listening continuously.",
  "Watch the table and narrate what you see naturally: \"Dealer king five. Player one seven three.\"",
  "Say or tap Done when the hand finishes — in Floor, that's the whole step: EyeOnPit saves the hand, speaks the count, and is already ready for the next one.",
  "Ask naturally any time — \"What's the count?\", \"What's the KO?\", \"True count?\", \"How many aces?\", \"Repeat\" — questions never change anything, only card narration does.",
  "Say \"New Shoe\" when the dealer shuffles — say \"Confirm New Shoe\" if asked; earlier shoes stay saved.",
  "Say \"Pause Investigation\" to step away, \"Resume Investigation\" to continue.",
  "If voice ever mishears something, tap the seat/dealer and use the card keypad — nothing about voice is required.",
  "Say \"End Investigation\" then \"Confirm End Investigation\" (or use End & Review in the Menu) when the whole investigation is finished — you'll land straight on that investigation's own review.",
  "Open the Menu — in Floor or Surveillance — any time for History, Reports, Export, or Settings.",
];

/** Shared between the Settings screen/overlay, the Live/Floor Menu's Help overlay, and the standalone /help route — one copy of the workflow steps. Terminology here must match the UI exactly (see docs/EYEONPIT_OPERATOR_MANUAL.md, which covers the same ground in more depth). */
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

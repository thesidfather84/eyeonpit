interface ProgressIndicatorProps {
  step: number; // 1-indexed
  totalSteps: number;
  label: string;
}

/** Step dots + label for the setup wizard — plan.md §4/§12. */
export function ProgressIndicator({ step, totalSteps, label }: ProgressIndicatorProps) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        {Array.from({ length: totalSteps }, (_, index) => (
          <span
            key={index}
            aria-hidden
            className={`h-2 w-2 rounded-full ${
              index === step - 1 ? "bg-accent" : "bg-border"
            }`}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">
        Step {step} of {totalSteps} — {label}
      </span>
    </div>
  );
}

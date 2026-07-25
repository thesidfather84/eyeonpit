import { Button } from "@/components/ui/Button";

interface RoundActionBarProps {
  onNextRound: () => void;
  disabled?: boolean;
}

/** Timestamp/notes are placeholders (Phase 3); Next Round is real — it persists a new Round via the round-based model. */
export function RoundActionBar({ onNextRound, disabled }: RoundActionBarProps) {
  return (
    <div
      className="flex gap-2 border-t border-border bg-surface p-3"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
    >
      <button
        disabled
        className="tap-target flex-1 rounded-lg border border-dashed border-border text-sm text-muted-foreground opacity-60"
      >
        🕘 Time
      </button>
      <button
        disabled
        className="tap-target flex-1 rounded-lg border border-dashed border-border text-sm text-muted-foreground opacity-60"
      >
        📝 Note
      </button>
      <Button variant="primary" onClick={onNextRound} disabled={disabled}>
        Next Round ▶▶
      </Button>
    </div>
  );
}

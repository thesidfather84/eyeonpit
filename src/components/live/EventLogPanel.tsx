import { useInvestigationContext } from "@/contexts/InvestigationContext";

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour12: false });
}

/** Real chronological log of this round's actions — every entry comes from an actual operator action, never sample text. */
export function EventLogPanel() {
  const { currentRound } = useInvestigationContext();
  const entries = [...currentRound.eventLog].reverse();

  return (
    <div className="p-3 pb-6">
      <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        Hand / Event Log — Round {currentRound.roundNumber}
      </p>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No events yet this round.</p>
      ) : (
        <ul className="flex flex-col gap-1 font-mono text-xs">
          {entries.map((entry) => (
            <li key={entry.id} className="flex gap-2 text-muted-foreground">
              <span className="shrink-0 text-muted-foreground/70">{formatTime(entry.timestamp)}</span>
              <span className="text-foreground">{entry.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

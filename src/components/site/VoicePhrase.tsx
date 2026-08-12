/** A quoted operator phrase, styled distinctly from ordinary body copy — used throughout the Voice Guide so real spoken examples never blend into prose. `result` is optional short annotation of what it does. */
export function VoicePhrase({ children, result }: { children: string; result?: string }) {
  return (
    <div className="my-2 flex flex-col gap-1 rounded-lg border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="font-mono text-sm text-accent-secondary">&ldquo;{children}&rdquo;</span>
      {result && <span className="text-xs text-muted-foreground">{result}</span>}
    </div>
  );
}

export function VoicePhraseGroup({ children }: { children: React.ReactNode }) {
  return <div className="my-4 flex flex-col gap-2">{children}</div>;
}

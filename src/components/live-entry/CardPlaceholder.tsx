export function CardPlaceholder({ label }: { label: string }) {
  return (
    <span className="tap-target flex items-center justify-center rounded-lg border border-border bg-surface-raised px-3 text-sm font-medium text-foreground">
      {label}
    </span>
  );
}

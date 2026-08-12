export function ReleaseEntry({
  version,
  date,
  title,
  children,
}: {
  version: string;
  date: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative border-l border-border pl-6 pb-10 last:pb-0">
      <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-accent" aria-hidden />
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-sm font-bold text-accent-secondary">{version}</span>
        <span className="text-xs text-muted-foreground">{date}</span>
      </div>
      <h2 className="!mt-1 !text-lg">{title}</h2>
      {children}
    </div>
  );
}

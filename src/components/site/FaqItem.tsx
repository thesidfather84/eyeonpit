export function FaqItem({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-border bg-surface open:bg-surface-raised/60">
      <summary className="tap-target flex cursor-pointer list-none items-center justify-between gap-4 px-5 text-sm font-semibold text-foreground marker:content-none">
        {question}
        <span className="shrink-0 text-lg text-muted-foreground transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="px-5 pb-4 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </details>
  );
}

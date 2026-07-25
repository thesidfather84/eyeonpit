import type { ReactNode } from "react";

type Tone = "neutral" | "accent" | "destructive";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "border border-border bg-surface-raised text-muted-foreground",
  accent: "border border-accent/40 bg-accent/15 text-accent",
  destructive: "border border-destructive/40 bg-destructive/15 text-destructive",
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium tracking-wide ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

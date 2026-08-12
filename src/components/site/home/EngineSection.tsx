import { Lock, GitBranch, ListChecks } from "lucide-react";

const POINTS = [
  {
    icon: GitBranch,
    title: "One structured event system",
    detail: "Voice, touch, and future input methods all resolve to the same ordered event record — never a second, parallel data model per input type.",
  },
  {
    icon: ListChecks,
    title: "Deterministic, not probabilistic",
    detail: "The same recorded events always produce the same count and the same analysis — no model drift, no unexplainable output.",
  },
  {
    icon: Lock,
    title: "Traceable history",
    detail: "Every entry is attributable and reviewable, so the record behind an investigation can be checked, not just trusted.",
  },
];

export function EngineSection() {
  return (
    <section className="border-b border-border/60 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-secondary">Powered by the EyeOnPit Engine</p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            A proprietary deterministic analysis engine, built for game-protection investigations
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Every input — voice, manual entry, and future vision/integration sources — feeds the same structured
            event system, giving every investigation consistent calculations, traceable history, and evidence that
            can actually be reviewed.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {POINTS.map((point) => (
            <div key={point.title} className="rounded-2xl border border-border bg-surface p-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/30 bg-accent/10">
                <point.icon className="h-4.5 w-4.5 text-accent" aria-hidden />
              </span>
              <p className="mt-4 text-sm font-bold text-foreground">{point.title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{point.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

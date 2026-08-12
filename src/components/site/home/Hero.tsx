import Link from "next/link";
import { Eye } from "lucide-react";

const DEMO_MAILTO = "mailto:contact@eyeonpit.com?subject=EyeOnPit%20Demo%20Request";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border/60">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, rgba(37,99,235,0.16) 0%, rgba(11,18,32,0) 70%)",
        }}
        aria-hidden
      />
      <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 py-24 text-center sm:px-6 sm:py-32">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10">
          <Eye className="h-7 w-7 text-accent" aria-hidden />
        </span>

        <h1 className="mt-8 text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl">EyeOnPit</h1>
        <p className="mt-3 text-lg font-semibold text-accent-secondary sm:text-2xl">
          Casino Game Protection, Rebuilt Around the Investigator
        </p>

        <p className="mt-8 max-w-2xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg">
          Watch the game. Speak naturally. EyeOnPit builds the investigation.
        </p>

        <p className="mt-4 max-w-xl text-balance text-sm leading-relaxed text-muted-foreground/80">
          A game-protection investigation platform that turns surveillance observations into structured evidence,
          deterministic analysis, and professional reporting — with minimal operator effort.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
          <span>Observation</span>
          <span className="text-accent">→</span>
          <span>Evidence</span>
          <span className="text-accent">→</span>
          <span>Analysis</span>
          <span className="text-accent">→</span>
          <span>Report</span>
        </div>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <a
            href={DEMO_MAILTO}
            className="tap-target flex items-center justify-center rounded-xl border border-border bg-surface px-7 text-sm font-semibold uppercase tracking-[0.1em] text-foreground transition-colors hover:bg-surface-raised"
          >
            Request a Demo
          </a>
          <Link
            href="/access"
            className="tap-target flex items-center justify-center rounded-xl bg-accent px-7 text-sm font-semibold uppercase tracking-[0.1em] text-accent-foreground shadow-lg shadow-accent/25 transition-colors hover:bg-accent-hover"
          >
            Launch EyeOnPit
          </Link>
        </div>
      </div>
    </section>
  );
}

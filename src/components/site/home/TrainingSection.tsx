import Link from "next/link";
import { StatusBadge } from "@/components/site/StatusBadge";

const FUTURE_AREAS = [
  "Counting practice",
  "Player tracking",
  "Betting-spread recognition",
  "Strategy-deviation recognition",
  "Suspicious-play investigation practice",
];

export function TrainingSection() {
  return (
    <section className="border-b border-border/60 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Professional Training</h2>
            </div>
            <div className="mt-3">
              <StatusBadge status="available" />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Practice Mode runs the exact same live workflow as a real investigation, kept completely separate from
              production case data. It&apos;s the fastest way for a new investigator to build comfort with voice
              entry and the counting workflow before working a real table.
            </p>
            <Link href="/docs/practice" className="mt-4 inline-block text-sm font-semibold text-accent-secondary hover:underline">
              Read the Practice Mode guide →
            </Link>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Future Training Direction
              </p>
              <StatusBadge status="planned" />
            </div>
            <ul className="mt-4 flex flex-col gap-2.5">
              {FUTURE_AREAS.map((area) => (
                <li key={area} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
                  {area}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

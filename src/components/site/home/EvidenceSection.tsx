import { StatusBadge } from "@/components/site/StatusBadge";

const EXAMPLE_FIELDS = [
  { label: "Hands Analyzed", value: "142" },
  { label: "Wager Spread", value: "1 – 8 units" },
  { label: "Count-Sensitive Deviations", value: "11 observed" },
  { label: "Player / Count Correlation", value: "Strong" },
  { label: "Evidence Confidence", value: "High" },
];

export function EvidenceSection() {
  return (
    <section className="border-b border-border/60 bg-surface/40 py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Evidence, Not Just Conclusions
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            EyeOnPit doesn&apos;t just hand back a label like &ldquo;CARD COUNTER.&rdquo; It&apos;s built to show the
            evidence behind an investigation — the recorded events, the count, and the analysis that led there — so
            a report holds up to review, not just belief.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Professional analysis such as player/count correlation, wager spread, and count-sensitive deviation
            tracking is on the roadmap. The panel shown here is an illustrative example of that future direction —
            not a live report.
          </p>
          <div className="mt-6">
            <StatusBadge status="planned" />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6">
          <div className="flex items-center justify-between border-b border-border/60 pb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Example Analysis</p>
            <span className="rounded-full border border-border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Illustrative — Not Live
            </span>
          </div>
          <dl className="mt-4 flex flex-col gap-3">
            {EXAMPLE_FIELDS.map((field) => (
              <div key={field.label} className="flex items-center justify-between gap-4 text-sm">
                <dt className="text-muted-foreground">{field.label}</dt>
                <dd className="font-mono font-semibold text-foreground">{field.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

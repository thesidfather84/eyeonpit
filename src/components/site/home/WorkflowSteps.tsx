import { Eye, Mic, BarChart3, FileText } from "lucide-react";

const STEPS = [
  {
    icon: Eye,
    label: "See It",
    detail: "Investigator observes card activity at the table.",
  },
  {
    icon: Mic,
    label: "Say It",
    detail: '"Player three has a five."',
    mono: true,
  },
  {
    icon: BarChart3,
    label: "Analyze It",
    detail: "EyeOnPit converts the observation into structured data and runs deterministic analysis.",
  },
  {
    icon: FileText,
    label: "Document It",
    detail: "Evidence and a professional report are ready to review.",
  },
];

export function WorkflowSteps() {
  return (
    <section className="border-b border-border/60 bg-surface/40 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="text-center text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          See It → Say It → Analyze It → Document It
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm leading-relaxed text-muted-foreground">
          One continuous workflow, from what you see at the table to what ends up in the record.
        </p>

        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <div key={step.label} className="relative rounded-2xl border border-border bg-surface p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/30 bg-accent/10">
                <step.icon className="h-5 w-5 text-accent" aria-hidden />
              </span>
              <p className="mt-5 text-sm font-bold uppercase tracking-[0.1em] text-foreground">
                {String(i + 1).padStart(2, "0")} — {step.label}
              </p>
              <p className={`mt-2 text-sm leading-relaxed text-muted-foreground ${step.mono ? "font-mono text-accent-secondary" : ""}`}>
                {step.detail}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

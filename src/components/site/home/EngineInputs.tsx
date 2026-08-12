import { Mic, Hand, Camera, Plug, ArrowDown } from "lucide-react";
import { StatusBadge, type FeatureStatus } from "@/components/site/StatusBadge";

const INPUTS: { icon: typeof Mic; label: string; detail: string; status: FeatureStatus }[] = [
  { icon: Mic, label: "Voice", detail: "Natural surveillance narration", status: "available" },
  { icon: Hand, label: "Touch", detail: "Fast manual entry", status: "available" },
  { icon: Camera, label: "Vision", detail: "AI-assisted authorized card observation", status: "in-development" },
  { icon: Plug, label: "Integrations", detail: "DVR, smart-shoe, casino-system, or other authorized sources", status: "planned" },
];

export function EngineInputs() {
  return (
    <section id="engine" className="border-b border-border/60 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="text-center text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          One Engine. Multiple Inputs.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm leading-relaxed text-muted-foreground">
          Voice, manual entry, and future vision/integration inputs feed the same structured event system.
        </p>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {INPUTS.map((input) => (
            <div key={input.label} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent-secondary/30 bg-accent-secondary/10">
                <input.icon className="h-5 w-5 text-accent-secondary" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.1em] text-foreground">{input.label}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{input.detail}</p>
              </div>
              <StatusBadge status={input.status} />
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center gap-3">
          <ArrowDown className="h-5 w-5 text-muted-foreground/60" aria-hidden />
          <div className="rounded-2xl border border-accent/40 bg-accent/10 px-8 py-4 text-center">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-accent-secondary">EyeOnPit Engine</p>
          </div>
          <ArrowDown className="h-5 w-5 text-muted-foreground/60" aria-hidden />
          <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <span className="rounded-full border border-border px-3 py-1.5">Analysis</span>
            <span className="text-accent">→</span>
            <span className="rounded-full border border-border px-3 py-1.5">Evidence</span>
            <span className="text-accent">→</span>
            <span className="rounded-full border border-border px-3 py-1.5">Report</span>
          </div>
        </div>
      </div>
    </section>
  );
}

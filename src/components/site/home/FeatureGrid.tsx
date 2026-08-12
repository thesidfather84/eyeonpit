import { Zap, Mic, Layers, Headphones, History, GraduationCap, Settings2, FileText, Building2 } from "lucide-react";
import { StatusBadge, type FeatureStatus } from "@/components/site/StatusBadge";

const FEATURES: { icon: typeof Zap; label: string; detail: string; status: FeatureStatus }[] = [
  { icon: Zap, label: "Quick Investigation", detail: "Minimal setup — start watching and recording immediately.", status: "available" },
  { icon: Mic, label: "Natural Voice", detail: 'Speak the way you already would: "Player one has a five."', status: "available" },
  { icon: Layers, label: "Multiple Count Systems", detail: "Hi-Lo, KO, Zen, and Omega II, calculated in parallel.", status: "available" },
  { icon: Headphones, label: "Headset Feedback", detail: "Count, status, and dealer-bust confirmation spoken back through a headset.", status: "available" },
  { icon: History, label: "Evidence History", detail: "Every card and table event recorded to a traceable, ordered ledger.", status: "available" },
  { icon: GraduationCap, label: "Practice Mode", detail: "The same live workflow, kept separate from real investigations.", status: "available" },
  { icon: Settings2, label: "Advanced", detail: "Custom table and game setup — actively expanding.", status: "available" },
  { icon: FileText, label: "Professional Reporting", detail: "Investigation review and export — actively expanding.", status: "available" },
  { icon: Building2, label: "Enterprise", detail: "Multi-investigator, multi-pit, centralized case management.", status: "planned" },
];

export function FeatureGrid() {
  return (
    <section className="border-b border-border/60 bg-surface/40 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="text-center text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Built for the Surveillance Room
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm leading-relaxed text-muted-foreground">
          Everything an investigator needs to open, run, and close a case — nothing they have to configure first.
        </p>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.label} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-raised">
                  <feature.icon className="h-4.5 w-4.5 text-foreground" aria-hidden />
                </span>
                <StatusBadge status={feature.status} />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">{feature.label}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{feature.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

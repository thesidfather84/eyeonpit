import { Users, Building2, ShieldCheck, LayoutDashboard, GitCompare, Plug } from "lucide-react";
import { StatusBadge } from "@/components/site/StatusBadge";

const CAPABILITIES = [
  { icon: Users, label: "Multiple investigators" },
  { icon: Building2, label: "Multiple pits" },
  { icon: LayoutDashboard, label: "Centralized investigation history" },
  { icon: ShieldCheck, label: "Permissions & audit trails" },
  { icon: GitCompare, label: "Cross-session analysis" },
  { icon: Plug, label: "DVR / integration APIs" },
];

export function EnterpriseSection() {
  return (
    <section className="border-b border-border/60 bg-surface/40 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Enterprise</h2>
          <div className="mt-3 flex justify-center">
            <StatusBadge status="planned" />
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            EyeOnPit today runs one investigator, one investigation at a time. Property- and group-wide capability is
            on the roadmap, built on the same engine and event system — not a rewrite.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-5 sm:grid-cols-3">
          {CAPABILITIES.map((cap) => (
            <div key={cap.label} className="flex flex-col items-center gap-2.5 rounded-xl border border-border bg-surface p-5 text-center">
              <cap.icon className="h-5 w-5 text-muted-foreground" aria-hidden />
              <span className="text-xs font-medium text-muted-foreground">{cap.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

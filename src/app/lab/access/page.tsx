import type { Metadata } from "next";
import { FlaskConical } from "lucide-react";
import { LabAccessForm } from "./LabAccessForm";

/**
 * PRIORITY B9 — the gate in front of /lab (the future paid-membership
 * Simulation Lab area). Mirrors src/app/access/page.tsx's own structure and
 * reasoning (its own top-level route, no marketing/app chrome) — that file
 * is untouched by this patch.
 */
export const metadata: Metadata = {
  title: "Lab Access",
  robots: { index: false, follow: false },
};

export default function LabAccessPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-3">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10">
          <FlaskConical className="h-7 w-7 text-accent" aria-hidden />
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">EyeOnPit Lab</h1>
        <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
          The Blackjack Gold Standard research area requires its own access code.
        </p>
      </div>

      <LabAccessForm />
    </div>
  );
}

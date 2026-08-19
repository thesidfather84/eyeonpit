"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listCountMethods } from "@/lib/db/repositories/goldStandard";
import type { CountMethodDefinition } from "@/lib/gold-standard/countMethodRegistry";
import { VERIFICATION_STATUS_DESCRIPTIONS } from "@/lib/gold-standard/countMethodRegistry";

const STATUS_COLOR: Record<CountMethodDefinition["verificationStatus"], string> = {
  VERIFIED: "text-status-green border-status-green/40 bg-status-green/10",
  RECONSTRUCTED: "text-accent-secondary border-accent-secondary/40 bg-accent-secondary/10",
  EXPERIMENTAL: "text-pending border-pending/40 bg-pending/10",
  RESEARCH_ONLY: "text-muted-foreground border-border bg-surface-raised",
};

/** PRIORITY B2/B12 — every method's verification status is always shown next to it, never implied. Real data only — built-in adapters (Hi-Lo/KO/Zen/Omega II) and any persisted custom methods, merged by the repository layer (see goldStandard.ts's listCountMethods). */
export default function MethodLibraryPage() {
  const [methods, setMethods] = useState<CountMethodDefinition[] | null>(null);

  useEffect(() => {
    listCountMethods().then(setMethods);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground">Method Library</h1>
        <Link href="/lab/methods/new" className="tap-target rounded-lg bg-accent px-3 text-xs font-semibold text-accent-foreground">
          + Add Method
        </Link>
      </div>

      {methods == null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {methods?.length === 0 && <p className="text-sm text-muted-foreground">No methods yet.</p>}

      <div className="flex flex-col gap-2">
        {methods?.map((method) => (
          <div key={method.id} className="rounded-xl border border-border bg-surface p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">{method.displayName}</span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_COLOR[method.verificationStatus]}`}>
                {method.verificationStatus}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{VERIFICATION_STATUS_DESCRIPTIONS[method.verificationStatus]}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
              <span>{method.balanced ? "Balanced" : "Unbalanced"}</span>
              {method.authorSource && <span>Source: {method.authorSource}</span>}
              {method.isBuiltInAdapter && <span className="font-semibold text-accent">Built-in (trusted engine adapter)</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

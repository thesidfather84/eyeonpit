"use client";

import { useEffect, useState } from "react";
import { listResearchEntries } from "@/lib/db/repositories/goldStandard";
import type { ResearchLibraryEntry } from "@/lib/gold-standard/researchLibrary";

/** PRIORITY B11 — real, persisted research entries only. */
export default function ResearchLibraryPage() {
  const [entries, setEntries] = useState<ResearchLibraryEntry[] | null>(null);

  useEffect(() => {
    listResearchEntries().then(setEntries);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-bold text-foreground">Research Library</h1>
      <p className="text-xs text-muted-foreground">
        Entry-creation UI is not yet built in this foundation pass — the data model and validation
        (docs/EYEONPIT_1_6_ARCHITECTURE.md) are complete and tested.
      </p>
      {entries == null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {entries?.length === 0 && <p className="text-sm text-muted-foreground">No research entries yet.</p>}
      <div className="flex flex-col gap-2">
        {entries?.map((e) => (
          <div key={e.id} className="rounded-xl border border-border bg-surface p-3">
            <p className="text-sm font-semibold text-foreground">{e.claim}</p>
            <p className="text-xs text-muted-foreground">
              {e.sourceType} · {e.source} · {e.verificationStatus}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

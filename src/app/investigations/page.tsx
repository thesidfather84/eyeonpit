"use client";

import { useEffect, useState } from "react";
import { listInvestigations } from "@/lib/db/repositories/investigations";
import type { Investigation } from "@/types/investigation";

export default function HistoryPage() {
  const [investigations, setInvestigations] = useState<Investigation[] | null>(
    null
  );

  useEffect(() => {
    listInvestigations().then(setInvestigations);
  }, []);

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="text-lg font-semibold">History</h1>

      {investigations === null && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {investigations !== null && investigations.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No investigations yet. The full list/search view lands in Phase 4.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {investigations?.map((investigation) => (
          <li
            key={investigation.localId}
            className="rounded-lg border border-border bg-surface p-3"
          >
            <p className="font-medium">{investigation.displayId}</p>
            <p className="text-sm text-muted-foreground">
              {investigation.casino} · Table {investigation.tableNumber} ·{" "}
              {investigation.status}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

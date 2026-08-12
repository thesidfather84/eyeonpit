"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listInvestigations } from "@/lib/db/repositories/investigations";
import { Badge } from "@/components/ui/Badge";
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
      <h1 className="text-lg font-semibold text-foreground">History</h1>

      {investigations === null && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {investigations !== null && investigations.length === 0 && (
        <p className="text-sm text-muted-foreground">No investigations yet.</p>
      )}

      <ul className="flex flex-col gap-2">
        {investigations?.map((investigation) => (
          <li key={investigation.localId}>
            <Link
              href={`/investigations/${investigation.localId}/live`}
              className="tap-target flex flex-col gap-1 rounded-lg border border-border bg-surface p-3 hover:bg-surface-raised"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">{investigation.displayId}</span>
                <Badge tone={investigation.status === "closed" ? "neutral" : "accent"}>
                  {investigation.status.toUpperCase()}
                </Badge>
              </div>
              <span className="text-sm text-muted-foreground">
                {investigation.casino} · Table {investigation.tableNumber} ·{" "}
                {investigation.rounds.length} rounds
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

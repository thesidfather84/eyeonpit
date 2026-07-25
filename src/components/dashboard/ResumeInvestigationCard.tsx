"use client";

import Link from "next/link";
import { useActiveInvestigation } from "@/hooks/useActiveInvestigation";
import { Badge } from "@/components/ui/Badge";

export function ResumeInvestigationCard() {
  const { investigation, loading } = useActiveInvestigation();

  if (loading || !investigation) return null;

  return (
    <Link
      href={`/investigations/${investigation.localId}/live`}
      className="tap-target flex flex-col gap-1 rounded-lg border border-accent/40 bg-accent/10 p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">
          ▶ Resume · {investigation.displayId}
        </span>
        {investigation.isDemo && <Badge tone="accent">PRACTICE</Badge>}
        {investigation.status === "paused" && <Badge>Paused</Badge>}
      </div>
      <span className="text-sm text-muted-foreground">
        {investigation.casino} · Table {investigation.tableNumber} · Seats{" "}
        {investigation.trackedSeats.join(", ") || "none"}
      </span>
    </Link>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { getCardEventsForInvestigation } from "@/lib/db/repositories/cardEvents";
import { buildReportFromInvestigation } from "@/lib/reporting/reportBuilder";
import { getDefaultProperty } from "@/lib/db/repositories/reporting";
import { downloadReportRtf } from "@/lib/reporting/exportRtf";
import type { Report } from "@/lib/reporting/reportSchema";
import { ReportPreview } from "@/components/report/ReportPreview";

/**
 * PRIORITY A5 — the Report Preview screen. `fixed inset-0` deliberately
 * escapes the parent (app) investigation layout's fixed-height,
 * `overflow-hidden` console frame (see InvestigationChrome.tsx) — a report
 * is a normal, potentially-long scrolling/printable document, not a
 * fixed-height live console screen, so it needs its own full-viewport
 * scroll region rather than being squeezed into that frame. This is a
 * presentation-only escape hatch; it does not touch InvestigationChrome or
 * the layout it's nested under.
 */
export default function ReportPreviewPage() {
  const { investigation } = useInvestigationContext();
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [cardEvents, property] = await Promise.all([
        getCardEventsForInvestigation(investigation.localId),
        getDefaultProperty(),
      ]);
      if (cancelled) return;
      setReport(buildReportFromInvestigation({ investigation, cardEvents, property }));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild only when the investigation identity or its round/event data actually changes, not on every context re-render.
  }, [investigation.localId, investigation.updatedAt]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-background">
      <div className="report-no-print sticky top-0 z-10 flex flex-none items-center justify-between border-b border-border bg-surface px-3 py-2">
        <Link href={`/investigations/${investigation.localId}/live?review=1`} className="tap-target flex items-center gap-1 text-xs font-medium text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => report && downloadReportRtf(report)}
            disabled={!report}
            className="tap-target flex items-center gap-1 rounded-md border border-border bg-surface-raised px-2 text-[11px] font-medium text-foreground disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" aria-hidden /> Export (Word/RTF)
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!report}
            className="tap-target flex items-center gap-1 rounded-md bg-accent px-2 text-[11px] font-medium text-accent-foreground disabled:opacity-50"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden /> Print / Save as PDF
          </button>
        </div>
      </div>

      {report ? <ReportPreview report={report} /> : <p className="p-6 text-sm text-muted-foreground">Building report preview…</p>}
    </div>
  );
}

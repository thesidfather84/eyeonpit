"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Download } from "lucide-react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { checkCountIntegrity } from "@/lib/deepEye/countIntegrity";
import { checkLedgerReplay } from "@/lib/deepEye/ledgerReplay";
import { checkInvestigationHealth } from "@/lib/deepEye/investigationHealth";
import { downloadSupportPackage } from "@/lib/deepEye/supportPackage";
import type { DiagnosticCheck, DiagnosticReport } from "@/lib/deepEye/types";

const STATUS_ICON: Record<DiagnosticCheck["status"], typeof CheckCircle2> = {
  pass: CheckCircle2,
  warn: AlertTriangle,
  fail: XCircle,
};

const STATUS_CLASSES: Record<DiagnosticCheck["status"], string> = {
  pass: "text-status-green",
  warn: "text-pending",
  fail: "text-destructive",
};

function ReportSection({ title, report }: { title: string; report: DiagnosticReport }) {
  const failCount = report.checks.filter((c) => c.status === "fail").length;
  const warnCount = report.checks.filter((c) => c.status === "warn").length;

  return (
    <div className="rounded-xl border border-border bg-surface-raised">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span
          className={`text-xs font-bold ${report.ok ? "text-status-green" : "text-destructive"}`}
        >
          {report.ok ? "HEALTHY" : "ISSUES FOUND"}
          {warnCount > 0 && report.ok ? ` (${warnCount} warning${warnCount > 1 ? "s" : ""})` : ""}
          {failCount > 0 ? ` (${failCount} failed)` : ""}
        </span>
      </div>
      <ul className="flex flex-col gap-2 p-3">
        {report.checks.map((check) => {
          const Icon = STATUS_ICON[check.status];
          return (
            <li key={check.id} className="flex items-start gap-2">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${STATUS_CLASSES[check.status]}`} aria-hidden />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">{check.label}</p>
                <p className="text-[11px] text-muted-foreground">{check.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Deep Eye 1.20 prototype — Diagnostic Center. Read-only: every check here
 * runs against the investigation and card-event ledger already loaded by
 * InvestigationContext (the exact same `cardEvents` CountSummaryPanel
 * counts from), so opening this panel can never affect the live count,
 * the ledger, or the investigation record. "Download Support Package" is
 * the only side effect, and it's a local file download — nothing is sent
 * anywhere.
 */
export function DiagnosticCenter() {
  const { investigation, cardEvents } = useInvestigationContext();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);

  const countIntegrity = useMemo(
    () => checkCountIntegrity(cardEvents, investigation.shoeTotalDecks),
    [cardEvents, investigation.shoeTotalDecks]
  );
  const ledgerReplay = useMemo(
    () => checkLedgerReplay(investigation, cardEvents),
    [investigation, cardEvents]
  );
  const health = useMemo(
    () => checkInvestigationHealth(investigation, cardEvents),
    [investigation, cardEvents]
  );

  async function handleDownload() {
    setDownloading(true);
    setDownloadError(false);
    try {
      await downloadSupportPackage(investigation);
    } catch {
      setDownloadError(true);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 pb-4">
      <p className="text-xs text-muted-foreground">
        Read-only checks against this investigation&apos;s live card-event ledger. Nothing here
        changes the count, the ledger, or any saved data.
      </p>

      <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-surface-raised p-3 text-center">
        <div>
          <p className="text-lg font-bold text-foreground">{health.summary.shoeCount}</p>
          <p className="text-[10px] uppercase text-muted-foreground">Shoes</p>
        </div>
        <div>
          <p className="text-lg font-bold text-foreground">{health.summary.roundCount}</p>
          <p className="text-[10px] uppercase text-muted-foreground">Rounds</p>
        </div>
        <div>
          <p className="text-lg font-bold text-foreground">{health.summary.activeCardEventCount}</p>
          <p className="text-[10px] uppercase text-muted-foreground">Active Cards</p>
        </div>
      </div>

      <ReportSection title="Count Integrity" report={countIntegrity} />
      <ReportSection title="Ledger Replay" report={ledgerReplay} />
      <ReportSection title="Investigation Health" report={health} />

      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="tap-target flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-raised text-sm font-semibold text-foreground disabled:opacity-40"
      >
        <Download className="h-4 w-4" aria-hidden />
        {downloading ? "Preparing…" : "Download Sanitized Support Package"}
      </button>
      {downloadError && (
        <p className="text-center text-xs text-destructive">
          Couldn&apos;t prepare the support package. Try again.
        </p>
      )}
      <p className="text-center text-[10px] text-muted-foreground">
        Names, notes, and custom labels are stripped before download — see the file for exactly
        what&apos;s included.
      </p>
    </div>
  );
}

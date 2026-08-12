"use client";

import { useEffect, useState } from "react";
import { diagnostics, downloadDiagnostics, exportDiagnostics } from "@/lib/diagnostics/logger";

interface RecoveryScreenProps {
  error: Error & { digest?: string };
  /** Absent from global-error.tsx's usage (that boundary replaces the whole root — its own reset re-renders the entire tree, so this component's Reload button is the meaningful recovery there instead). */
  reset?: () => void;
}

/**
 * The one recovery UI every error boundary in the app renders (see
 * app/error.tsx, app/investigations/[id]/error.tsx, app/global-error.tsx) —
 * a crash here is a UI-layer failure, never a data-layer one: every round,
 * card, and count already recorded lives in IndexedDB (lib/db), untouched
 * by a React render throwing. The copy says so explicitly, since "your
 * shift's data is fine" is the one thing an operator needs to hear first.
 */
export function RecoveryScreen({ error, reset }: RecoveryScreenProps) {
  const [incidentId] = useState(() => error.digest ?? Math.random().toString(36).slice(2, 10));
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    diagnostics.critical("error-boundary", error.message, {
      incidentId,
      digest: error.digest,
      stack: error.stack?.slice(0, 2000),
    });
  }, [error, incidentId]);

  async function handleExport() {
    setExporting(true);
    try {
      downloadDiagnostics(await exportDiagnostics());
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-destructive text-lg font-bold text-destructive">
        !
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-base font-semibold text-foreground">Something went wrong</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          The screen hit an unexpected error. Every round, card, and count
          already recorded is saved locally and was not affected — this is a
          display problem, not data loss.
        </p>
        <p className="text-[11px] text-muted-foreground/70">Incident {incidentId}</p>
      </div>
      {process.env.NODE_ENV !== "production" && (
        <pre className="max-w-full overflow-x-auto rounded-lg border border-border bg-surface-raised p-3 text-left text-xs text-muted-foreground">
          {error.message}
          {error.digest ? `\n\ndigest: ${error.digest}` : ""}
        </pre>
      )}
      <div className="flex w-full max-w-xs flex-col gap-2">
        {reset && (
          <button
            type="button"
            onClick={reset}
            className="tap-target rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground"
          >
            Try Again
          </button>
        )}
        <button
          type="button"
          onClick={() => window.location.assign("/app")}
          className="tap-target rounded-xl border border-border bg-surface-raised px-4 text-sm font-medium text-foreground"
        >
          Reload App
        </button>
        <button
          type="button"
          disabled={exporting}
          onClick={handleExport}
          className="tap-target rounded-xl border border-border bg-surface-raised px-4 text-sm font-medium text-foreground disabled:opacity-50"
        >
          {exporting ? "Exporting…" : "Export Diagnostics"}
        </button>
      </div>
    </div>
  );
}

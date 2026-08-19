"use client";

import type { Report } from "@/lib/reporting/reportSchema";

/**
 * PRIORITY A5/A6 — the professional Report Preview. Every section is
 * explicitly labeled OBSERVED FACT / DERIVED ANALYSIS / NARRATIVE (per
 * docs/EYEONPIT_PRODUCT_SPEC.md §16's separation requirement) and a
 * missing analysis section is always shown as "Not available," never
 * fabricated or silently omitted without explanation (Priority A5's own
 * "do not fabricate analytics that do not exist yet" rule).
 *
 * PDF EXPORT ARCHITECTURE (Priority A6): this component's own `@media
 * print` stylesheet IS the PDF export path — the caller's "Print / Save as
 * PDF" button calls the browser's native `window.print()`, which every
 * modern browser can render straight to a PDF file with zero additional
 * dependencies. See exportRtf.ts's own doc comment for why DOCX export
 * uses RTF instead of a hand-rolled OOXML writer.
 */
export function ReportPreview({ report }: { report: Report }) {
  return (
    <div className="report-preview mx-auto flex max-w-2xl flex-col gap-6 bg-background p-6 text-foreground print:max-w-none print:p-0">
      <style>{`
        @media print {
          .report-no-print { display: none !important; }
          .report-preview { color: #000; background: #fff; }
          .report-section-fact { border-left: 3px solid #444; }
          .report-section-analysis { border-left: 3px solid #888; }
          body { font-size: 11pt; }
        }
      `}</style>

      <header className="flex flex-col gap-1 border-b border-border pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">EyeOnPit Investigation Report</p>
        <h1 className="text-xl font-bold">{report.humanId}</h1>
        <p className="text-xs text-muted-foreground">
          Status: {report.status === "final" ? "Final" : "Draft"} · Generated {new Date(report.versionInfo.generatedAt).toLocaleString()}
        </p>
      </header>

      <Section kind="observed-fact" title="Property & Investigation">
        <Field label="Property" value={`${report.property.propertyName} (${report.property.propertyCode})`} />
        <Field label="Table" value={report.property.tableIdentifier} />
        {report.property.shift && <Field label="Shift" value={report.property.shift} />}
        <Field label="Investigator" value={report.property.investigatorName} />
        {report.property.externalIncidentNumber && <Field label="External Incident #" value={report.property.externalIncidentNumber} />}
        <Field label="Date" value={report.timing.investigationDate} />
        <Field
          label="Duration"
          value={report.timing.durationMs != null ? `${Math.round(report.timing.durationMs / 60000)} minutes` : "In progress"}
        />
      </Section>

      <Section kind="observed-fact" title="Game Configuration">
        <Field label="Format" value={report.gameConfig.blackjackFormat} />
        <Field label="Counting system" value={report.gameConfig.countingSystem} />
        <Field label="Shoe" value={`${report.gameConfig.shoeTotalDecks} decks`} />
      </Section>

      <Section kind="observed-fact" title="Play Summary">
        <Field label="Shoes observed" value={String(report.observedPlay.shoesObserved)} />
        <Field label="Hands observed" value={String(report.observedPlay.handsObserved)} />
      </Section>

      {report.observedPlay.significantEvents.length > 0 && (
        <Section kind="observed-fact" title="Significant Events">
          <ul className="flex flex-col gap-1 text-sm">
            {report.observedPlay.significantEvents.map((event, i) => (
              <li key={i}>
                <span className="text-muted-foreground">{event.timestamp} — </span>
                {event.description}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section kind="narrative" title="Executive Summary">
        <p className="whitespace-pre-wrap text-sm">{report.narrative.executiveSummary || "(not yet written)"}</p>
      </Section>

      <Section kind="narrative" title="Surveillance Memo">
        <p className="whitespace-pre-wrap text-sm">{report.narrative.surveillanceMemo || "(not yet written)"}</p>
      </Section>

      {report.narrative.operatorNotes.length > 0 && (
        <Section kind="narrative" title="Operator Notes (verbatim)">
          <ul className="flex flex-col gap-1 text-sm">
            {report.narrative.operatorNotes.map((note, i) => (
              <li key={i}>
                <span className="text-muted-foreground">[{new Date(note.timestamp).toLocaleString()}] </span>
                {note.text}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section kind="analysis" title="Bet / Count Correlation">
        {report.analysis?.betCountCorrelationBySeat && report.analysis.betCountCorrelationBySeat.length > 0 ? (
          <>
            <p className="mb-2 text-xs text-muted-foreground">
              Correlation between wager size and true count at time of bet, by seat — an indicator, not a conclusion. See
              docs/EYEONPIT_PRODUCT_SPEC.md §15.
            </p>
            <ul className="flex flex-col gap-1 text-sm">
              {report.analysis.betCountCorrelationBySeat.map((seat) => (
                <li key={seat.seatNumber}>
                  Seat {seat.seatNumber}: correlation {seat.correlation.toFixed(2)} ({seat.level}), sample size {seat.sampleSize}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm italic text-muted-foreground">Not available for this investigation.</p>
        )}
      </Section>

      {report.analysis?.counterAnalysisBySeat && report.analysis.counterAnalysisBySeat.length > 0 && (
        <Section kind="analysis" title="Counter Analysis">
          <ExperimentalNotice />
          <ul className="flex flex-col gap-1 text-sm">
            {report.analysis.counterAnalysisBySeat.map((seat) => (
              <li key={seat.seatNumber}>
                Seat {seat.seatNumber}: <span className="font-semibold">{seat.classification.replace("_", " ")}</span> (confidence{" "}
                {seat.confidenceScore.toFixed(2)})
                {seat.strongestContributingSignals.length > 0 && (
                  <span className="text-muted-foreground"> — {seat.strongestContributingSignals.map((s) => s.description).join("; ")}</span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {report.analysis?.bettingAnalysisBySeat && report.analysis.bettingAnalysisBySeat.length > 0 && (
        <Section kind="analysis" title="Betting Analysis">
          <ul className="flex flex-col gap-1 text-sm">
            {report.analysis.bettingAnalysisBySeat.map((seat) => (
              <li key={seat.seatNumber}>
                Seat {seat.seatNumber}: {seat.sampleSize} usable hands
                {seat.correlationWithTrueCount != null && `, wager/true-count correlation ${seat.correlationWithTrueCount.toFixed(2)}`}
                {seat.betSpread && `, spread ${seat.betSpread.minWager}-${seat.betSpread.maxWager}${seat.betSpread.ratio ? ` (${seat.betSpread.ratio.toFixed(1)}x)` : ""}`}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {report.analysis?.playingDeviationAnalysisBySeat && report.analysis.playingDeviationAnalysisBySeat.length > 0 && (
        <Section kind="analysis" title="Playing-Deviation Analysis">
          <ul className="flex flex-col gap-1 text-sm">
            {report.analysis.playingDeviationAnalysisBySeat.map((seat) => (
              <li key={seat.seatNumber}>
                Seat {seat.seatNumber}: {seat.totalDeviations}/{seat.totalOpportunities} decisions deviated from basic strategy
                {seat.deviationRate != null && ` (${(seat.deviationRate * 100).toFixed(0)}%)`}
                {seat.indexTableProvided
                  ? seat.indexConsistentDeviationRate != null &&
                    `, ${(seat.indexConsistentDeviationRate * 100).toFixed(0)}% index-consistent`
                  : " — no index table supplied, index-consistency not evaluated"}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {report.analysis?.insuranceAnalysisBySeat && report.analysis.insuranceAnalysisBySeat.length > 0 && (
        <Section kind="analysis" title="Insurance Analysis">
          <ul className="flex flex-col gap-1 text-sm">
            {report.analysis.insuranceAnalysisBySeat.map((seat) => (
              <li key={seat.seatNumber}>
                Seat {seat.seatNumber}: offered {seat.timesOffered}, taken {seat.timesTaken} (threshold TC ≥ {seat.trueCountThresholdUsed})
                {seat.countConsistentRate != null && `, ${(seat.countConsistentRate * 100).toFixed(0)}% count-consistent`}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {report.analysis?.observationConfidenceBySeat && report.analysis.observationConfidenceBySeat.length > 0 && (
        <Section kind="analysis" title="Observation Confidence">
          <ul className="flex flex-col gap-1 text-sm">
            {report.analysis.observationConfidenceBySeat.map((seat) => (
              <li key={seat.seatNumber}>
                Seat {seat.seatNumber}: {seat.handsObserved} hands observed, {seat.handsWithUsableEvidence} with usable evidence (minimum{" "}
                {seat.minimumHandsForClassification} required for any classification)
              </li>
            ))}
          </ul>
        </Section>
      )}

      {report.analysis?.methodology && (
        <Section kind="analysis" title="Methodology">
          <p className="text-sm">
            Player Observation schema v{report.analysis.methodology.playerObservationSchemaVersion} · Confidence Engine v
            {report.analysis.methodology.confidenceEngineVersion} · Status:{" "}
            <span className="font-semibold">{report.analysis.methodology.validationStatus.replace(/_/g, " ")}</span>
          </p>
          <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-4 text-xs text-muted-foreground">
            {report.analysis.methodology.limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </Section>
      )}

      <Section kind="narrative" title="Disposition">
        <Field label="Outcome" value={report.disposition.outcome ?? "(not yet set)"} />
        {report.disposition.managementNotes && <p className="mt-1 text-sm">{report.disposition.managementNotes}</p>}
      </Section>

      <footer className="border-t border-border pt-3 text-[10px] text-muted-foreground">
        <p>
          Report schema v{report.versionInfo.reportSchemaVersion} · App {report.versionInfo.applicationVersion} · Counting engine{" "}
          {report.versionInfo.countingEngineVersion} · Investigation {report.versionInfo.investigationDisplayId}
        </p>
      </footer>
    </div>
  );
}

function Section({ kind, title, children }: { kind: "observed-fact" | "derived-analysis" | "analysis" | "narrative"; title: string; children: React.ReactNode }) {
  const kindClass =
    kind === "observed-fact"
      ? "report-section-fact border-l-2 border-accent-secondary/50"
      : kind === "narrative"
        ? "border-l-2 border-border"
        : "report-section-analysis border-l-2 border-pending/50";
  const kindLabel = kind === "observed-fact" ? "OBSERVED FACT" : kind === "narrative" ? "NARRATIVE" : "DERIVED ANALYSIS";
  return (
    <section className={`flex flex-col gap-2 pl-3 ${kindClass}`}>
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-bold">{title}</h2>
        <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{kindLabel}</span>
      </div>
      {children}
    </section>
  );
}

/** Rendered above Counter Analysis specifically — that section's Confidence Engine is EXPERIMENTAL / NOT VALIDATED (see docs/EYEONPIT_1_7_COUNTER_DETECTION.md), so every appearance of it must carry this notice; see the Methodology section below for the full limitations list. */
function ExperimentalNotice() {
  return (
    <p className="mb-2 rounded-md border border-pending/40 bg-pending/10 p-2 text-xs font-medium text-pending">
      EXPERIMENTAL — NOT VALIDATED. An investigative indicator only, never an accusation or conclusion. See Methodology below.
    </p>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-sm">
      <span className="font-semibold">{label}:</span> {value}
    </p>
  );
}

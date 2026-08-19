import type { Report } from "./reportSchema";

/**
 * PRIORITY A6 — Word-compatible export (RTF). Rich Text Format is a plain-
 * text, dependency-free document format that Microsoft Word, Google Docs,
 * and Apple Pages all open natively — this is a deliberate, honest
 * foundation choice: package.json has NO docx/OOXML-writing library today
 * (see docs/EYEONPIT_1_5_REPORTING.md's "Export Architecture" section for
 * the full reasoning), and hand-rolling a real .docx (a zip of OOXML XML
 * parts) from scratch is real additional surface area/risk this foundation
 * pass deliberately did not take on. RTF gets a genuinely working,
 * zero-dependency "open in Word" experience today; a true native .docx
 * writer (via a vetted library) is a natural, low-risk follow-up that can
 * reuse this exact same section-building logic.
 *
 * PDF export uses the browser's own print-to-PDF (see ReportPreview.tsx's
 * print stylesheet) rather than a hand-rolled PDF binary writer — see that
 * component's own doc comment.
 */

function escapeRtf(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\n/g, "\\line ");
}

function rtfHeading(text: string): string {
  return `{\\b\\fs28 ${escapeRtf(text)}\\par}\\par`;
}

function rtfSubheading(text: string): string {
  return `{\\b\\fs22 ${escapeRtf(text)}\\par}`;
}

function rtfParagraph(text: string): string {
  return `{\\fs20 ${escapeRtf(text)}\\par}`;
}

function rtfLabelValue(label: string, value: string): string {
  return `{\\fs20{\\b ${escapeRtf(label)}: }${escapeRtf(value)}\\par}`;
}

/**
 * Builds a complete .rtf document from a Report. Every section is clearly
 * labeled OBSERVED FACT / DERIVED ANALYSIS / NARRATIVE (per
 * docs/EYEONPIT_PRODUCT_SPEC.md §16's explicit separation requirement) and
 * font sizes are deliberately generous (fs20 = 10pt body, fs28 = 14pt
 * headings) — "avoid tiny text and unreadable fine print" per Priority A6.
 */
export function buildReportRtf(report: Report): string {
  const parts: string[] = [];
  parts.push("{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Calibri;}}\\f0");

  parts.push(rtfHeading(`EyeOnPit Investigation Report — ${report.humanId}`));

  parts.push(rtfSubheading("OBSERVED FACT — Property & Investigation"));
  parts.push(rtfLabelValue("Property", `${report.property.propertyName} (${report.property.propertyCode})`));
  parts.push(rtfLabelValue("Table", report.property.tableIdentifier));
  if (report.property.shift) parts.push(rtfLabelValue("Shift", report.property.shift));
  parts.push(rtfLabelValue("Investigator", report.property.investigatorName));
  if (report.property.externalIncidentNumber) parts.push(rtfLabelValue("External Incident #", report.property.externalIncidentNumber));
  parts.push(rtfLabelValue("Date", report.timing.investigationDate));
  parts.push(rtfLabelValue("Game", `${report.gameConfig.blackjackFormat}, ${report.gameConfig.countingSystem}, ${report.gameConfig.shoeTotalDecks} decks`));
  parts.push(
    rtfLabelValue(
      "Duration",
      report.timing.durationMs != null ? `${Math.round(report.timing.durationMs / 60000)} minutes` : "In progress — investigation not yet closed"
    )
  );

  parts.push(rtfSubheading("OBSERVED FACT — Play Summary"));
  parts.push(rtfLabelValue("Shoes observed", String(report.observedPlay.shoesObserved)));
  parts.push(rtfLabelValue("Hands observed", String(report.observedPlay.handsObserved)));

  if (report.observedPlay.significantEvents.length > 0) {
    parts.push(rtfSubheading("OBSERVED FACT — Significant Events"));
    for (const event of report.observedPlay.significantEvents) {
      parts.push(rtfParagraph(`${event.timestamp} — ${event.description}`));
    }
  }

  parts.push(rtfSubheading("NARRATIVE — Executive Summary"));
  parts.push(rtfParagraph(report.narrative.executiveSummary || "(not yet written)"));

  parts.push(rtfSubheading("NARRATIVE — Surveillance Memo"));
  parts.push(rtfParagraph(report.narrative.surveillanceMemo || "(not yet written)"));

  if (report.narrative.operatorNotes.length > 0) {
    parts.push(rtfSubheading("NARRATIVE — Operator Notes (verbatim)"));
    for (const note of report.narrative.operatorNotes) {
      parts.push(rtfParagraph(`[${note.timestamp}] ${note.text}`));
    }
  }

  if (report.analysis?.betCountCorrelationBySeat && report.analysis.betCountCorrelationBySeat.length > 0) {
    parts.push(rtfSubheading("DERIVED ANALYSIS — Bet/Count Correlation"));
    parts.push(rtfParagraph("Correlation between wager size and true count at time of bet, by seat — an indicator, not a conclusion. See docs/EYEONPIT_PRODUCT_SPEC.md §15."));
    for (const seat of report.analysis.betCountCorrelationBySeat) {
      parts.push(rtfLabelValue(`Seat ${seat.seatNumber}`, `correlation ${seat.correlation.toFixed(2)} (${seat.level}), sample size ${seat.sampleSize}`));
    }
  } else {
    parts.push(rtfSubheading("DERIVED ANALYSIS"));
    parts.push(rtfParagraph("Not available for this investigation — no validated analysis data exists."));
  }

  parts.push(rtfSubheading("Disposition"));
  parts.push(rtfLabelValue("Outcome", report.disposition.outcome ?? "(not yet set)"));
  if (report.disposition.managementNotes) parts.push(rtfParagraph(report.disposition.managementNotes));

  parts.push(rtfSubheading("Report Version Information"));
  parts.push(rtfLabelValue("Report schema version", String(report.versionInfo.reportSchemaVersion)));
  parts.push(rtfLabelValue("Application version", report.versionInfo.applicationVersion));
  parts.push(rtfLabelValue("Counting engine version", report.versionInfo.countingEngineVersion));
  parts.push(rtfLabelValue("Investigation ID", report.versionInfo.investigationDisplayId));
  parts.push(rtfLabelValue("Generated", report.versionInfo.generatedAt));

  parts.push("}");
  return parts.join("\n");
}

/** Triggers a real browser download — no server, no filesystem, matching the existing JSON export pattern (see lib/export/toJson.ts's downloadInvestigationJson). */
export function downloadReportRtf(report: Report): void {
  const rtf = buildReportRtf(report);
  const blob = new Blob([rtf], { type: "application/rtf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${report.humanId}.rtf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

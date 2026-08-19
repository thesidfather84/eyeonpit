// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createInvestigation, resetAllData } from "@/lib/db/repositories/investigations";
import { buildReportFromInvestigation } from "@/lib/reporting/reportBuilder";
import { ReportPreview } from "./ReportPreview";

beforeEach(async () => {
  await resetAllData();
});

async function freshInvestigation() {
  return createInvestigation({
    casino: "Test Casino",
    tableNumber: "BJ-1",
    dealerName: "",
    investigationDate: "2026-08-19",
    operatorName: "J. Smith",
    countingSystem: "Hi-Lo",
    shoeTotalDecks: 6,
    status: "active",
  });
}

describe("ReportPreview — renders every required section, never fabricates missing analysis", () => {
  it("shows the report's human ID, property, and investigator", async () => {
    const inv = await freshInvestigation();
    const report = buildReportFromInvestigation({ investigation: inv, cardEvents: [] });
    render(<ReportPreview report={report} />);

    screen.getByText(report.humanId);
    screen.getByText(/Test Casino/);
    screen.getByText(/J\. Smith/);
  });

  it("labels sections OBSERVED FACT / NARRATIVE / DERIVED ANALYSIS", async () => {
    const inv = await freshInvestigation();
    const report = buildReportFromInvestigation({ investigation: inv, cardEvents: [] });
    render(<ReportPreview report={report} />);

    expect(screen.getAllByText("OBSERVED FACT").length).toBeGreaterThan(0);
    expect(screen.getAllByText("NARRATIVE").length).toBeGreaterThan(0);
    screen.getByText("DERIVED ANALYSIS");
  });

  it('shows "Not available for this investigation" rather than fabricating analysis when none exists', async () => {
    const inv = await freshInvestigation();
    const report = buildReportFromInvestigation({ investigation: inv, cardEvents: [] });
    expect(report.analysis).toBeUndefined();
    render(<ReportPreview report={report} />);
    screen.getByText("Not available for this investigation.");
  });

  it("shows version traceability information", async () => {
    const inv = await freshInvestigation();
    const report = buildReportFromInvestigation({ investigation: inv, cardEvents: [] });
    render(<ReportPreview report={report} />);
    screen.getByText(new RegExp(`Report schema v${report.versionInfo.reportSchemaVersion}`));
  });

  it("shows placeholder text for an unwritten executive summary rather than blank space", async () => {
    const inv = await freshInvestigation();
    const report = buildReportFromInvestigation({ investigation: inv, cardEvents: [] });
    render(<ReportPreview report={report} />);
    expect(screen.getAllByText("(not yet written)").length).toBeGreaterThan(0);
  });
});

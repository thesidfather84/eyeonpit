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

  it("omits every 1.7 analytics section entirely when no player analytics were attached — no clutter, no fabrication", async () => {
    const inv = await freshInvestigation();
    const report = buildReportFromInvestigation({ investigation: inv, cardEvents: [] });
    render(<ReportPreview report={report} />);
    expect(screen.queryByText("Counter Analysis")).toBeNull();
    expect(screen.queryByText("Methodology")).toBeNull();
  });

  it("shows Counter Analysis with an EXPERIMENTAL notice and the Methodology section when player analytics ARE attached", async () => {
    const inv = await freshInvestigation();
    const base = buildReportFromInvestigation({ investigation: inv, cardEvents: [] });
    const report = {
      ...base,
      analysis: {
        counterAnalysisBySeat: [
          { seatNumber: 1, playerGroupId: null, classification: "MODERATE" as const, confidenceScore: 0.4, reasonCodes: [], strongestContributingSignals: [], contradictorySignals: [], engineVersion: 1 },
        ],
        methodology: {
          playerObservationSchemaVersion: 1,
          confidenceEngineVersion: 1,
          validationStatus: "EXPERIMENTAL_NOT_VALIDATED" as const,
          limitations: ["Test limitation statement."],
        },
      },
    };
    render(<ReportPreview report={report} />);
    screen.getByText("Counter Analysis");
    screen.getByText(/EXPERIMENTAL — NOT VALIDATED/);
    screen.getByText("Methodology");
    screen.getByText("Test limitation statement.");
  });
});

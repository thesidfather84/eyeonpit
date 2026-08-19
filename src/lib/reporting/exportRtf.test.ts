// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createInvestigation, resetAllData } from "@/lib/db/repositories/investigations";
import { buildReportFromInvestigation } from "./reportBuilder";
import { buildReportRtf } from "./exportRtf";

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

function bracesBalanced(rtf: string): boolean {
  let depth = 0;
  for (let i = 0; i < rtf.length; i++) {
    if (rtf[i] === "\\" ) {
      i++; // skip escaped char
      continue;
    }
    if (rtf[i] === "{") depth++;
    if (rtf[i] === "}") depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

describe("buildReportRtf", () => {
  it("produces a well-formed RTF document (balanced braces, starts with the RTF header)", async () => {
    const inv = await freshInvestigation();
    const report = buildReportFromInvestigation({ investigation: inv, cardEvents: [] });
    const rtf = buildReportRtf(report);
    expect(rtf.startsWith("{\\rtf1")).toBe(true);
    expect(bracesBalanced(rtf)).toBe(true);
  });

  it("includes the report's human-readable ID and property/investigator fields", async () => {
    const inv = await freshInvestigation();
    const report = buildReportFromInvestigation({ investigation: inv, cardEvents: [] });
    const rtf = buildReportRtf(report);
    expect(rtf).toContain(report.humanId);
    expect(rtf).toContain("Test Casino");
    expect(rtf).toContain("J. Smith");
  });

  it("clearly labels the OBSERVED FACT / NARRATIVE / DERIVED ANALYSIS sections", async () => {
    const inv = await freshInvestigation();
    const report = buildReportFromInvestigation({ investigation: inv, cardEvents: [] });
    const rtf = buildReportRtf(report);
    expect(rtf).toContain("OBSERVED FACT");
    expect(rtf).toContain("NARRATIVE");
    expect(rtf).toContain("DERIVED ANALYSIS");
  });

  it("shows 'not available' for analysis rather than fabricating data when none exists", async () => {
    const inv = await freshInvestigation();
    const report = buildReportFromInvestigation({ investigation: inv, cardEvents: [] });
    expect(report.analysis).toBeUndefined();
    const rtf = buildReportRtf(report);
    expect(rtf).toContain("Not available for this investigation");
  });

  it("escapes RTF control characters in operator-authored text so it never corrupts the document", async () => {
    const inv = await freshInvestigation();
    const report = buildReportFromInvestigation({
      investigation: { ...inv, executiveSummary: "Player said \"{weird} text\\here\"" },
      cardEvents: [],
    });
    const rtf = buildReportRtf(report);
    expect(bracesBalanced(rtf)).toBe(true);
  });

  it("includes version traceability fields", async () => {
    const inv = await freshInvestigation();
    const report = buildReportFromInvestigation({ investigation: inv, cardEvents: [] });
    const rtf = buildReportRtf(report);
    expect(rtf).toContain(String(report.versionInfo.reportSchemaVersion));
    expect(rtf).toContain(report.versionInfo.countingEngineVersion);
  });
});

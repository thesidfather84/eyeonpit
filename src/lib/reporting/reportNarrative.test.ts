// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createInvestigation, resetAllData } from "@/lib/db/repositories/investigations";
import { buildReportFromInvestigation } from "./reportBuilder";
import { deterministicDraftProvider, generateNarrativeDraft } from "./reportNarrative";

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

describe("deterministicDraftProvider — never invents, only summarizes real report fields", () => {
  it("produces a draft mentioning only real, present data", async () => {
    const inv = await freshInvestigation();
    const report = buildReportFromInvestigation({ investigation: inv, cardEvents: [] });
    const draft = await deterministicDraftProvider.generateDraft(report);

    expect(draft.draftText).toContain("Test Casino");
    expect(draft.draftText).toContain("BJ-1");
    expect(draft.draftText).toContain("2026-08-19");
    expect(draft.draftText).toContain("Hi-Lo");
    expect(draft.modelIdentifier).toBe("eyeonpit-deterministic-v1");
  });

  it("never mentions a bet/count correlation section when no analysis data exists", async () => {
    const inv = await freshInvestigation();
    const report = buildReportFromInvestigation({ investigation: inv, cardEvents: [] });
    expect(report.analysis).toBeUndefined();
    const draft = await deterministicDraftProvider.generateDraft(report);
    expect(draft.draftText).not.toMatch(/correlation/i);
  });

  it("always ends with an explicit review reminder — never presented as a final, ready-to-export narrative", async () => {
    const inv = await freshInvestigation();
    const report = buildReportFromInvestigation({ investigation: inv, cardEvents: [] });
    const draft = await deterministicDraftProvider.generateDraft(report);
    expect(draft.draftText).toMatch(/review and edit/i);
  });
});

describe("generateNarrativeDraft", () => {
  it("returns metadata with reviewedByOperator false — never pre-accepted", async () => {
    const inv = await freshInvestigation();
    const report = buildReportFromInvestigation({ investigation: inv, cardEvents: [] });
    const { metadata, draftText } = await generateNarrativeDraft(report);
    expect(metadata.reviewedByOperator).toBe(false);
    expect(metadata.used).toBe(true);
    expect(draftText.length).toBeGreaterThan(0);
  });

  it("never mutates the report itself — draft generation is read-only", async () => {
    const inv = await freshInvestigation();
    const report = buildReportFromInvestigation({ investigation: inv, cardEvents: [] });
    const before = JSON.stringify(report);
    await generateNarrativeDraft(report);
    expect(JSON.stringify(report)).toBe(before);
  });
});

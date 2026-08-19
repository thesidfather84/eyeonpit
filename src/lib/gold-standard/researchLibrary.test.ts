import { describe, expect, it } from "vitest";
import { buildResearchLibraryEntry, validateResearchLibraryEntry } from "./researchLibrary";

const baseInput = {
  sourceType: "forum" as const,
  source: "https://example.com/thread/123",
  dateFound: "2026-08-19",
  claim: "Reduced variance via side-count adjustment",
  implementationStatus: "not-started" as const,
  verificationStatus: "RESEARCH_ONLY" as const,
  simulationStatus: "not-simulated" as const,
};

describe("validateResearchLibraryEntry", () => {
  it("accepts a minimal valid entry", () => {
    expect(validateResearchLibraryEntry(baseInput)).toEqual({ valid: true });
  });

  it("rejects a missing source/claim/date", () => {
    expect(validateResearchLibraryEntry({ ...baseInput, source: "" }).valid).toBe(false);
    expect(validateResearchLibraryEntry({ ...baseInput, claim: "" }).valid).toBe(false);
    expect(validateResearchLibraryEntry({ ...baseInput, dateFound: "" }).valid).toBe(false);
  });

  it("requires resultingCountMethodCanonicalId once implementationStatus is 'implemented'", () => {
    const result = validateResearchLibraryEntry({ ...baseInput, implementationStatus: "implemented" });
    expect(result.valid).toBe(false);
  });

  it("accepts 'implemented' once the resulting method is referenced", () => {
    const result = validateResearchLibraryEntry({
      ...baseInput,
      implementationStatus: "implemented",
      resultingCountMethodCanonicalId: "my-method",
    });
    expect(result.valid).toBe(true);
  });

  it("PRIORITY B12 safety: rejects VERIFIED status without at least a simulation having been run", () => {
    const result = validateResearchLibraryEntry({ ...baseInput, verificationStatus: "VERIFIED", simulationStatus: "not-simulated" });
    expect(result.valid).toBe(false);
  });
});

describe("buildResearchLibraryEntry", () => {
  it("builds a versioned record", () => {
    const entry = buildResearchLibraryEntry(baseInput);
    expect(entry.id).toBeTruthy();
    expect(entry.version).toBe(1);
    expect(entry.claim).toBe(baseInput.claim);
  });

  it("throws for invalid input", () => {
    expect(() => buildResearchLibraryEntry({ ...baseInput, source: "" })).toThrow();
  });
});

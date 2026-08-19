import { describe, expect, it } from "vitest";
import { BUILT_IN_COUNT_METHODS } from "./countMethodAdapters";
import { parseMethodImportFile, serializeMethodToJson, METHOD_EXPORT_SCHEMA_VERSION } from "./methodImportExport";

describe("serializeMethodToJson / parseMethodImportFile round trip", () => {
  it("round-trips a built-in method's data faithfully", () => {
    const json = serializeMethodToJson(BUILT_IN_COUNT_METHODS["hi-lo"]);
    const result = parseMethodImportFile(json);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.input.canonicalId).toBe("hi-lo");
      expect(result.input.tags?.A).toBe(-1);
      // VERIFIED is never trusted from an import — downgraded to RECONSTRUCTED.
      expect(result.input.verificationStatus).toBe("RECONSTRUCTED");
    }
  });

  it("includes the fileType/schemaVersion envelope", () => {
    const json = serializeMethodToJson(BUILT_IN_COUNT_METHODS["hi-lo"]);
    const parsed = JSON.parse(json);
    expect(parsed.fileType).toBe("eyeonpit-method");
    expect(parsed.schemaVersion).toBe(METHOD_EXPORT_SCHEMA_VERSION);
  });
});

describe("parseMethodImportFile — safety and validation", () => {
  it("rejects invalid JSON without throwing", () => {
    const result = parseMethodImportFile("{ not json");
    expect(result.valid).toBe(false);
  });

  it("rejects a file missing the eyeonpit-method fileType marker", () => {
    const result = parseMethodImportFile(JSON.stringify({ schemaVersion: 1, method: {} }));
    expect(result.valid).toBe(false);
  });

  it("rejects a schema version newer than this app supports", () => {
    const result = parseMethodImportFile(
      JSON.stringify({ fileType: "eyeonpit-method", schemaVersion: 999, method: { canonicalId: "x", displayName: "X" } })
    );
    expect(result.valid).toBe(false);
  });

  it("rejects a method with no tags and no RESEARCH_ONLY status (fails the same validation a UI-created method would)", () => {
    const result = parseMethodImportFile(
      JSON.stringify({
        fileType: "eyeonpit-method",
        schemaVersion: 1,
        method: { canonicalId: "no-tags", displayName: "No Tags", verificationStatus: "EXPERIMENTAL", tags: null, sourceReferences: ["x"] },
      })
    );
    expect(result.valid).toBe(false);
  });

  it("never executes anything even if a field contains script-like text — it's just a string", () => {
    const json = JSON.stringify({
      fileType: "eyeonpit-method",
      schemaVersion: 1,
      method: {
        canonicalId: "evil-test",
        displayName: "eval(\"globalThis.PWNED = true\")",
        verificationStatus: "RESEARCH_ONLY",
        tags: null,
        notes: "'; DROP TABLE methods; --",
        sourceReferences: ["a research citation"],
      },
    });
    const result = parseMethodImportFile(json);
    expect(result.valid).toBe(true);
    expect((globalThis as Record<string, unknown>).PWNED).toBeUndefined();
    if (result.valid) expect(result.input.displayName).toBe('eval("globalThis.PWNED = true")');
  });

  it("defaults missing optional arrays to empty rather than throwing", () => {
    const result = parseMethodImportFile(
      JSON.stringify({
        fileType: "eyeonpit-method",
        schemaVersion: 1,
        method: { canonicalId: "minimal", displayName: "Minimal", verificationStatus: "RESEARCH_ONLY", sourceReferences: ["a source"] },
      })
    );
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.input.sideCounts).toEqual([]);
    }
  });

  it("rejects ANY non-VERIFIED method (including RESEARCH_ONLY) with no source reference at all — Priority B12 applies uniformly", () => {
    const result = parseMethodImportFile(
      JSON.stringify({ fileType: "eyeonpit-method", schemaVersion: 1, method: { canonicalId: "no-source", displayName: "No Source", verificationStatus: "RESEARCH_ONLY" } })
    );
    expect(result.valid).toBe(false);
  });
});

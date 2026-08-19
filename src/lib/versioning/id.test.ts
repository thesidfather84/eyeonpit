import { describe, expect, it } from "vitest";
import {
  generateCanonicalId,
  validatePropertyCode,
  generateHumanReadableId,
  parseHumanReadableId,
} from "./id";

describe("generateCanonicalId", () => {
  it("produces distinct uuid-shaped IDs", () => {
    const a = generateCanonicalId();
    const b = generateCanonicalId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});

describe("validatePropertyCode", () => {
  it.each(["HOLLYMS", "ab", "A1B2C3D4E5"])("accepts and normalizes valid codes: %s", (raw) => {
    const result = validatePropertyCode(raw);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.code).toBe(raw.toUpperCase());
  });

  it("trims and uppercases", () => {
    const result = validatePropertyCode("  hollyms  ");
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.code).toBe("HOLLYMS");
  });

  it.each(["", "a", "way-too-long-code", "HAS SPACE", "HAS-DASH"])("rejects invalid codes: %s", (raw) => {
    expect(validatePropertyCode(raw).valid).toBe(false);
  });
});

describe("generateHumanReadableId / parseHumanReadableId", () => {
  it("produces the PROPERTY-YYYYMMDD-XXXXXX format", () => {
    const id = generateHumanReadableId("hollyms", "2026-08-19");
    expect(id).toMatch(/^HOLLYMS-20260819-[A-F0-9]{6}$/);
  });

  it("round-trips through parseHumanReadableId", () => {
    const id = generateHumanReadableId("HOLLYMS", "2026-08-19");
    const parsed = parseHumanReadableId(id);
    expect(parsed).toEqual({ propertyCode: "HOLLYMS", datePart: "20260819", suffix: expect.stringMatching(/^[A-F0-9]{6}$/) });
  });

  it("falls back to UNKNOWN for an invalid property code rather than throwing", () => {
    const id = generateHumanReadableId("", "2026-08-19");
    expect(id).toMatch(/^UNKNOWN-20260819-[A-F0-9]{6}$/);
  });

  it("two IDs generated back-to-back for the same property/date are distinct", () => {
    const a = generateHumanReadableId("HOLLYMS", "2026-08-19");
    const b = generateHumanReadableId("HOLLYMS", "2026-08-19");
    expect(a).not.toBe(b);
  });

  it("parseHumanReadableId returns null for garbage input", () => {
    expect(parseHumanReadableId("not-an-id")).toBeNull();
    expect(parseHumanReadableId("")).toBeNull();
  });
});

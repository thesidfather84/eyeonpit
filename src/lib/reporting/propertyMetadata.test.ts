import { describe, expect, it } from "vitest";
import { buildPropertyMetadata, validatePropertyMetadataInput } from "./propertyMetadata";

describe("validatePropertyMetadataInput", () => {
  it("accepts a valid minimal input", () => {
    expect(validatePropertyMetadataInput({ code: "HOLLYMS", name: "Hollywood MS" })).toEqual({ valid: true });
  });

  it("rejects a missing name", () => {
    const result = validatePropertyMetadataInput({ code: "HOLLYMS", name: "  " });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toContain("Property name is required.");
  });

  it("rejects an invalid property code", () => {
    const result = validatePropertyMetadataInput({ code: "", name: "Hollywood MS" });
    expect(result.valid).toBe(false);
  });
});

describe("buildPropertyMetadata", () => {
  it("builds a complete record with generated id/timestamps", () => {
    const record = buildPropertyMetadata({ code: "hollyms", name: "Hollywood MS", city: "Bay St Louis", state: "MS" });
    expect(record.id).toBeTruthy();
    expect(record.version).toBe(1);
    expect(record.code).toBe("HOLLYMS");
    expect(record.name).toBe("Hollywood MS");
    expect(record.city).toBe("Bay St Louis");
    expect(record.isDefault).toBe(false);
    expect(record.createdAt).toBe(record.updatedAt);
  });

  it("throws for invalid input rather than persisting a partial record", () => {
    expect(() => buildPropertyMetadata({ code: "!!", name: "X" })).toThrow(/Invalid property metadata/);
  });

  it("trims optional fields to undefined rather than storing empty strings", () => {
    const record = buildPropertyMetadata({ code: "HOLLYMS", name: "Hollywood MS", city: "  " });
    expect(record.city).toBeUndefined();
  });
});

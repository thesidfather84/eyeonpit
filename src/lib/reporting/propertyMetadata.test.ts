import { describe, expect, it } from "vitest";
import { buildPropertyMetadata, resolveTerminology, validatePropertyMetadataInput } from "./propertyMetadata";

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

  it("copies through every optional 1.8 Property Profile field when supplied", () => {
    const record = buildPropertyMetadata({
      code: "HOLLYMS",
      name: "Hollywood MS",
      timezone: "America/Chicago",
      defaultLanguage: "es",
      terminology: { playerPositionLabel: "Spot" },
      defaultGameRulesRef: { id: "game-1", version: 1 },
      tableNamingConvention: "BJ-##",
      currency: "USD",
      reportingDefaults: { defaultInvestigatorName: "J. Smith", defaultShift: "Swing" },
      logoRef: "logo-1",
    });
    expect(record.timezone).toBe("America/Chicago");
    expect(record.defaultLanguage).toBe("es");
    expect(record.terminology).toEqual({ playerPositionLabel: "Spot" });
    expect(record.defaultGameRulesRef).toEqual({ id: "game-1", version: 1 });
    expect(record.tableNamingConvention).toBe("BJ-##");
    expect(record.currency).toBe("USD");
    expect(record.reportingDefaults).toEqual({ defaultInvestigatorName: "J. Smith", defaultShift: "Swing" });
    expect(record.logoRef).toBe("logo-1");
  });

  it("leaves every 1.8 Property Profile field undefined when not supplied — none are required", () => {
    const record = buildPropertyMetadata({ code: "HOLLYMS", name: "Hollywood MS" });
    expect(record.timezone).toBeUndefined();
    expect(record.terminology).toBeUndefined();
    expect(record.defaultGameRulesRef).toBeUndefined();
  });
});

describe("resolveTerminology", () => {
  it("returns 'Seat' (Surveillance's default) when no property or preference is given", () => {
    expect(resolveTerminology(undefined)).toBe("Seat");
    expect(resolveTerminology({ terminology: undefined })).toBe("Seat");
  });

  it("returns the property's configured 'Spot' preference", () => {
    expect(resolveTerminology({ terminology: { playerPositionLabel: "Spot" } })).toBe("Spot");
  });

  it("returns a property's custom localized term", () => {
    expect(resolveTerminology({ terminology: { playerPositionLabel: { custom: "Puesto" } } })).toBe("Puesto");
  });
});

import { describe, expect, it } from "vitest";
import { ALL_ROLES, ROLE_PERMISSIONS, roleHasPermission } from "./roles";
import { FEATURE_TIER_MAP, isFeatureEntitled } from "./entitlements";

describe("roles — pure permission matrix, no side effects", () => {
  it("every role has at least view-investigation", () => {
    for (const role of ALL_ROLES) {
      expect(roleHasPermission(role, "view-investigation")).toBe(true);
    }
  });

  it("Observer cannot edit an investigation", () => {
    expect(roleHasPermission("Observer", "edit-investigation")).toBe(false);
  });

  it("only Administrator can manage users", () => {
    for (const role of ALL_ROLES) {
      expect(roleHasPermission(role, "manage-users")).toBe(role === "Administrator");
    }
  });

  it("ResearchAnalyst can access the lab and run simulations but cannot manage the property", () => {
    expect(roleHasPermission("ResearchAnalyst", "access-lab")).toBe(true);
    expect(roleHasPermission("ResearchAnalyst", "run-simulation")).toBe(true);
    expect(roleHasPermission("ResearchAnalyst", "manage-property")).toBe(false);
  });

  it("every role listed in ALL_ROLES has a real, non-empty permission list", () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
    }
  });
});

describe("entitlements — tier hierarchy, no billing/enforcement", () => {
  it("PUBLIC tier is entitled only to PUBLIC features", () => {
    expect(isFeatureEntitled("PUBLIC", "basic-docs")).toBe(true);
    expect(isFeatureEntitled("PUBLIC", "counter-detection")).toBe(false);
    expect(isFeatureEntitled("PUBLIC", "multi-property")).toBe(false);
  });

  it("PRO tier includes PUBLIC and PRO features but not ENTERPRISE", () => {
    expect(isFeatureEntitled("PRO", "basic-docs")).toBe(true);
    expect(isFeatureEntitled("PRO", "counter-detection")).toBe(true);
    expect(isFeatureEntitled("PRO", "multi-property")).toBe(false);
  });

  it("ENTERPRISE tier includes every feature", () => {
    for (const feature of Object.keys(FEATURE_TIER_MAP) as (keyof typeof FEATURE_TIER_MAP)[]) {
      expect(isFeatureEntitled("ENTERPRISE", feature)).toBe(true);
    }
  });

  it("every named example feature from the product instruction is mapped to a tier", () => {
    const expectedPro = ["advanced-reporting", "simulation-lab", "method-library", "counter-detection", "player-analytics", "advanced-exports", "research-tools"];
    for (const f of expectedPro) {
      expect(FEATURE_TIER_MAP[f as keyof typeof FEATURE_TIER_MAP]).toBe("PRO");
    }
    const expectedEnterprise = ["multi-property", "roles-and-permissions", "audit-controls", "identity-tools", "centralized-property-management"];
    for (const f of expectedEnterprise) {
      expect(FEATURE_TIER_MAP[f as keyof typeof FEATURE_TIER_MAP]).toBe("ENTERPRISE");
    }
  });
});

import { describe, expect, it } from "vitest";
import { BUILT_IN_COUNT_METHODS } from "@/lib/gold-standard/countMethodAdapters";
import type { CountMethodDefinition } from "@/lib/gold-standard/countMethodRegistry";
import { validateMethodGameCompatibility } from "./gameMethodCompatibility";

describe("validateMethodGameCompatibility", () => {
  it("marks every built-in adapter compatible with blackjack (each declares supportedGameFamilies)", () => {
    for (const method of Object.values(BUILT_IN_COUNT_METHODS)) {
      const result = validateMethodGameCompatibility(method, "blackjack");
      expect(result.compatible).toBe(true);
    }
  });

  it("marks a built-in adapter incompatible with a different game family", () => {
    const result = validateMethodGameCompatibility(BUILT_IN_COUNT_METHODS["hi-lo"], "baccarat");
    expect(result.compatible).toBe(false);
    expect(result.reason).toMatch(/baccarat/);
  });

  it("treats an undeclared method as incompatible with EVERY family, never presumed blackjack-safe", () => {
    const undeclared: CountMethodDefinition = { ...BUILT_IN_COUNT_METHODS["hi-lo"], supportedGameFamilies: undefined };
    const result = validateMethodGameCompatibility(undeclared, "blackjack");
    expect(result.compatible).toBe(false);
    expect(result.reason).toMatch(/does not declare/);
  });

  it("treats an empty supportedGameFamilies array the same as undeclared", () => {
    const empty: CountMethodDefinition = { ...BUILT_IN_COUNT_METHODS["hi-lo"], supportedGameFamilies: [] };
    const result = validateMethodGameCompatibility(empty, "blackjack");
    expect(result.compatible).toBe(false);
  });
});

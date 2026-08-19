import { describe, expect, it } from "vitest";
import { buildGameDefinition, validateGameDefinition, GAME_DEFINITION_PRESETS } from "./gameDefinition";

describe("validateGameDefinition", () => {
  it("accepts both presets as-is", () => {
    for (const preset of Object.values(GAME_DEFINITION_PRESETS)) {
      expect(validateGameDefinition(preset)).toEqual({ valid: true });
    }
  });

  it("rejects an out-of-range deck count", () => {
    const result = validateGameDefinition({ ...GAME_DEFINITION_PRESETS["vegas-strip-6d-s17"], deckCount: 0 });
    expect(result.valid).toBe(false);
  });

  it("rejects an out-of-range penetration percent", () => {
    const result = validateGameDefinition({ ...GAME_DEFINITION_PRESETS["vegas-strip-6d-s17"], penetrationPercent: 150 });
    expect(result.valid).toBe(false);
  });

  it("rejects a negative burn card count", () => {
    const result = validateGameDefinition({ ...GAME_DEFINITION_PRESETS["vegas-strip-6d-s17"], burnCardCount: -1 });
    expect(result.valid).toBe(false);
  });
});

describe("buildGameDefinition", () => {
  it("builds a versioned record from a valid preset", () => {
    const def = buildGameDefinition(GAME_DEFINITION_PRESETS["single-deck-h17"]);
    expect(def.id).toBeTruthy();
    expect(def.version).toBe(1);
    expect(def.deckCount).toBe(1);
    expect(def.dealerSoft17).toBe("H17");
  });

  it("throws for invalid input rather than persisting a partial record", () => {
    expect(() => buildGameDefinition({ ...GAME_DEFINITION_PRESETS["vegas-strip-6d-s17"], name: "" })).toThrow();
  });
});

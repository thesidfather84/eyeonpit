import { describe, expect, it } from "vitest";
import { buildGameDefinition, GAME_DEFINITION_PRESETS } from "@/lib/gold-standard/gameDefinition";
import { gameFamilyOf, wrapBlackjackGameDefinition } from "./genericGameDefinition";

describe("wrapBlackjackGameDefinition — non-breaking umbrella over the existing GameDefinition", () => {
  it("wraps a real, existing GameDefinition built from a preset, unchanged", () => {
    const definition = buildGameDefinition(GAME_DEFINITION_PRESETS["vegas-strip-6d-s17"]);
    const wrapped = wrapBlackjackGameDefinition(definition);
    expect(wrapped.gameFamily).toBe("blackjack");
    expect(wrapped.definition).toBe(definition); // same reference — never a copy/rewrite
  });

  it("gameFamilyOf reads the discriminant correctly", () => {
    const definition = buildGameDefinition(GAME_DEFINITION_PRESETS["single-deck-h17"]);
    const wrapped = wrapBlackjackGameDefinition(definition);
    expect(gameFamilyOf(wrapped)).toBe("blackjack");
  });
});

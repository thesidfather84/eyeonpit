import { describe, expect, it } from "vitest";
import { ALL_GAME_FAMILIES, GAME_FAMILY_STATUS } from "./gameFamily";

describe("GAME_FAMILY_STATUS", () => {
  it("marks blackjack IMPLEMENTED and every other family PLANNED", () => {
    expect(GAME_FAMILY_STATUS.blackjack).toBe("IMPLEMENTED");
    for (const family of ALL_GAME_FAMILIES) {
      if (family === "blackjack") continue;
      expect(GAME_FAMILY_STATUS[family]).toBe("PLANNED");
    }
  });

  it("has a status entry for every declared family, none missing", () => {
    for (const family of ALL_GAME_FAMILIES) {
      expect(GAME_FAMILY_STATUS[family]).toBeDefined();
    }
  });
});

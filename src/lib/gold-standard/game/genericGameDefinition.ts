import type { GameDefinition } from "@/lib/gold-standard/gameDefinition";
import type { GameFamily } from "./gameFamily";

/**
 * PRIORITY 1.8-6 — the generic GameDefinition umbrella. A discriminated
 * union so the EXISTING, unchanged `GameDefinition` (blackjack-specific,
 * see gameDefinition.ts) can eventually sit alongside future game
 * families' own definition shapes WITHOUT rewriting blackjack's own type
 * or any code that already depends on it — see this file's own
 * non-breaking-ness proof in genericGameDefinition.test.ts.
 *
 * Today there is exactly ONE real member of this union
 * (`{ gameFamily: "blackjack" }`) — every other GameFamily is PLANNED, not
 * implemented (see gameFamily.ts's own status map). Adding a second real
 * game means adding a second member to this union and that game's own
 * definition type, never touching `blackjack`'s existing shape.
 */
export type AnyGameDefinition = { gameFamily: "blackjack"; definition: GameDefinition };

export function wrapBlackjackGameDefinition(definition: GameDefinition): AnyGameDefinition {
  return { gameFamily: "blackjack", definition };
}

export function gameFamilyOf(def: AnyGameDefinition): GameFamily {
  return def.gameFamily;
}

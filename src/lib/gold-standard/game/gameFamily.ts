/**
 * PRIORITY 1.8-6 — the game-family taxonomy every future generic
 * GameDefinition/CountMethod interface is built around. "Do NOT implement
 * all games now" — only `"blackjack"` is IMPLEMENTED; every other family
 * is a named, documented PLANNED target so future work can be added
 * without inventing a new taxonomy later.
 */
export type GameFamily =
  | "blackjack"
  | "spanish-21"
  | "free-bet-blackjack"
  | "other-blackjack-variant"
  | "baccarat"
  | "baccarat-side-bet"
  | "proprietary-shoe-game";

export const ALL_GAME_FAMILIES: GameFamily[] = [
  "blackjack",
  "spanish-21",
  "free-bet-blackjack",
  "other-blackjack-variant",
  "baccarat",
  "baccarat-side-bet",
  "proprietary-shoe-game",
];

export type GameFamilyStatus = "IMPLEMENTED" | "PLANNED";

export const GAME_FAMILY_STATUS: Record<GameFamily, GameFamilyStatus> = {
  blackjack: "IMPLEMENTED",
  "spanish-21": "PLANNED",
  "free-bet-blackjack": "PLANNED",
  "other-blackjack-variant": "PLANNED",
  baccarat: "PLANNED",
  "baccarat-side-bet": "PLANNED",
  "proprietary-shoe-game": "PLANNED",
};

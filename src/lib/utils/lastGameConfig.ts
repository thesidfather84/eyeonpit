import type { GameConfig } from "@/types/investigation";

const STORAGE_KEY = "eyeonpit:last-game-config";

export interface StoredLastConfig {
  config: GameConfig;
  tableNumber: string;
}

/** Best-effort only — losing the "last setup" convenience (quota, private browsing) is never worth surfacing an error for. */
export function rememberLastGameConfig(config: GameConfig, tableNumber: string): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredLastConfig = { config, tableNumber };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignored — see above.
  }
}

export function loadLastGameConfig(): StoredLastConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredLastConfig;
  } catch {
    return null;
  }
}

/** e.g. "8D Shoe · H17 · 3:2 · 7 Seats · Left to Right" — the one-line preview next to "Use Last Table Setup". */
export function formatLastConfigSummary(stored: StoredLastConfig): string {
  const { config } = stored;
  const deckPart = config.format === "shoe" ? `${config.deckCount}D Shoe` : `${config.deckCount}D`;
  const softPart = config.ruleProfile.dealerHitsSoft17 ? "H17" : "S17";
  const directionPart = config.entryDirection === "ltr" ? "Left to Right" : "Right to Left";
  return [
    deckPart,
    softPart,
    config.ruleProfile.blackjackPayout,
    `${config.playerSpotCount} Seats`,
    directionPart,
  ].join(" · ");
}

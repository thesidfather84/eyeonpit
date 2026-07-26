import type { TerminologyDictionary } from "@/lib/terminology";
import type { GameConfig, Investigation } from "@/types/investigation";

/** The unified GameConfig shape QuickSetupSheet edits, read back out of an Investigation's flat fields — nothing is duplicated in storage. */
export function gameConfigFromInvestigation(investigation: Investigation): GameConfig {
  return {
    gameType: investigation.gameType,
    format: investigation.blackjackFormat,
    deckCount: investigation.shoeTotalDecks,
    ruleProfile: investigation.ruleProfile,
    entryDirection: investigation.entryDirection,
    entryMode: investigation.entryMode,
    playerSpotCount: investigation.playerSpotCount,
    practiceMode: investigation.practiceMode,
    pitArea: investigation.pitArea,
    investigationLabel: investigation.investigationLabel,
  };
}

/** Compact header summary, e.g. "BJ · 8D SHOE · H17 · 3:2 · L→R · SHOE 2" or "BJ · 1D · S17 · 3:2 · R→L · DECK 3". */
export function formatGameConfigSummary(investigation: Investigation, shoeOrDeckNumber: number): string {
  const deckPart =
    investigation.blackjackFormat === "shoe"
      ? `${investigation.shoeTotalDecks}D SHOE`
      : `${investigation.shoeTotalDecks}D`;
  const softPart = investigation.ruleProfile.dealerHitsSoft17 ? "H17" : "S17";
  const directionPart = investigation.entryDirection === "ltr" ? "L→R" : "R→L";
  const countLabel = investigation.blackjackFormat === "shoe" ? "SHOE" : "DECK";

  return [
    "BJ",
    deckPart,
    softPart,
    investigation.ruleProfile.blackjackPayout,
    directionPart,
    `${countLabel} ${shoeOrDeckNumber}`,
  ].join(" · ");
}

/** t.resetShoe for shoe games, "New Deck" for single/double deck — same reset action underneath (advanceRound), just labeled for what the format actually is. Deck resets have no separate terminology mapping, so that label stays fixed across every language level. */
export function newShoeOrDeckLabel(investigation: Investigation, t: TerminologyDictionary): string {
  return investigation.blackjackFormat === "shoe" ? t.resetShoe : "New Deck";
}

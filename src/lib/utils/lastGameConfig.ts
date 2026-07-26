import { DEFAULT_GAME_CONFIG, RULE_PROFILE_PRESETS } from "@/types/investigation";
import type {
  BlackjackFormat,
  EntryDirection,
  EntryMode,
  GameConfig,
  RuleProfile,
  RuleProfileId,
} from "@/types/investigation";

const STORAGE_KEY = "eyeonpit:last-game-config";

/** Bump when the on-disk envelope shape changes in a way loadLastGameConfig's validation needs to handle differently. */
const CURRENT_VERSION = 1;

export interface StoredLastConfig {
  config: GameConfig;
  tableNumber: string;
}

interface StoredEnvelope extends StoredLastConfig {
  version: number;
}

/** Best-effort only — losing the "last setup" convenience (quota, private browsing) is never worth surfacing an error for. */
export function rememberLastGameConfig(config: GameConfig, tableNumber: string): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredEnvelope = { version: CURRENT_VERSION, config, tableNumber };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignored — see above.
  }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

const BLACKJACK_FORMATS: BlackjackFormat[] = ["single-deck", "double-deck", "shoe"];
const ENTRY_DIRECTIONS: EntryDirection[] = ["ltr", "rtl"];
const ENTRY_MODES: EntryMode[] = ["free", "guided"];
const RULE_PROFILE_IDS: RuleProfileId[] = ["standard", "3-2-h17", "3-2-s17", "6-5-h17", "custom"];

function normalizeRuleProfile(raw: unknown): RuleProfile {
  if (!isObj(raw) || typeof raw.label !== "string") return RULE_PROFILE_PRESETS.standard;
  const payouts: RuleProfile["blackjackPayout"][] = ["3:2", "6:5", "custom"];
  return {
    id: oneOf(raw.id, RULE_PROFILE_IDS, "standard"),
    label: raw.label,
    blackjackPayout: oneOf(raw.blackjackPayout, payouts, "3:2"),
    dealerHitsSoft17: typeof raw.dealerHitsSoft17 === "boolean" ? raw.dealerHitsSoft17 : false,
    customNotes: typeof raw.customNotes === "string" ? raw.customNotes : "",
  };
}

/** Rebuilds a safe GameConfig from a parsed-but-untrusted value — same defensive posture as lib/db/normalizeInvestigation.ts, just for this one localStorage envelope. Never throws; anything missing/wrong-typed falls back to DEFAULT_GAME_CONFIG's corresponding field. */
function normalizeGameConfig(raw: unknown): GameConfig {
  const r = isObj(raw) ? raw : {};
  return {
    gameType: "blackjack",
    format: oneOf(r.format, BLACKJACK_FORMATS, DEFAULT_GAME_CONFIG.format),
    deckCount: typeof r.deckCount === "number" && Number.isFinite(r.deckCount) ? r.deckCount : DEFAULT_GAME_CONFIG.deckCount,
    ruleProfile: normalizeRuleProfile(r.ruleProfile),
    entryDirection: oneOf(r.entryDirection, ENTRY_DIRECTIONS, DEFAULT_GAME_CONFIG.entryDirection),
    entryMode: oneOf(r.entryMode, ENTRY_MODES, DEFAULT_GAME_CONFIG.entryMode),
    playerSpotCount:
      typeof r.playerSpotCount === "number" && Number.isFinite(r.playerSpotCount)
        ? r.playerSpotCount
        : DEFAULT_GAME_CONFIG.playerSpotCount,
    practiceMode: typeof r.practiceMode === "boolean" ? r.practiceMode : DEFAULT_GAME_CONFIG.practiceMode,
    pitArea: typeof r.pitArea === "string" ? r.pitArea : "",
    investigationLabel: typeof r.investigationLabel === "string" ? r.investigationLabel : "",
  };
}

/**
 * Loads and validates the "last table setup" envelope. Anything short of a
 * fully well-formed, current-version record returns null — the only
 * consumer (EmptyConsole's "Use Last Table Setup" button) already treats
 * null as "don't show the button", which is exactly the right fallback for
 * a corrupted, hand-edited, or pre-versioning record: skip the shortcut
 * rather than hand a malformed GameConfig to Quick Setup.
 */
export function loadLastGameConfig(): StoredLastConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isObj(parsed) || parsed.version !== CURRENT_VERSION) return null;
    if (typeof parsed.tableNumber !== "string") return null;
    return { config: normalizeGameConfig(parsed.config), tableNumber: parsed.tableNumber };
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

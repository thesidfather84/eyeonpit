import { v4 as uuidv4 } from "uuid";
import {
  INVESTIGATION_SCHEMA_VERSION,
  RULE_PROFILE_PRESETS,
  DEFAULT_GAME_CONFIG,
  type BlackjackFormat,
  type CardCode,
  type CorrelationScores,
  type CountingSystem,
  type DealerHand,
  type EntryDirection,
  type EntryMode,
  type EventLogEntry,
  type EventType,
  type HandOutcome,
  type Investigation,
  type InvestigationStatus,
  type NoteEntry,
  type PlayerAction,
  type PlayerGroup,
  type Rank,
  type Round,
  type RuleProfile,
  type SeatRoundRecord,
  type Suit,
  type SyncStatus,
  type WagerChange,
  type WagerDirection,
} from "@/types/investigation";

/**
 * Every read of a persisted Investigation goes through here first. Dexie
 * hands back whatever bytes were written under that key, no matter how old —
 * a record from a build several shapes ago, a hand-edited import, or (in
 * dev) a partially-typed fixture. Nothing downstream (shoeStats, the live
 * screen, exports) is written to defend against missing fields, so this is
 * the one place that must never trust the shape it's given.
 *
 * Every normalize* function below accepts `unknown` and always returns a
 * fully-formed value — there is no failure path, only defaults.
 */

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function nullableNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function nullableStr(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS: Suit[] = ["♠", "♥", "♦", "♣", "unspecified"];
const PLAYER_ACTIONS: PlayerAction[] = [
  "hit", "stand", "double", "split", "insurance", "surrender", "blackjack", "other",
];
const HAND_OUTCOMES: Exclude<HandOutcome, null>[] = [
  "win", "loss", "push", "blackjack", "surrender", "void",
];
const EVENT_TYPES: EventType[] = [
  "card", "seat-select", "bet-change", "action", "dealer-reveal", "correction",
  "round-saved", "note", "shoe", "misdeal", "table-event",
];

function normalizeCard(raw: unknown): CardCode | null {
  if (!isObj(raw)) return null;
  const rank = raw.rank;
  if (typeof rank !== "string" || !RANKS.includes(rank as Rank)) return null;
  return { rank: rank as Rank, suit: oneOf(raw.suit, SUITS, "unspecified") };
}

function normalizeCardList(raw: unknown): CardCode[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeCard).filter((c): c is CardCode => c !== null);
}

function normalizeWagerChange(raw: unknown): WagerChange {
  const directions: WagerDirection[] = ["up", "down", "same", "first"];
  return {
    direction: oneOf(isObj(raw) ? raw.direction : undefined, directions, "first"),
    amount: isObj(raw) ? nullableNum(raw.amount) : null,
    overridden: isObj(raw) ? bool(raw.overridden, false) : false,
  };
}

function normalizeSeatRecord(raw: unknown, seatNumber: number): SeatRoundRecord {
  const r = isObj(raw) ? raw : {};
  return {
    seatNumber: num(r.seatNumber, seatNumber),
    startingWagerAmount: nullableNum(r.startingWagerAmount),
    betAmount: nullableNum(r.betAmount),
    wagerChange: normalizeWagerChange(r.wagerChange),
    insuranceAmount: nullableNum(r.insuranceAmount),
    doubled: bool(r.doubled, false),
    doubledAtCardCount: nullableNum(r.doubledAtCardCount),
    playerCards: normalizeCardList(r.playerCards),
    actions: Array.isArray(r.actions)
      ? r.actions.filter((a): a is PlayerAction => PLAYER_ACTIONS.includes(a))
      : [],
    outcome: HAND_OUTCOMES.includes(r.outcome as (typeof HAND_OUTCOMES)[number])
      ? (r.outcome as HandOutcome)
      : null,
    deviationNote: str(r.deviationNote),
    observationNote: str(r.observationNote),
  };
}

function normalizeSeatMap(raw: unknown): Partial<Record<number, SeatRoundRecord>> {
  if (!isObj(raw)) return {};
  const out: Partial<Record<number, SeatRoundRecord>> = {};
  for (const [key, value] of Object.entries(raw)) {
    const seatNumber = Number(key);
    if (!Number.isFinite(seatNumber)) continue;
    out[seatNumber] = normalizeSeatRecord(value, seatNumber);
  }
  return out;
}

/**
 * Handles both the current shape (schemaVersion 2+: a flat `cards` list)
 * and the legacy one (schemaVersion 1 and earlier: separate upcard/
 * holeCard/holeCardRevealed/drawCards fields from the old hidden-card
 * privacy model). A legacy hole card the operator had entered — even if
 * the old UI hadn't flagged it "revealed" yet — was still a real observed
 * card, so it carries over regardless of that now-removed flag; only its
 * position in the chronological list is a best-effort guess (upcard,
 * then hole, then draws), since the legacy shape never recorded true
 * entry order across those three buckets.
 */
function normalizeDealerHand(raw: unknown): DealerHand {
  const r = isObj(raw) ? raw : {};
  if (Array.isArray(r.cards)) {
    return { cards: normalizeCardList(r.cards) };
  }
  const legacyCards = [normalizeCard(r.upcard), normalizeCard(r.holeCard)].filter(
    (c): c is CardCode => c !== null
  );
  return { cards: [...legacyCards, ...normalizeCardList(r.drawCards)] };
}

function normalizeEventLog(raw: unknown): EventLogEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObj).map((e) => ({
    id: str(e.id, uuidv4()),
    timestamp: str(e.timestamp, new Date(0).toISOString()),
    type: oneOf(e.type, EVENT_TYPES, "correction"),
    message: str(e.message),
  }));
}

function normalizeRound(raw: unknown, index: number): Round {
  const r = isObj(raw) ? raw : {};
  const now = new Date(0).toISOString();
  return {
    id: str(r.id, uuidv4()),
    roundNumber: num(r.roundNumber, index + 1),
    shoeNumber: num(r.shoeNumber, 1),
    startTime: str(r.startTime, now),
    videoTimestamp: nullableStr(r.videoTimestamp),
    dealerHand: normalizeDealerHand(r.dealerHand),
    seats: normalizeSeatMap(r.seats),
    splitHands: normalizeSeatMap(r.splitHands),
    runningCount: nullableNum(r.runningCount),
    trueCount: nullableNum(r.trueCount),
    operatorNote: str(r.operatorNote),
    eventLog: normalizeEventLog(r.eventLog),
    completed: bool(r.completed, false),
    createdAt: str(r.createdAt, now),
    updatedAt: str(r.updatedAt, now),
  };
}

function normalizeRoundList(raw: unknown): Round[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    // An investigation with zero rounds is unplayable and every consumer
    // (computeShoeStats, the live screen) assumes at least one exists —
    // seed the same empty Round shape createInvestigation() starts with.
    return [normalizeRound({}, 0)];
  }
  return raw.map(normalizeRound);
}

function normalizeRuleProfile(raw: unknown): RuleProfile {
  if (!isObj(raw) || typeof raw.id !== "string") return RULE_PROFILE_PRESETS.standard;
  const payouts: RuleProfile["blackjackPayout"][] = ["3:2", "6:5", "custom"];
  return {
    id: oneOf(raw.id, ["standard", "3-2-h17", "3-2-s17", "6-5-h17", "custom"] as const, "standard"),
    label: str(raw.label, "Standard"),
    blackjackPayout: oneOf(raw.blackjackPayout, payouts, "3:2"),
    dealerHitsSoft17: bool(raw.dealerHitsSoft17, false),
    customNotes: str(raw.customNotes),
  };
}

function normalizePlayerGroups(raw: unknown): Record<string, PlayerGroup> {
  if (!isObj(raw)) return {};
  const out: Record<string, PlayerGroup> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!isObj(value)) continue;
    out[id] = { id: str(value.id, id), label: str(value.label, "P?"), description: nullableStr(value.description) ?? undefined };
  }
  return out;
}

function normalizeSeatPlayerGroups(raw: unknown): Partial<Record<number, string>> {
  if (!isObj(raw)) return {};
  const out: Partial<Record<number, string>> = {};
  for (const [key, value] of Object.entries(raw)) {
    const seatNumber = Number(key);
    if (Number.isFinite(seatNumber) && typeof value === "string") out[seatNumber] = value;
  }
  return out;
}

function normalizeOccupiedSeats(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((n): n is number => typeof n === "number").sort((a, b) => a - b);
}

function normalizeNotes(raw: unknown): NoteEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObj).map((n) => ({
    id: str(n.id, uuidv4()),
    timestamp: str(n.timestamp, new Date(0).toISOString()),
    text: str(n.text),
  }));
}

function normalizeCorrelationScores(raw: unknown): Record<number, CorrelationScores> {
  if (!isObj(raw)) return {};
  const out: Record<number, CorrelationScores> = {};
  for (const [key, value] of Object.entries(raw)) {
    const seatNumber = Number(key);
    if (!Number.isFinite(seatNumber) || !isObj(value)) continue;
    out[seatNumber] = {
      hiLo: nullableNum(value.hiLo),
      ko: nullableNum(value.ko),
      zen: nullableNum(value.zen),
      omegaII: nullableNum(value.omegaII),
      note: str(value.note),
    };
  }
  return out;
}

const COUNTING_SYSTEMS: CountingSystem[] = ["Hi-Lo", "KO", "Zen", "Omega II"];
const BLACKJACK_FORMATS: BlackjackFormat[] = ["single-deck", "double-deck", "shoe"];
const ENTRY_DIRECTIONS: EntryDirection[] = ["ltr", "rtl"];
const ENTRY_MODES: EntryMode[] = ["free", "guided"];
const STATUSES: InvestigationStatus[] = ["draft", "active", "paused", "closed"];
const SYNC_STATUSES: SyncStatus[] = ["local-only", "pending", "synced", "conflict"];

export interface NormalizeResult {
  investigation: Investigation;
  /** True if anything about the stored shape was behind current or had to be defaulted — signals the caller should persist the upgraded record. */
  migrated: boolean;
}

/**
 * Rebuilds a fully-formed, current-shape Investigation from whatever Dexie
 * returns. Every field gets a safe default if missing, malformed, or of the
 * wrong type — this function cannot throw. Always compare the input's
 * `schemaVersion` against `INVESTIGATION_SCHEMA_VERSION` via the returned
 * `migrated` flag rather than assuming the shape was already valid.
 */
export function normalizeInvestigation(raw: unknown): NormalizeResult {
  const r = isObj(raw) ? raw : {};
  const now = new Date(0).toISOString();
  const incomingVersion = num(r.schemaVersion, 0);

  const investigation: Investigation = {
    localId: str(r.localId, uuidv4()),
    displayId: str(r.displayId, "BJ-UNKNOWN-00000"),
    status: oneOf(r.status, STATUSES, "active"),
    isDemo: bool(r.isDemo, false),

    casino: str(r.casino),
    tableNumber: str(r.tableNumber),
    dealerName: str(r.dealerName),
    investigationDate: str(r.investigationDate, now.slice(0, 10)),
    operatorName: str(r.operatorName),

    occupiedSeats: normalizeOccupiedSeats(r.occupiedSeats),
    playerGroups: normalizePlayerGroups(r.playerGroups),
    seatPlayerGroups: normalizeSeatPlayerGroups(r.seatPlayerGroups),
    activeTarget: r.activeTarget === "dealer" || typeof r.activeTarget === "number" ? r.activeTarget : "dealer",

    countingSystem: oneOf(r.countingSystem, COUNTING_SYSTEMS, "Hi-Lo"),
    shoeTotalDecks: num(r.shoeTotalDecks, DEFAULT_GAME_CONFIG.deckCount),

    gameType: "blackjack",
    blackjackFormat: oneOf(r.blackjackFormat, BLACKJACK_FORMATS, DEFAULT_GAME_CONFIG.format),
    ruleProfile: normalizeRuleProfile(r.ruleProfile),
    entryDirection: oneOf(r.entryDirection, ENTRY_DIRECTIONS, DEFAULT_GAME_CONFIG.entryDirection),
    entryMode: oneOf(r.entryMode, ENTRY_MODES, DEFAULT_GAME_CONFIG.entryMode),
    playerSpotCount: num(r.playerSpotCount, DEFAULT_GAME_CONFIG.playerSpotCount),
    practiceMode: bool(r.practiceMode, DEFAULT_GAME_CONFIG.practiceMode),
    pitArea: str(r.pitArea),
    investigationLabel: str(r.investigationLabel),

    rounds: normalizeRoundList(r.rounds),

    executiveSummary: str(r.executiveSummary),
    surveillanceMemo: str(r.surveillanceMemo),
    operatorNotes: normalizeNotes(r.operatorNotes),

    correlationScores: normalizeCorrelationScores(r.correlationScores),

    pausedDurationMs: num(r.pausedDurationMs, 0),
    pausedAt: nullableStr(r.pausedAt),
    createdAt: str(r.createdAt, now),
    updatedAt: str(r.updatedAt, now),
    deviceId: str(r.deviceId, "unknown-device"),
    syncStatus: oneOf(r.syncStatus, SYNC_STATUSES, "local-only"),
    deletedAt: nullableStr(r.deletedAt),

    schemaVersion: INVESTIGATION_SCHEMA_VERSION,
  };

  return { investigation, migrated: incomingVersion !== INVESTIGATION_SCHEMA_VERSION };
}

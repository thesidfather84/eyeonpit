// Round-based blackjack investigation data model. See plan.md §2 (Rev. 4).
//
// A Round owns exactly one shared DealerHand. Dealer cards are never
// duplicated into a seat's record — every SeatRoundRecord in a Round
// references the same round-level dealerHand.

export type Rank =
  | "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

export type Suit = "♠" | "♥" | "♦" | "♣" | "unspecified";

export interface CardCode {
  rank: Rank;
  suit: Suit;
}

export type SyncStatus = "local-only" | "pending" | "synced" | "conflict";

export type InvestigationStatus = "draft" | "active" | "paused" | "closed";

export type HandOutcome =
  | "win" | "loss" | "push" | "blackjack" | "surrender" | "void" | null;

export type WagerDirection = "up" | "down" | "same" | "first";

export type PlayerAction =
  | "hit" | "stand" | "double" | "split" | "insurance" | "surrender" | "blackjack" | "other";

export type DealerResult = "stand" | "blackjack" | "bust" | null;

export type CountingSystem = "Hi-Lo" | "KO" | "Zen" | "Omega II";

/** Reserved for future non-blackjack games — only "blackjack" is implemented, but every game-config field lives under this so a second game type never has to reshape Investigation. */
export type GameType = "blackjack";

export type BlackjackFormat = "single-deck" | "double-deck" | "shoe";

export type EntryDirection = "ltr" | "rtl";

/**
 * Guided: automatic progression through seats (in entryDirection order)
 * after each card/result, for face-up games. Free: never auto-advances —
 * the operator selects each seat manually as it becomes observable, for
 * pitch/face-down games where surveillance has no forced order to follow.
 * A tap on any seat always overrides progression instantly in either mode.
 */
export type EntryMode = "free" | "guided";

export type RuleProfileId = "standard" | "3-2-h17" | "3-2-s17" | "6-5-h17" | "custom";

export interface RuleProfile {
  id: RuleProfileId;
  label: string; // e.g. "3:2 H17" — shown in the compact header summary
  blackjackPayout: "3:2" | "6:5" | "custom";
  dealerHitsSoft17: boolean;
  customNotes: string;
}

export const RULE_PROFILE_PRESETS: Record<Exclude<RuleProfileId, "custom">, RuleProfile> = {
  standard: {
    id: "standard",
    label: "Standard",
    blackjackPayout: "3:2",
    dealerHitsSoft17: false,
    customNotes: "",
  },
  "3-2-h17": {
    id: "3-2-h17",
    label: "3:2 H17",
    blackjackPayout: "3:2",
    dealerHitsSoft17: true,
    customNotes: "",
  },
  "3-2-s17": {
    id: "3-2-s17",
    label: "3:2 S17",
    blackjackPayout: "3:2",
    dealerHitsSoft17: false,
    customNotes: "",
  },
  "6-5-h17": {
    id: "6-5-h17",
    label: "6:5 H17",
    blackjackPayout: "6:5",
    dealerHitsSoft17: true,
    customNotes: "",
  },
};

/** The default deck count for each format — Shoe Game defaults to 6, but stays operator-adjustable (4/6/8/Custom). */
export const DEFAULT_DECK_COUNT_BY_FORMAT: Record<BlackjackFormat, number> = {
  "single-deck": 1,
  "double-deck": 2,
  shoe: 6,
};

/** Fast Start Mode defaults — Phase 1 sensible-defaults path, see plan.md-adjacent Quick Setup spec. */
export const DEFAULT_GAME_CONFIG: GameConfig = {
  gameType: "blackjack",
  format: "shoe",
  deckCount: 6,
  ruleProfile: RULE_PROFILE_PRESETS.standard,
  entryDirection: "ltr",
  entryMode: "guided",
  playerSpotCount: 7,
  practiceMode: false,
  pitArea: "",
  investigationLabel: "",
};

/**
 * Everything Quick Setup configures, grouped so it can be read/written as
 * one unit both pre-creation (Fast Start / Quick Setup on the empty
 * console) and mid-investigation (reopened from the live header) — table
 * identity (casino/tableNumber/dealerName) stays on Investigation directly
 * since those are operator-identity fields, not "game" fields.
 */
export interface GameConfig {
  gameType: GameType;
  format: BlackjackFormat;
  deckCount: number;
  ruleProfile: RuleProfile;
  entryDirection: EntryDirection;
  entryMode: EntryMode;
  playerSpotCount: number;
  practiceMode: boolean;
  pitArea: string;
  investigationLabel: string;
}

export type EventType =
  | "card"
  | "seat-select"
  | "bet-change"
  | "action"
  | "dealer-reveal"
  | "correction"
  | "round-saved"
  | "note"
  | "shoe"
  | "misdeal"
  | "table-event";

/** Table Events — logged, operator-triggered, not tied to any one seat's hand. */
export type TableEventKind =
  | "dealer-change"
  | "shuffle"
  | "seat-opens"
  | "seat-closes"
  | "player-joins"
  | "player-leaves"
  | "table-closed";

export interface EventLogEntry {
  id: string;
  timestamp: string;
  type: EventType;
  message: string;
}

export interface WagerChange {
  direction: WagerDirection;
  amount: number | null;
  /** True once an operator corrects an auto-computed value during Review. */
  overridden: boolean;
}

export interface SeatRoundRecord {
  seatNumber: number; // 1-7
  /** The hand's reference wager — what "Repeat Starting Wager" reapplies, and what Next Hand resets betAmount to. Untouched by Double. */
  startingWagerAmount: number | null;
  /** The hand's current wager — equals startingWagerAmount until Double doubles it. */
  betAmount: number | null;
  wagerChange: WagerChange;
  /** Separate side wager, independent of the main hand's bet. */
  insuranceAmount: number | null;
  doubled: boolean;
  /** playerCards.length at the moment Double was pressed — the hand locks once one more card has been added past this point. Null unless doubled. */
  doubledAtCardCount: number | null;
  playerCards: CardCode[];
  actions: PlayerAction[];
  outcome: HandOutcome; // "Result"
  deviationNote: string; // neutral, factual — e.g. "stood 16 v. dealer 10"
  observationNote: string;
}

export interface DealerHand {
  upcard: CardCode | null;
  holeCard: CardCode | null;
  /** Stays false — and the hole card stays hidden from every display/export — until the operator explicitly reveals it. */
  holeCardRevealed: boolean;
  drawCards: CardCode[];
  result: DealerResult;
}
// Dealer total is intentionally NOT stored here. It is always derived from
// upcard + (holeCard if revealed) + drawCards via computeHandTotal() in
// lib/utils/blackjackTotal.ts, so it can never drift out of sync with the
// cards actually entered.

export interface Round {
  id: string;
  roundNumber: number;
  shoeNumber: number;
  startTime: string; // ISO datetime, captured when the round begins
  videoTimestamp: string | null;
  dealerHand: DealerHand;
  /** Keyed 1-7; only occupied seats are populated. */
  seats: Partial<Record<number, SeatRoundRecord>>;
  /** A seat's second hand after Split — same shape as `seats`, keyed by the same seat number. Absent unless that seat has split this round. */
  splitHands: Partial<Record<number, SeatRoundRecord>>;
  /** Snapshotted when the round is finalized (Next Round / New Shoe) — see lib/counting-systems. */
  runningCount: number | null;
  trueCount: number | null;
  operatorNote: string;
  eventLog: EventLogEntry[];
  /** Explicit lock, not derived — set by "Complete Round", cleared by "Reopen Round". While true, no further entry is allowed for this round. */
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NoteEntry {
  id: string;
  timestamp: string;
  text: string;
}

/**
 * A player, identified only by a lightweight label — never a full profile.
 * Seats sharing a playerGroupId are the same person occupying multiple
 * betting spots; each seat still keeps its own bet/cards/actions/result.
 */
export interface PlayerGroup {
  id: string;
  label: string; // e.g. "P1" — operator-editable
  description?: string;
}

export interface CorrelationScores {
  hiLo: number | null;
  ko: number | null;
  zen: number | null;
  omegaII: number | null;
  note: string;
}

export interface Investigation {
  localId: string; // uuid — the real primary key
  displayId: string; // "BJ-20260725-00001" — see lib/investigation-id.ts for the sync caveat
  status: InvestigationStatus;
  isDemo: boolean;

  casino: string;
  tableNumber: string;
  dealerName: string;
  investigationDate: string; // ISO date
  operatorName: string;

  /** The single occupancy gate — any occupied seat can take bets/cards. Distinct from `activeTarget` below and from player grouping. */
  occupiedSeats: number[];
  playerGroups: Record<string, PlayerGroup>;
  /** seatNumber -> playerGroupId, only present for occupied seats. */
  seatPlayerGroups: Partial<Record<number, string>>;
  /** The live entry-target selection, persisted so a refresh lands back on the same seat/dealer instead of resetting. "dealer-hole" is never stored here — it collapses to "dealer", since it's a momentary sub-state of the reveal flow, not a place a reload should ever land. */
  activeTarget: number | "dealer";

  countingSystem: CountingSystem;
  /** Also GameConfig's "deck count" — one number, no separate duplicate field. Its meaning shifts slightly with format: exactly 1/2 for single/double deck, operator-chosen for a shoe game. */
  shoeTotalDecks: number;

  /** Game configuration — everything Quick Setup edits. Reserved for future non-blackjack games via `gameType`; only "blackjack" is implemented. */
  gameType: GameType;
  blackjackFormat: BlackjackFormat;
  ruleProfile: RuleProfile;
  entryDirection: EntryDirection;
  entryMode: EntryMode;
  /** How many betting spots the console renders — SEAT tiles are generated 1..playerSpotCount, not hardcoded to 7. */
  playerSpotCount: number;
  practiceMode: boolean;
  pitArea: string;
  investigationLabel: string;

  rounds: Round[];

  executiveSummary: string;
  surveillanceMemo: string;
  operatorNotes: NoteEntry[];

  correlationScores: Record<number, CorrelationScores>; // Phase 7

  pausedDurationMs: number;
  /** Set the instant status flips to "paused"; lets the elapsed timer reconstruct correctly even after a reload mid-pause. */
  pausedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deviceId: string;
  syncStatus: SyncStatus;
  deletedAt: string | null;
}

/** The current on-disk shape version, for future Dexie migrations. */
export const INVESTIGATION_SCHEMA_VERSION = 1;

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
  | "win" | "loss" | "push" | "blackjack" | "surrender" | null;

export type WagerDirection = "up" | "down" | "same" | "first";

export type PlayerAction = "hit" | "stand" | "double" | "split" | "surrender";

export type DealerResult = "stand" | "blackjack" | "bust" | null;

export interface WagerChange {
  direction: WagerDirection;
  amount: number | null;
  /** True once an operator corrects an auto-computed value during Review. */
  overridden: boolean;
}

export interface SeatRoundRecord {
  seatNumber: number; // 1-7
  betAmount: number | null;
  wagerChange: WagerChange;
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
  startTime: string; // ISO datetime, captured when the round begins
  videoTimestamp: string | null;
  dealerHand: DealerHand;
  /** Keyed 1-7; only active/tracked seats are populated. */
  seats: Partial<Record<number, SeatRoundRecord>>;
  runningCount: number | null;
  trueCount: number | null;
  operatorNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface NoteEntry {
  id: string;
  timestamp: string;
  text: string;
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

  activeSeatCount: number; // 1-7; editable mid-investigation
  trackedSeats: number[]; // subset of activeSeatCount
  initialWagers: Record<number, number>;

  rounds: Round[];

  executiveSummary: string;
  surveillanceMemo: string;
  operatorNotes: NoteEntry[];

  correlationScores: Record<number, CorrelationScores>; // Phase 7

  pausedDurationMs: number;
  createdAt: string;
  updatedAt: string;
  deviceId: string;
  syncStatus: SyncStatus;
  deletedAt: string | null;
}

/** The current on-disk shape version, for future Dexie migrations. */
export const INVESTIGATION_SCHEMA_VERSION = 1;

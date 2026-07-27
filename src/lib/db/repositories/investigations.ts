import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db/client";
import { generateInvestigationId } from "@/lib/investigation-id";
import { getOrCreateDeviceId } from "@/lib/utils/deviceId";
import { computeShoeStats } from "@/lib/analysis/shoeStats";
import { normalizeInvestigation } from "@/lib/db/normalizeInvestigation";
import { deriveHandOutcome } from "@/lib/utils/deriveHandOutcome";
import { diagnostics } from "@/lib/diagnostics/logger";
import type {
  BlackjackFormat,
  CountingSystem,
  EntryDirection,
  EntryMode,
  EventType,
  Investigation,
  InvestigationStatus,
  NoteEntry,
  PlayerGroup,
  Round,
  RuleProfile,
  SeatRoundRecord,
  TableEventKind,
  WagerChange,
} from "@/types/investigation";
import { DEFAULT_GAME_CONFIG, INVESTIGATION_SCHEMA_VERSION } from "@/types/investigation";

export interface CreateInvestigationInput {
  casino: string;
  tableNumber: string;
  dealerName: string;
  investigationDate: string; // ISO date, "2026-07-25"
  operatorName: string;
  countingSystem: CountingSystem;
  shoeTotalDecks: number;
  /** Defaults to 1 — matches whatever shoe count the pit is already on. */
  startingShoeNumber?: number;
  /** Optional, seeds the first operator note if provided. */
  setupNotes?: string;
  isDemo?: boolean;
  /** Defaults to "draft". The setup drawer passes "active" so the investigation is immediately the operator's active one. */
  status?: InvestigationStatus;
  /** Game-config fields — all optional, each falls back to DEFAULT_GAME_CONFIG (Fast Start Mode's "sensible defaults"). */
  blackjackFormat?: BlackjackFormat;
  ruleProfile?: RuleProfile;
  entryDirection?: EntryDirection;
  entryMode?: EntryMode;
  playerSpotCount?: number;
  practiceMode?: boolean;
  pitArea?: string;
  investigationLabel?: string;
}

/** How many investigations already exist locally for a given date — feeds ID generation. */
async function countInvestigationsForDate(isoDate: string): Promise<number> {
  const db = getDb();
  return db.investigations.where("investigationDate").equals(isoDate).count();
}

/** A brand-new, empty hand for a seat — the one place every SeatRoundRecord's defaults are defined. */
function createEmptySeatRecord(
  seatNumber: number,
  betAmount: number | null = null,
  wagerChange: WagerChange = { direction: "first", amount: null, overridden: false },
  startingWagerAmount: number | null = betAmount
): SeatRoundRecord {
  return {
    seatNumber,
    startingWagerAmount,
    betAmount,
    wagerChange,
    insuranceAmount: null,
    doubled: false,
    doubledAtCardCount: null,
    playerCards: [],
    actions: [],
    outcome: null,
    deviationNote: "",
    observationNote: "",
  };
}

/** A fresh, empty Round. Dealer cards live once on `dealerHand`, never duplicated per seat — plan.md §0.5/§2. Starts unlocked (`completed: false`). */
export function createRound(
  roundNumber: number,
  shoeNumber: number,
  seedSeats: Record<number, { betAmount: number | null; wagerChange: WagerChange }> = {}
): Round {
  const now = new Date().toISOString();
  const seats: Round["seats"] = {};

  for (const [seatKey, seed] of Object.entries(seedSeats)) {
    const seatNumber = Number(seatKey);
    seats[seatNumber] = createEmptySeatRecord(seatNumber, seed.betAmount, seed.wagerChange);
  }

  return {
    id: uuidv4(),
    roundNumber,
    shoeNumber,
    startTime: now,
    videoTimestamp: null,
    dealerHand: { cards: [] },
    seats,
    splitHands: {},
    runningCount: null,
    trueCount: null,
    operatorNote: "",
    eventLog: [],
    completed: false,
    createdAt: now,
    updatedAt: now,
  };
}

export async function createInvestigation(
  input: CreateInvestigationInput
): Promise<Investigation> {
  const db = getDb();
  const now = new Date().toISOString();
  const existingCount = await countInvestigationsForDate(input.investigationDate);

  const startingShoeNumber = input.startingShoeNumber ?? 1;
  // No seats are seeded here — every seat starts empty and is populated
  // live via occupySeat()/assignSeatToPlayerGroup() from the console.
  const round1 = createRound(1, startingShoeNumber);
  round1.eventLog.push({
    id: uuidv4(),
    timestamp: now,
    type: "round-saved",
    message: `Round 1 started (Shoe ${startingShoeNumber})`,
  });

  const setupNotes = input.setupNotes?.trim();
  const operatorNotes: NoteEntry[] = setupNotes
    ? [{ id: uuidv4(), timestamp: now, text: setupNotes }]
    : [];

  const investigation: Investigation = {
    localId: uuidv4(),
    displayId: generateInvestigationId(input.investigationDate, existingCount),
    status: input.status ?? "draft",
    isDemo: input.isDemo ?? false,

    casino: input.casino,
    tableNumber: input.tableNumber,
    dealerName: input.dealerName,
    investigationDate: input.investigationDate,
    operatorName: input.operatorName,

    occupiedSeats: [],
    playerGroups: {},
    seatPlayerGroups: {},
    activeTarget: "dealer",

    countingSystem: input.countingSystem,
    shoeTotalDecks: input.shoeTotalDecks,

    gameType: "blackjack",
    blackjackFormat: input.blackjackFormat ?? DEFAULT_GAME_CONFIG.format,
    ruleProfile: input.ruleProfile ?? DEFAULT_GAME_CONFIG.ruleProfile,
    entryDirection: input.entryDirection ?? DEFAULT_GAME_CONFIG.entryDirection,
    entryMode: input.entryMode ?? DEFAULT_GAME_CONFIG.entryMode,
    playerSpotCount: input.playerSpotCount ?? DEFAULT_GAME_CONFIG.playerSpotCount,
    practiceMode: input.practiceMode ?? DEFAULT_GAME_CONFIG.practiceMode,
    pitArea: input.pitArea?.trim() ?? "",
    investigationLabel: input.investigationLabel?.trim() ?? "",

    rounds: [round1],

    executiveSummary: "",
    surveillanceMemo: "",
    operatorNotes,

    correlationScores: {},

    pausedDurationMs: 0,
    pausedAt: null,
    createdAt: now,
    updatedAt: now,
    deviceId: getOrCreateDeviceId(),
    syncStatus: "local-only",
    deletedAt: null,
    schemaVersion: INVESTIGATION_SCHEMA_VERSION,
  };

  await db.investigations.add(investigation);
  return investigation;
}

/** Applies normalizeInvestigation() to a raw Dexie record and, if the stored shape was behind current, persists the upgraded version so future reads skip the migration. Never throws on malformed input — that's the entire point of routing every read through here. */
async function normalizeAndPersist(raw: unknown): Promise<Investigation> {
  const { investigation, migrated } = normalizeInvestigation(raw);
  if (migrated) {
    diagnostics.warn("investigation-migration", "record normalized/migrated on read", {
      investigationId: investigation.localId,
      incomingSchemaVersion: (raw as { schemaVersion?: unknown })?.schemaVersion,
      currentSchemaVersion: investigation.schemaVersion,
    });
    await getDb().investigations.put(investigation);
  }
  return investigation;
}

export async function getInvestigation(
  localId: string
): Promise<Investigation | undefined> {
  const raw = await getDb().investigations.get(localId);
  if (!raw) return undefined;
  return normalizeAndPersist(raw);
}

export interface ListInvestigationsOptions {
  /** Demo investigations are excluded by default at this layer — not just in the UI. See plan.md §4/§12 decision 3. */
  includeDemo?: boolean;
  status?: Investigation["status"];
}

export async function listInvestigations(
  options: ListInvestigationsOptions = {}
): Promise<Investigation[]> {
  const db = getDb();
  const rawAll = await db.investigations.toArray();
  const all = await Promise.all(rawAll.map(normalizeAndPersist));

  return all
    .filter((investigation) => investigation.deletedAt === null)
    .filter((investigation) => options.includeDemo || !investigation.isDemo)
    .filter((investigation) =>
      options.status ? investigation.status === options.status : true
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function updateInvestigation(
  localId: string,
  patch: Partial<Omit<Investigation, "localId">>
): Promise<void> {
  const db = getDb();
  await db.investigations.update(localId, {
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * The single mutation primitive for in-round edits (cards, bets, actions,
 * corrections, notes). Every call logs a real event onto the round's
 * eventLog — there is no code path that mutates a round silently. Plan.md
 * §5.1 / this build's "generated from real user actions" requirement.
 */
export async function mutateRound(
  investigationLocalId: string,
  roundId: string,
  updater: (round: Round) => Round,
  event: { type: EventType; message: string }
): Promise<Round> {
  const investigation = await getInvestigation(investigationLocalId);
  if (!investigation) {
    throw new Error(`Investigation ${investigationLocalId} not found.`);
  }

  const now = new Date().toISOString();
  let result: Round | undefined;

  const rounds = investigation.rounds.map((round) => {
    if (round.id !== roundId) return round;
    const mutated = updater(round);
    result = {
      ...mutated,
      eventLog: [
        ...mutated.eventLog,
        { id: uuidv4(), timestamp: now, type: event.type, message: event.message },
      ],
      updatedAt: now,
    };
    return result;
  });

  if (!result) {
    throw new Error(`Round ${roundId} not found in investigation ${investigationLocalId}.`);
  }

  await updateInvestigation(investigationLocalId, { rounds });
  return result;
}

/** Ensures the current round has a SeatRoundRecord for a newly-occupied/assigned seat, without disturbing any existing data. */
async function ensureSeatRecord(localId: string, seatNumber: number): Promise<void> {
  const investigation = await getInvestigation(localId);
  if (!investigation) return;
  const currentRound = investigation.rounds[investigation.rounds.length - 1];
  if (!currentRound || currentRound.seats[seatNumber]) return;

  const record = createEmptySeatRecord(seatNumber);
  const rounds = investigation.rounds.map((round) =>
    round.id === currentRound.id
      ? { ...round, seats: { ...round.seats, [seatNumber]: record } }
      : round
  );
  await updateInvestigation(localId, { rounds });
}

/** Soft delete only — see plan.md §5, deletions must be propagatable by a future sync backend. */
export async function softDeleteInvestigation(localId: string): Promise<void> {
  await updateInvestigation(localId, { deletedAt: new Date().toISOString() });
}

// ---------------------------------------------------------------------------
// Seat occupancy, active selection, and player grouping are three separate
// concepts (never conflated): occupancy below persists at the investigation
// level across rounds; "active selection" lives only in InvestigationContext
// (never persisted); player grouping is its own map, independent of both.
// ---------------------------------------------------------------------------

/** Appends one event to the current (last) round's log, alongside whatever investigation-level fields also changed in the same write. */
function appendEventToRounds(
  rounds: Round[],
  event: { type: EventType; message: string }
): Round[] {
  if (rounds.length === 0) return rounds;
  const now = new Date().toISOString();
  const lastIndex = rounds.length - 1;
  return rounds.map((round, i) =>
    i === lastIndex
      ? {
          ...round,
          eventLog: [
            ...round.eventLog,
            { id: uuidv4(), timestamp: now, type: event.type, message: event.message },
          ],
          updatedAt: now,
        }
      : round
  );
}

/** Normal tap on an empty seat: occupy it and auto-create a brand-new player group for it. No-ops if already occupied. */
export async function occupySeat(localId: string, seatNumber: number): Promise<void> {
  const investigation = await getInvestigation(localId);
  if (!investigation) throw new Error(`Investigation ${localId} not found.`);
  if (investigation.occupiedSeats.includes(seatNumber)) return;

  const groupNumber = Object.keys(investigation.playerGroups).length + 1;
  const group: PlayerGroup = { id: uuidv4(), label: `P${groupNumber}` };

  await updateInvestigation(localId, {
    occupiedSeats: [...investigation.occupiedSeats, seatNumber].sort((a, b) => a - b),
    playerGroups: { ...investigation.playerGroups, [group.id]: group },
    seatPlayerGroups: { ...investigation.seatPlayerGroups, [seatNumber]: group.id },
    rounds: appendEventToRounds(investigation.rounds, {
      type: "seat-select",
      message: `Seat ${seatNumber} occupied — ${group.label}`,
    }),
  });
  await ensureSeatRecord(localId, seatNumber);
}

/** True if the current round already has a bet, cards, actions, or a result recorded for this seat — the gate for whether Mark Empty needs confirmation. */
function seatRecordHasData(seat: SeatRoundRecord | undefined): boolean {
  if (!seat) return false;
  return (
    seat.betAmount != null ||
    seat.playerCards.length > 0 ||
    seat.actions.length > 0 ||
    seat.outcome != null
  );
}

export function seatHasCurrentRoundData(round: Round, seatNumber: number): boolean {
  return seatRecordHasData(round.seats[seatNumber]) || seatRecordHasData(round.splitHands[seatNumber]);
}

/**
 * Removes a seat from play. Only the *current* round's seat record is
 * cleared — every completed round already in history keeps its own,
 * untouched. Occupancy and player-group assignment are investigation-level,
 * so this is the only place that needs to drop them.
 */
export async function markSeatEmpty(localId: string, seatNumber: number): Promise<void> {
  const investigation = await getInvestigation(localId);
  if (!investigation) throw new Error(`Investigation ${localId} not found.`);

  const nextSeatGroups = { ...investigation.seatPlayerGroups };
  delete nextSeatGroups[seatNumber];

  const currentRound = investigation.rounds[investigation.rounds.length - 1];
  const rounds = currentRound
    ? investigation.rounds.map((round) => {
        if (round.id !== currentRound.id) return round;
        const seats = { ...round.seats };
        delete seats[seatNumber];
        const splitHands = { ...round.splitHands };
        delete splitHands[seatNumber];
        return { ...round, seats, splitHands };
      })
    : investigation.rounds;

  await updateInvestigation(localId, {
    occupiedSeats: investigation.occupiedSeats.filter((s) => s !== seatNumber),
    seatPlayerGroups: nextSeatGroups,
    rounds: appendEventToRounds(rounds, {
      type: "seat-select",
      message: `Seat ${seatNumber} marked empty`,
    }),
  });
}

/** Assigns a seat to an *existing* player group — occupies the seat first if it wasn't already. Used by both "Add as Additional Spot" (empty seat) and "Link to Another Seat" (occupied seat). */
export async function assignSeatToPlayerGroup(
  localId: string,
  seatNumber: number,
  playerGroupId: string
): Promise<void> {
  const investigation = await getInvestigation(localId);
  if (!investigation) throw new Error(`Investigation ${localId} not found.`);

  const nextOccupied = investigation.occupiedSeats.includes(seatNumber)
    ? investigation.occupiedSeats
    : [...investigation.occupiedSeats, seatNumber].sort((a, b) => a - b);
  const group = investigation.playerGroups[playerGroupId];

  await updateInvestigation(localId, {
    occupiedSeats: nextOccupied,
    seatPlayerGroups: { ...investigation.seatPlayerGroups, [seatNumber]: playerGroupId },
    rounds: appendEventToRounds(investigation.rounds, {
      type: "seat-select",
      message: `Seat ${seatNumber} linked to ${group?.label ?? "player group"}`,
    }),
  });
  await ensureSeatRecord(localId, seatNumber);
}

/** Links targetSeatNumber to sourceSeatNumber's existing player group. */
export async function linkSeats(
  localId: string,
  sourceSeatNumber: number,
  targetSeatNumber: number
): Promise<void> {
  const investigation = await getInvestigation(localId);
  if (!investigation) throw new Error(`Investigation ${localId} not found.`);
  const groupId = investigation.seatPlayerGroups[sourceSeatNumber];
  if (!groupId) throw new Error(`Seat ${sourceSeatNumber} has no player group to link to.`);
  await assignSeatToPlayerGroup(localId, targetSeatNumber, groupId);
}

/** Detaches a seat from whatever group it's in, giving it a brand-new group of its own. */
export async function unlinkSeat(localId: string, seatNumber: number): Promise<void> {
  const investigation = await getInvestigation(localId);
  if (!investigation) throw new Error(`Investigation ${localId} not found.`);

  const groupNumber = Object.keys(investigation.playerGroups).length + 1;
  const group: PlayerGroup = { id: uuidv4(), label: `P${groupNumber}` };

  await updateInvestigation(localId, {
    playerGroups: { ...investigation.playerGroups, [group.id]: group },
    seatPlayerGroups: { ...investigation.seatPlayerGroups, [seatNumber]: group.id },
    rounds: appendEventToRounds(investigation.rounds, {
      type: "seat-select",
      message: `Seat ${seatNumber} unlinked — now ${group.label}`,
    }),
  });
}

/** Creates a new, unassigned player group — for flows that need a group id before any seat is linked to it. Most seat actions (occupySeat, unlinkSeat) create their own group inline and never need this directly. */
export async function createPlayerGroup(localId: string, label?: string): Promise<PlayerGroup> {
  const investigation = await getInvestigation(localId);
  if (!investigation) throw new Error(`Investigation ${localId} not found.`);

  const groupNumber = Object.keys(investigation.playerGroups).length + 1;
  const group: PlayerGroup = { id: uuidv4(), label: label?.trim() || `P${groupNumber}` };

  await updateInvestigation(localId, {
    playerGroups: { ...investigation.playerGroups, [group.id]: group },
  });
  return group;
}

export interface GameConfigPatch {
  tableNumber?: string;
  countingSystem?: CountingSystem;
  blackjackFormat?: BlackjackFormat;
  shoeTotalDecks?: number;
  ruleProfile?: RuleProfile;
  entryDirection?: EntryDirection;
  entryMode?: EntryMode;
  playerSpotCount?: number;
  practiceMode?: boolean;
  pitArea?: string;
  investigationLabel?: string;
}

/** Safe-field path — table label, entry direction, rule profile, seat count, etc. Never touches counting-relevant state, so it applies immediately with no confirmation. */
export async function updateGameConfig(localId: string, patch: GameConfigPatch): Promise<void> {
  const investigation = await getInvestigation(localId);
  if (!investigation) throw new Error(`Investigation ${localId} not found.`);
  await updateInvestigation(localId, {
    ...patch,
    rounds: appendEventToRounds(investigation.rounds, {
      type: "correction",
      message: "Game configuration updated",
    }),
  });
}

/**
 * The "Recalculate" branch of a risky config change (format/deck count/
 * counting system). Nothing about recorded cards changes — every count is
 * always computed live from them — so applying the new config in place is
 * the entire recalculation; the next render of computeShoeStats() picks it
 * up automatically.
 */
export async function updateGameConfigAndRecalculate(
  localId: string,
  patch: GameConfigPatch
): Promise<void> {
  await updateGameConfig(localId, patch);
}

/** The "Start New Shoe" branch of a risky config change — applies the patch, then resets the shoe exactly like a normal New Shoe, voiding the current round first if it wasn't already complete. */
export async function updateGameConfigAndStartNewShoe(
  localId: string,
  patch: GameConfigPatch
): Promise<void> {
  const investigation = await getInvestigation(localId);
  if (!investigation) throw new Error(`Investigation ${localId} not found.`);
  await updateInvestigation(localId, patch);

  const currentRound = investigation.rounds[investigation.rounds.length - 1];
  await advanceRound(localId, { newShoe: true, voidCurrentRound: !currentRound.completed });
}

/** Renames a player group's label (e.g. "P1" -> a short operator label). Applies to every seat sharing that group. */
export async function renamePlayerGroup(
  localId: string,
  playerGroupId: string,
  label: string
): Promise<void> {
  const investigation = await getInvestigation(localId);
  if (!investigation) throw new Error(`Investigation ${localId} not found.`);
  const group = investigation.playerGroups[playerGroupId];
  if (!group) return;
  await updateInvestigation(localId, {
    playerGroups: { ...investigation.playerGroups, [playerGroupId]: { ...group, label } },
  });
}

/** Sets a seat's bet for the current round — independent of any other seat, including ones sharing the same player group. */
export async function updateSeatBet(
  investigationLocalId: string,
  roundId: string,
  seatNumber: number,
  amount: number,
  wagerChange: WagerChange
): Promise<Round> {
  return mutateRound(
    investigationLocalId,
    roundId,
    (round) => {
      const seat = round.seats[seatNumber];
      if (!seat) return round;
      return {
        ...round,
        seats: {
          ...round.seats,
          [seatNumber]: { ...seat, betAmount: amount, startingWagerAmount: amount, wagerChange },
        },
      };
    },
    { type: "bet-change", message: `Seat ${seatNumber} bet set to $${amount}` }
  );
}

/** Creates a seat's second hand after Split — standard rule: the new hand starts with its own copy of the current wager, no cards of its own yet. Tracked entirely independently from the primary hand from this point on. */
export async function splitSeat(
  investigationLocalId: string,
  roundId: string,
  seatNumber: number
): Promise<Round> {
  return mutateRound(
    investigationLocalId,
    roundId,
    (round) => {
      const seat = round.seats[seatNumber];
      if (!seat || round.splitHands[seatNumber]) return round;
      const secondHand = createEmptySeatRecord(
        seatNumber,
        seat.betAmount,
        { direction: "same", amount: 0, overridden: false },
        seat.startingWagerAmount
      );
      return { ...round, splitHands: { ...round.splitHands, [seatNumber]: secondHand } };
    },
    { type: "action", message: `Seat ${seatNumber}: Split` }
  );
}

export type RoundExceptionReason = "misdeal" | "incomplete-observation" | "dealer-error";

const ROUND_EXCEPTION_LABELS: Record<RoundExceptionReason, string> = {
  misdeal: "Misdeal",
  "incomplete-observation": "Incomplete Observation",
  "dealer-error": "Dealer Error",
};

/**
 * The round-level exception path — used whenever the hand can't be resolved
 * normally (a genuine misdeal, the operator's view was blocked so cards
 * can't be trusted, or a dealer error occurred), including as the required
 * alternative to entering dealer cards before Next Hand. Distinct from
 * voiding a whole round: the current hand's outcomes are voided but its
 * already-exposed cards stay exactly as recorded (running count and shoe
 * stay correct off them), and play continues in the same shoe. Locks the
 * round the same way Complete Round does, since the hand is over either
 * way. Per-seat Void (SeatMoreActionsSheet) is the equivalent for a single
 * hand rather than the whole round.
 */
export async function misdealRound(
  localId: string,
  roundId: string,
  reason: RoundExceptionReason = "misdeal"
): Promise<void> {
  const investigation = await getInvestigation(localId);
  if (!investigation) throw new Error(`Investigation ${localId} not found.`);
  const now = new Date().toISOString();
  const label = ROUND_EXCEPTION_LABELS[reason];

  const rounds = investigation.rounds.map((round) => {
    if (round.id !== roundId) return round;

    const seats = { ...round.seats };
    for (const seatNumber of investigation.occupiedSeats) {
      const seat = seats[seatNumber];
      if (seat) seats[seatNumber] = { ...seat, outcome: "void" };
    }

    const splitHands = { ...round.splitHands };
    for (const [seatKey, hand] of Object.entries(splitHands)) {
      if (hand) splitHands[Number(seatKey)] = { ...hand, outcome: "void" };
    }

    return {
      ...round,
      seats,
      splitHands,
      completed: true,
      eventLog: [
        ...round.eventLog,
        { id: uuidv4(), timestamp: now, type: "misdeal" as EventType, message: `${label} — hand voided` },
      ],
      updatedAt: now,
    };
  });

  await updateInvestigation(localId, { rounds });
}

const TABLE_EVENT_LABELS: Record<TableEventKind, string> = {
  "dealer-change": "Dealer change",
  shuffle: "Shuffle",
  "seat-opens": "Seat opens",
  "seat-closes": "Seat closes",
  "player-joins": "Player joins",
  "player-leaves": "Player leaves",
  "table-closed": "Table closed",
};

/** Logs a table event to the current round — not tied to any one seat's hand (dealer change, shuffle, seats opening/closing, players joining/leaving, table closed). */
export async function logTableEvent(
  localId: string,
  kind: TableEventKind,
  detail?: string
): Promise<void> {
  const investigation = await getInvestigation(localId);
  if (!investigation) throw new Error(`Investigation ${localId} not found.`);
  const label = TABLE_EVENT_LABELS[kind];
  const message = detail?.trim() ? `${label} — ${detail.trim()}` : label;
  await updateInvestigation(localId, {
    rounds: appendEventToRounds(investigation.rounds, { type: "table-event", message }),
  });
}

/**
 * Locks a round from further entry — set by "Complete Round", the only
 * stored (not derived) round lock. Win/Loss/Push/Blackjack are never a
 * manual tap: every occupied hand still missing an outcome at this instant
 * (i.e. not already Surrendered, Voided, or manually Blackjack-corrected —
 * all of which set `outcome` the moment the operator taps them) gets one
 * computed here, exactly once, from its final cards against the dealer's
 * final cards (see lib/utils/deriveHandOutcome.ts). Split hands are
 * resolved identically to their seat's primary hand.
 */
export async function completeRound(localId: string, roundId: string): Promise<void> {
  const investigation = await getInvestigation(localId);
  if (!investigation) throw new Error(`Investigation ${localId} not found.`);
  const now = new Date().toISOString();

  const rounds = investigation.rounds.map((round) => {
    if (round.id !== roundId) return round;

    const eventLog = [...round.eventLog];
    const dealerCards = round.dealerHand.cards;

    function resolve(seatNumber: number, hand: SeatRoundRecord, isSplit: boolean): SeatRoundRecord {
      if (hand.outcome != null || hand.playerCards.length === 0) return hand;
      const outcome = deriveHandOutcome(hand.playerCards, dealerCards);
      if (outcome != null) {
        const label = outcome.charAt(0).toUpperCase() + outcome.slice(1);
        eventLog.push({
          id: uuidv4(),
          timestamp: now,
          type: "action",
          message: `Seat ${seatNumber}${isSplit ? " (split)" : ""}: Result — ${label} (auto)`,
        });
      }
      return { ...hand, outcome };
    }

    const seats = { ...round.seats };
    for (const seatNumber of investigation.occupiedSeats) {
      const seat = seats[seatNumber];
      if (seat) seats[seatNumber] = resolve(seatNumber, seat, false);
    }

    const splitHands = { ...round.splitHands };
    for (const seatNumber of investigation.occupiedSeats) {
      const split = splitHands[seatNumber];
      if (split) splitHands[seatNumber] = resolve(seatNumber, split, true);
    }

    eventLog.push({
      id: uuidv4(),
      timestamp: now,
      type: "round-saved" as EventType,
      message: `Round ${round.roundNumber} completed`,
    });

    return { ...round, seats, splitHands, eventLog, completed: true, updatedAt: now };
  });

  await updateInvestigation(localId, { rounds });
}

/** Unlocks a completed round so the operator can correct it — the "Reopen Round" action. */
export async function reopenRound(localId: string, roundId: string): Promise<void> {
  const investigation = await getInvestigation(localId);
  if (!investigation) throw new Error(`Investigation ${localId} not found.`);
  const now = new Date().toISOString();
  const rounds = investigation.rounds.map((round) =>
    round.id === roundId
      ? {
          ...round,
          completed: false,
          eventLog: [
            ...round.eventLog,
            { id: uuidv4(), timestamp: now, type: "correction" as EventType, message: `Round ${round.roundNumber} reopened` },
          ],
          updatedAt: now,
        }
      : round
  );
  await updateInvestigation(localId, { rounds });
}

/** Pause stops the session timer only — all round data is preserved untouched. Plan.md §10 decision 1. */
export async function pauseInvestigation(localId: string): Promise<void> {
  await updateInvestigation(localId, {
    status: "paused",
    pausedAt: new Date().toISOString(),
  });
}

export async function resumeInvestigation(localId: string): Promise<void> {
  const investigation = await getInvestigation(localId);
  if (!investigation || !investigation.pausedAt) return;

  const pausedMs = Date.now() - new Date(investigation.pausedAt).getTime();
  await updateInvestigation(localId, {
    status: "active",
    pausedAt: null,
    pausedDurationMs: investigation.pausedDurationMs + Math.max(0, pausedMs),
  });
}

/**
 * Finalizes the current (last) round — snapshots its final running/true
 * count for the historical timeline — then starts the next one. Occupied
 * seats' bets carry forward unchanged by default ("same", 0) unless the
 * operator changes them once the new round is live. Pass `newShoe: true`
 * to also bump the shoe number, which is all "New Shoe" needs to do: a
 * fresh shoeNumber makes computeShoeStats start counting from zero for
 * everything tagged with it. Occupancy and player-group relationships are
 * investigation-level and are never touched here.
 *
 * `voidCurrentRound: true` is the "Void Current Round and Start New Shoe"
 * path — the still-incomplete current round is dropped instead of kept in
 * history, and the next round reuses its round number, since it never
 * actually happened.
 */
export async function advanceRound(
  investigationLocalId: string,
  options: { newShoe: boolean; voidCurrentRound?: boolean }
): Promise<Round> {
  const investigation = await getInvestigation(investigationLocalId);
  if (!investigation) {
    throw new Error(`Investigation ${investigationLocalId} not found.`);
  }

  const currentRound = investigation.rounds[investigation.rounds.length - 1];
  const now = new Date().toISOString();

  const nextShoeNumber = options.newShoe ? currentRound.shoeNumber + 1 : currentRound.shoeNumber;

  let finalizedRounds: Round[];
  if (options.voidCurrentRound) {
    finalizedRounds = investigation.rounds.slice(0, -1);
  } else {
    const stats = computeShoeStats(investigation, currentRound.shoeNumber);
    const snapshot = stats.counts[investigation.countingSystem];
    finalizedRounds = investigation.rounds.map((round) =>
      round.id === currentRound.id
        ? {
            ...round,
            runningCount: snapshot.runningCount,
            trueCount: snapshot.trueCount,
            updatedAt: now,
          }
        : round
    );
  }

  const nextRoundNumber = finalizedRounds.length + 1;

  // Next Hand always restores the *starting* wager, not whatever the
  // current wager ended at — a Double in the completed hand never carries
  // forward.
  const seedSeats: Record<number, { betAmount: number | null; wagerChange: WagerChange }> = {};
  for (const seatNumber of investigation.occupiedSeats) {
    const previousStartingWager = currentRound.seats[seatNumber]?.startingWagerAmount ?? null;
    seedSeats[seatNumber] = options.newShoe
      ? { betAmount: previousStartingWager, wagerChange: { direction: "first", amount: null, overridden: false } }
      : { betAmount: previousStartingWager, wagerChange: { direction: "same", amount: 0, overridden: false } };
  }

  const nextRound = createRound(nextRoundNumber, nextShoeNumber, seedSeats);
  nextRound.eventLog.push({
    id: uuidv4(),
    timestamp: now,
    type: options.newShoe ? "shoe" : "round-saved",
    message: options.voidCurrentRound
      ? `Round ${currentRound.roundNumber} voided — new shoe started (Shoe ${nextShoeNumber})`
      : options.newShoe
        ? `New shoe started (Shoe ${nextShoeNumber}) — Round ${nextRoundNumber}`
        : `Round ${nextRoundNumber} started`,
  });

  await updateInvestigation(investigationLocalId, {
    rounds: [...finalizedRounds, nextRound],
  });

  return nextRound;
}

export async function addOperatorNote(localId: string, text: string): Promise<void> {
  const investigation = await getInvestigation(localId);
  if (!investigation) return;
  const entry: NoteEntry = { id: uuidv4(), timestamp: new Date().toISOString(), text };
  await updateInvestigation(localId, { operatorNotes: [...investigation.operatorNotes, entry] });
}

export async function completeInvestigation(localId: string): Promise<void> {
  await updateInvestigation(localId, { status: "closed" });
}

/**
 * Wipes only this investigation's live table state back to a single fresh
 * round — cards, wagers, hand state, running counts (derived from round
 * history, so clearing the rounds clears them), and seat occupancy/grouping.
 * Investigation identity (casino, table, dealer, operator, notes,
 * displayId/localId/createdAt) and every OTHER investigation are untouched.
 * The "Reset Current Investigation" action in Settings.
 */
export async function resetInvestigationLiveState(localId: string): Promise<void> {
  const investigation = await getInvestigation(localId);
  if (!investigation) throw new Error(`Investigation ${localId} not found.`);
  const now = new Date().toISOString();

  const round1 = createRound(1, 1);
  round1.eventLog.push({
    id: uuidv4(),
    timestamp: now,
    type: "round-saved",
    message: "Round 1 started (Shoe 1) — investigation reset",
  });

  await updateInvestigation(localId, {
    rounds: [round1],
    occupiedSeats: [],
    playerGroups: {},
    seatPlayerGroups: {},
    activeTarget: "dealer",
  });
}

/** Destructive — clears every locally stored investigation. Gated behind a strong confirmation in Settings. */
export async function resetAllData(): Promise<void> {
  await getDb().investigations.clear();
}

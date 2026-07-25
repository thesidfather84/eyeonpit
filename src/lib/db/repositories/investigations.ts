import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db/client";
import { generateInvestigationId } from "@/lib/investigation-id";
import { getOrCreateDeviceId } from "@/lib/utils/deviceId";
import { computeShoeStats } from "@/lib/analysis/shoeStats";
import type {
  CountingSystem,
  EventType,
  Investigation,
  InvestigationStatus,
  NoteEntry,
  Round,
  SeatRoundRecord,
  WagerChange,
} from "@/types/investigation";

export interface CreateInvestigationInput {
  casino: string;
  tableNumber: string;
  dealerName: string;
  investigationDate: string; // ISO date, "2026-07-25"
  operatorName: string;
  occupiedSeats: number[];
  trackedSeats: number[];
  initialWagers: Record<number, number>;
  countingSystem: CountingSystem;
  shoeTotalDecks: number;
  isDemo?: boolean;
  /** Defaults to "draft". The setup wizard passes "active" so the investigation is immediately the operator's active one. */
  status?: InvestigationStatus;
}

/** How many investigations already exist locally for a given date — feeds ID generation. */
async function countInvestigationsForDate(isoDate: string): Promise<number> {
  const db = getDb();
  return db.investigations.where("investigationDate").equals(isoDate).count();
}

/** A fresh, empty Round. Dealer cards live once on `dealerHand`, never duplicated per seat — plan.md §0.5/§2. */
export function createRound(
  roundNumber: number,
  shoeNumber: number,
  seedSeats: Record<number, { betAmount: number | null; wagerChange: WagerChange }>
): Round {
  const now = new Date().toISOString();
  const seats: Round["seats"] = {};

  for (const [seatKey, seed] of Object.entries(seedSeats)) {
    const seatNumber = Number(seatKey);
    const record: SeatRoundRecord = {
      seatNumber,
      betAmount: seed.betAmount,
      wagerChange: seed.wagerChange,
      playerCards: [],
      actions: [],
      outcome: null,
      deviationNote: "",
      observationNote: "",
    };
    seats[seatNumber] = record;
  }

  return {
    id: uuidv4(),
    roundNumber,
    shoeNumber,
    startTime: now,
    videoTimestamp: null,
    dealerHand: {
      upcard: null,
      holeCard: null,
      holeCardRevealed: false,
      drawCards: [],
      result: null,
    },
    seats,
    runningCount: null,
    trueCount: null,
    operatorNote: "",
    eventLog: [],
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

  const round1Seeds: Record<number, { betAmount: number | null; wagerChange: WagerChange }> = {};
  for (const seat of input.trackedSeats) {
    round1Seeds[seat] = {
      betAmount: input.initialWagers[seat] ?? null,
      wagerChange: { direction: "first", amount: null, overridden: false },
    };
  }
  const round1 = createRound(1, 1, round1Seeds);
  round1.eventLog.push({
    id: uuidv4(),
    timestamp: now,
    type: "round-saved",
    message: "Round 1 started",
  });

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

    occupiedSeats: input.occupiedSeats,
    trackedSeats: input.trackedSeats,
    initialWagers: input.initialWagers,

    countingSystem: input.countingSystem,
    shoeTotalDecks: input.shoeTotalDecks,

    rounds: [round1],

    executiveSummary: "",
    surveillanceMemo: "",
    operatorNotes: [],

    correlationScores: {},

    pausedDurationMs: 0,
    pausedAt: null,
    createdAt: now,
    updatedAt: now,
    deviceId: getOrCreateDeviceId(),
    syncStatus: "local-only",
    deletedAt: null,
  };

  await db.investigations.add(investigation);
  return investigation;
}

export async function getInvestigation(
  localId: string
): Promise<Investigation | undefined> {
  return getDb().investigations.get(localId);
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
  const all = await db.investigations.toArray();

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

/** Soft delete only — see plan.md §5, deletions must be propagatable by a future sync backend. */
export async function softDeleteInvestigation(localId: string): Promise<void> {
  await updateInvestigation(localId, { deletedAt: new Date().toISOString() });
}

/**
 * Mid-investigation seat changes (plan.md §9 decision 5 — players join/leave
 * a table routinely). Tracked seats are pruned to stay a subset of occupied.
 */
export async function updateSeatConfiguration(
  localId: string,
  occupiedSeats: number[],
  trackedSeats: number[]
): Promise<void> {
  const prunedTracked = trackedSeats.filter((seat) => occupiedSeats.includes(seat));
  await updateInvestigation(localId, {
    occupiedSeats,
    trackedSeats: prunedTracked,
  });
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
 * count for the historical timeline — then starts the next one. Tracked
 * seats' bets carry forward unchanged by default ("same", 0) unless the
 * operator changes them once the new round is live. Pass `newShoe: true`
 * to also bump the shoe number, which is all "New Shoe" needs to do: a
 * fresh shoeNumber makes computeShoeStats start counting from zero for
 * everything tagged with it.
 */
export async function advanceRound(
  investigationLocalId: string,
  options: { newShoe: boolean }
): Promise<Round> {
  const investigation = await getInvestigation(investigationLocalId);
  if (!investigation) {
    throw new Error(`Investigation ${investigationLocalId} not found.`);
  }

  const currentRound = investigation.rounds[investigation.rounds.length - 1];
  const now = new Date().toISOString();

  const stats = computeShoeStats(investigation, currentRound.shoeNumber, investigation.countingSystem);
  const finalizedRounds = investigation.rounds.map((round) =>
    round.id === currentRound.id
      ? {
          ...round,
          runningCount: stats.runningCount,
          trueCount: stats.trueCount,
          updatedAt: now,
        }
      : round
  );

  const nextShoeNumber = options.newShoe ? currentRound.shoeNumber + 1 : currentRound.shoeNumber;
  const nextRoundNumber = investigation.rounds.length + 1;

  const seedSeats: Record<number, { betAmount: number | null; wagerChange: WagerChange }> = {};
  for (const seatNumber of investigation.trackedSeats) {
    const previousBet = currentRound.seats[seatNumber]?.betAmount ?? null;
    seedSeats[seatNumber] = options.newShoe
      ? { betAmount: previousBet, wagerChange: { direction: "first", amount: null, overridden: false } }
      : { betAmount: previousBet, wagerChange: { direction: "same", amount: 0, overridden: false } };
  }

  const nextRound = createRound(nextRoundNumber, nextShoeNumber, seedSeats);
  nextRound.eventLog.push({
    id: uuidv4(),
    timestamp: now,
    type: options.newShoe ? "shoe" : "round-saved",
    message: options.newShoe
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

/** Destructive — clears every locally stored investigation. Gated behind a strong confirmation in Settings. */
export async function resetAllData(): Promise<void> {
  await getDb().investigations.clear();
}

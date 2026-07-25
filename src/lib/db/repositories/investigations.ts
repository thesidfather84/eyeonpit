import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db/client";
import { generateInvestigationId } from "@/lib/investigation-id";
import { getOrCreateDeviceId } from "@/lib/utils/deviceId";
import type {
  Investigation,
  InvestigationStatus,
  Round,
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
  isDemo?: boolean;
  /** Defaults to "draft". The setup wizard passes "active" so the investigation is immediately the operator's active one. */
  status?: InvestigationStatus;
}

/** How many investigations already exist locally for a given date — feeds ID generation. */
async function countInvestigationsForDate(isoDate: string): Promise<number> {
  const db = getDb();
  return db.investigations.where("investigationDate").equals(isoDate).count();
}

export async function createInvestigation(
  input: CreateInvestigationInput
): Promise<Investigation> {
  const db = getDb();
  const now = new Date().toISOString();
  const existingCount = await countInvestigationsForDate(input.investigationDate);

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

    rounds: [],

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

export async function addRound(
  investigationLocalId: string,
  round: Round
): Promise<void> {
  const db = getDb();
  const investigation = await db.investigations.get(investigationLocalId);
  if (!investigation) {
    throw new Error(`Investigation ${investigationLocalId} not found.`);
  }

  await updateInvestigation(investigationLocalId, {
    rounds: [...investigation.rounds, round],
  });
}

export async function updateRound(
  investigationLocalId: string,
  roundId: string,
  patch: Partial<Omit<Round, "id">>
): Promise<void> {
  const db = getDb();
  const investigation = await db.investigations.get(investigationLocalId);
  if (!investigation) {
    throw new Error(`Investigation ${investigationLocalId} not found.`);
  }

  const now = new Date().toISOString();
  const rounds = investigation.rounds.map((round) =>
    round.id === roundId ? { ...round, ...patch, updatedAt: now } : round
  );

  await updateInvestigation(investigationLocalId, { rounds });
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
 * A fresh, empty Round for the given tracked seats. Dealer cards live once
 * on `dealerHand`, never duplicated per seat — plan.md §0.5/§2. Only the
 * first round seeds each seat's bet from the wizard's initial wagers; every
 * later round starts with an unset bet (Phase 3 wires real bet entry).
 */
export function createEmptyRound(
  roundNumber: number,
  trackedSeats: number[],
  initialWagers: Record<number, number>
): Round {
  const now = new Date().toISOString();
  const seats: Round["seats"] = {};

  for (const seatNumber of trackedSeats) {
    seats[seatNumber] = {
      seatNumber,
      betAmount: roundNumber === 1 ? initialWagers[seatNumber] ?? null : null,
      wagerChange: { direction: "first", amount: null, overridden: false },
      playerCards: [],
      actions: [],
      outcome: null,
      deviationNote: "",
      observationNote: "",
    };
  }

  return {
    id: uuidv4(),
    roundNumber,
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
    createdAt: now,
    updatedAt: now,
  };
}

/** Appends a new round (roundNumber = current count + 1) and returns it. */
export async function startNextRound(investigationLocalId: string): Promise<Round> {
  const investigation = await getInvestigation(investigationLocalId);
  if (!investigation) {
    throw new Error(`Investigation ${investigationLocalId} not found.`);
  }

  const round = createEmptyRound(
    investigation.rounds.length + 1,
    investigation.trackedSeats,
    investigation.initialWagers
  );
  await addRound(investigationLocalId, round);
  return round;
}

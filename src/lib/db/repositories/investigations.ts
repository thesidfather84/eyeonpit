import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db/client";
import { generateInvestigationId } from "@/lib/investigation-id";
import { getOrCreateDeviceId } from "@/lib/utils/deviceId";
import type { Investigation, Round } from "@/types/investigation";

export interface CreateInvestigationInput {
  casino: string;
  tableNumber: string;
  dealerName: string;
  investigationDate: string; // ISO date, "2026-07-25"
  operatorName: string;
  activeSeatCount: number;
  trackedSeats: number[];
  initialWagers: Record<number, number>;
  isDemo?: boolean;
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
    status: "draft",
    isDemo: input.isDemo ?? false,

    casino: input.casino,
    tableNumber: input.tableNumber,
    dealerName: input.dealerName,
    investigationDate: input.investigationDate,
    operatorName: input.operatorName,

    activeSeatCount: input.activeSeatCount,
    trackedSeats: input.trackedSeats,
    initialWagers: input.initialWagers,

    rounds: [],

    executiveSummary: "",
    surveillanceMemo: "",
    operatorNotes: [],

    correlationScores: {},

    pausedDurationMs: 0,
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

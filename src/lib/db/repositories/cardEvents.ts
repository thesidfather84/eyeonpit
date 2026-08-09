import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db/client";
import { getInvestigation, updateInvestigation } from "@/lib/db/repositories/investigations";
import { createCardEvent } from "@/lib/counting-engine/ledger";
import { hasLegacyCardActivity, recoverLegacyLedger } from "@/lib/counting-engine/migration";
import type { LegacyAmbiguity } from "@/lib/counting-engine/migration";
import type { CardEvent, CardEventStatus, CardEventTargetType } from "@/lib/counting-engine/types";
import { appendCardForTarget, cardFromRank, popLastCardForTarget } from "@/lib/utils/cardEventTarget";
import type { EventType, Investigation, Rank, Round } from "@/types/investigation";

export async function getCardEventsForInvestigation(investigationId: string): Promise<CardEvent[]> {
  return getDb().cardEvents.where("investigationId").equals(investigationId).toArray();
}

export async function getCardEventsForShoe(investigationId: string, shoeNumber: number): Promise<CardEvent[]> {
  return getDb()
    .cardEvents.where("[investigationId+shoeNumber]")
    .equals([investigationId, shoeNumber])
    .toArray();
}

export interface AddCardInput {
  investigationLocalId: string;
  roundId: string;
  targetType: CardEventTargetType;
  targetId: number | "dealer";
  rank: Rank;
  /** Applies the card to the round's display arrays (dealerHand/seats/splitHands) — same updater shape mutateRound uses. */
  applyToRound: (round: Round) => Round;
  event: { type: EventType; message: string };
}

export interface AddCardResult {
  round: Round;
  cardEvent: CardEvent;
}

/**
 * The one place a card is ever added: the round's display-array mutation
 * and its structured CardEvent are written in the same Dexie transaction,
 * so neither can exist without the other. CardEntryPad calls this instead
 * of the generic mutateRound for `type: "card"` mutations.
 */
export async function addCardToRound(input: AddCardInput): Promise<AddCardResult> {
  const db = getDb();
  let result: AddCardResult | undefined;

  await db.transaction("rw", db.investigations, db.cardEvents, async () => {
    const investigation = await getInvestigation(input.investigationLocalId);
    if (!investigation) {
      throw new Error(`Investigation ${input.investigationLocalId} not found.`);
    }
    const round = investigation.rounds.find((r) => r.id === input.roundId);
    if (!round) {
      throw new Error(`Round ${input.roundId} not found in investigation ${input.investigationLocalId}.`);
    }

    const existingShoeEvents = await db.cardEvents
      .where("[investigationId+shoeNumber]")
      .equals([input.investigationLocalId, round.shoeNumber])
      .toArray();

    const mutatedRound = input.applyToRound(round);
    if (mutatedRound === round) {
      // applyToRound's own no-op guard (target seat/split not found) — a
      // CardEvent must never be written without a real place it was
      // exposed to. Callers are expected to have already gated entry (see
      // CardEntryPad's `disabled`/`notEnabled`), so reaching this is a
      // caller bug, not a normal outcome.
      throw new Error("addCardToRound: applyToRound did not apply — no matching target on this round.");
    }

    const cardEvent = createCardEvent(
      {
        investigationId: input.investigationLocalId,
        shoeNumber: round.shoeNumber,
        roundId: round.id,
        targetType: input.targetType,
        targetId: input.targetId,
        rank: input.rank,
      },
      existingShoeEvents
    );
    await db.cardEvents.put(cardEvent);

    const now = new Date().toISOString();
    const updatedRound: Round = {
      ...mutatedRound,
      eventLog: [
        ...mutatedRound.eventLog,
        { id: uuidv4(), timestamp: now, type: input.event.type, message: input.event.message },
      ],
      updatedAt: now,
    };
    const rounds = investigation.rounds.map((r) => (r.id === round.id ? updatedRound : r));
    await updateInvestigation(input.investigationLocalId, { rounds });

    result = { round: updatedRound, cardEvent };
  });

  if (!result) throw new Error("addCardToRound: transaction did not produce a result.");
  return result;
}

/**
 * Reverses one specific target's most recent card without touching any
 * other target's data: flips exactly that CardEvent to `undone` and pops
 * the last card from that target's own display array (dealerHand.cards /
 * a seat's playerCards / a split hand's playerCards), in the same Dexie
 * transaction. The event row is never deleted, only flipped.
 *
 * Unlike the whole-round-snapshot restore this replaces, this never
 * depends on a captured "prior round" state, so it stays correct even when
 * a *different* target's card was added more recently — the scenario a
 * snapshot restore would silently corrupt (it would also revert that other
 * target's already-entered card back out of the round's display array,
 * even though its CardEvent — and therefore the count — was never touched).
 * This is exactly what makes per-target ("context-aware") Undo safe: see
 * InvestigationContext.tsx's `undo()`.
 */
export async function undoTargetCard(
  investigationLocalId: string,
  roundId: string,
  cardEventId: string,
  targetType: CardEventTargetType,
  targetId: number | "dealer"
): Promise<Round> {
  return transitionTargetCard(
    investigationLocalId,
    roundId,
    cardEventId,
    "undone",
    (round) => popLastCardForTarget(round, targetType, targetId),
    "Undo: reverted last card"
  );
}

/** Restores an undone card exactly: flips its CardEvent back to `active` and re-appends the same card (reconstructed from the event's own rank) to that target's display array — the precise inverse of `undoTargetCard`. */
export async function redoTargetCard(
  investigationLocalId: string,
  roundId: string,
  cardEventId: string,
  targetType: CardEventTargetType,
  targetId: number | "dealer",
  rank: Rank
): Promise<Round> {
  return transitionTargetCard(
    investigationLocalId,
    roundId,
    cardEventId,
    "active",
    (round) => appendCardForTarget(round, targetType, targetId, cardFromRank(rank)),
    "Redo: reapplied card"
  );
}

async function transitionTargetCard(
  investigationLocalId: string,
  roundId: string,
  cardEventId: string,
  status: CardEventStatus,
  applyToRound: (round: Round) => Round,
  message: string
): Promise<Round> {
  const db = getDb();
  let result: Round | undefined;

  await db.transaction("rw", db.investigations, db.cardEvents, async () => {
    await db.cardEvents.update(cardEventId, { status });

    const investigation = await getInvestigation(investigationLocalId);
    if (!investigation) {
      throw new Error(`Investigation ${investigationLocalId} not found.`);
    }
    const round = investigation.rounds.find((r) => r.id === roundId);
    if (!round) {
      throw new Error(`Round ${roundId} not found in investigation ${investigationLocalId}.`);
    }

    const mutatedRound = applyToRound(round);
    const now = new Date().toISOString();
    const updatedRound: Round = {
      ...mutatedRound,
      eventLog: [
        ...mutatedRound.eventLog,
        { id: uuidv4(), timestamp: now, type: "correction" as EventType, message },
      ],
      updatedAt: now,
    };
    const rounds = investigation.rounds.map((r) => (r.id === roundId ? updatedRound : r));
    await updateInvestigation(investigationLocalId, { rounds });
    result = updatedRound;
  });

  if (!result) throw new Error("transitionTargetCard: transaction did not produce a result.");
  return result;
}

/**
 * Ensures a legacy investigation (recorded before the ledger existed) has a
 * backfilled CardEvent ledger. A no-op once at least one CardEvent row
 * exists for the investigation (every post-ledger investigation always has
 * one from its very first card) or if it has no recorded card activity to
 * recover at all.
 */
export async function ensureLegacyLedger(investigation: Investigation): Promise<LegacyAmbiguity[]> {
  const db = getDb();
  const existingCount = await db.cardEvents.where("investigationId").equals(investigation.localId).count();
  if (existingCount > 0) return [];
  if (!hasLegacyCardActivity(investigation)) return [];

  const { events, ambiguities } = recoverLegacyLedger(investigation);
  if (events.length > 0) {
    await db.cardEvents.bulkPut(events);
  }
  return ambiguities;
}

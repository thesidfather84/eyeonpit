import { v4 as uuidv4 } from "uuid";
import type { CardEvent, CardEventStatus, CardEventTargetType, Rank } from "./types";

/** Every event already recorded for a shoe, scoped for sequence assignment — never crosses a shoe boundary. */
export function eventsInShoe(events: CardEvent[], shoeNumber: number): CardEvent[] {
  return events.filter((e) => e.shoeNumber === shoeNumber);
}

/**
 * The next sequence number within (investigationId, shoeNumber). Starting a
 * new shoe begins an independent sequence at 1 — it never continues the
 * previous shoe's numbering, since a different shoeNumber already scopes
 * every event query.
 */
export function nextSequence(events: CardEvent[], shoeNumber: number): number {
  const inShoe = eventsInShoe(events, shoeNumber);
  if (inShoe.length === 0) return 1;
  return Math.max(...inShoe.map((e) => e.sequence)) + 1;
}

export interface NewCardEventInput {
  investigationId: string;
  shoeNumber: number;
  roundId: string;
  targetType: CardEventTargetType;
  targetId: number | "dealer";
  rank: Rank;
}

/**
 * Builds one brand-new, active CardEvent with the next sequence number for
 * its shoe. The id is generated here (not caller-supplied) — every real
 * card-entry call site goes through exactly this function once per tapped
 * card, so a genuinely separate second entry always gets a new id and
 * counts normally, while retrying the *same* logical write (e.g. a
 * duplicate persistence callback) is the repository layer's job to guard
 * via idempotent storage, not this function's.
 */
export function createCardEvent(input: NewCardEventInput, existingEvents: CardEvent[]): CardEvent {
  return {
    id: uuidv4(),
    investigationId: input.investigationId,
    shoeNumber: input.shoeNumber,
    roundId: input.roundId,
    sequence: nextSequence(existingEvents, input.shoeNumber),
    targetType: input.targetType,
    targetId: input.targetId,
    rank: input.rank,
    status: "active",
    createdAt: new Date().toISOString(),
  };
}

/** Pure status transition — returns a new array, never mutates in place. Used by undo (-> "undone") and redo (-> "active") alike. */
export function withEventStatus(events: CardEvent[], eventId: string, status: CardEventStatus): CardEvent[] {
  return events.map((e) => (e.id === eventId ? { ...e, status } : e));
}

/** The most recently added ACTIVE event in a shoe, by sequence — what a plain "Undo Last Card" targets absent a more specific caller-tracked id. */
export function mostRecentActiveEvent(events: CardEvent[], shoeNumber: number): CardEvent | undefined {
  const active = eventsInShoe(events, shoeNumber).filter((e) => e.status === "active");
  if (active.length === 0) return undefined;
  return active.reduce((latest, e) => (e.sequence > latest.sequence ? e : latest));
}

/** All round ids whose roundNumber is <= the given round's, within the same shoe — the scope for "count as of the end of this round," used for historical (non-current) round snapshots. */
export function eventsThroughRound(
  events: CardEvent[],
  shoeNumber: number,
  roundIdsUpToAndIncludingCurrent: ReadonlySet<string>
): CardEvent[] {
  return eventsInShoe(events, shoeNumber).filter((e) => roundIdsUpToAndIncludingCurrent.has(e.roundId));
}

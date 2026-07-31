import { v4 as uuidv4 } from "uuid";
import type { EventLogEntry, Investigation, Round } from "@/types/investigation";
import type { CardEvent, CardEventTargetType, Rank } from "./types";

/**
 * Legacy recovery adapter — the ONE place in this codebase allowed to parse
 * human-readable event-log card messages. Every new CardEvent is written
 * directly by the live app (see lib/db/repositories/cardEvents.ts); this
 * file exists solely to backfill a ledger for investigations recorded
 * before the ledger existed, where a seat's structured `playerCards` may
 * already be gone (see markSeatEmpty, which clears the current round's seat
 * record on Mark Empty) even though the card was genuinely exposed and is
 * still described in that round's eventLog.
 */

export interface LegacyAmbiguity {
  roundId: string;
  roundNumber: number;
  shoeNumber: number;
  targetType: CardEventTargetType;
  targetId: number | "dealer";
  reason: string;
}

export interface LegacyRecoveryResult {
  events: CardEvent[];
  /** Rounds/targets recovered from event-log text rather than structured data — flagged, never silently presented as certain. */
  ambiguities: LegacyAmbiguity[];
}

const KNOWN_RANKS: Rank[] = ["10", "A", "2", "3", "4", "5", "6", "7", "8", "9", "J", "Q", "K"];

/** Cards are logged as their bare rank ("A", "7", "10") since suit is always "unspecified" in practice — but this tolerates a trailing suit glyph defensively. */
function extractRank(cardText: string): Rank | null {
  const trimmed = cardText.trim();
  for (const rank of KNOWN_RANKS) {
    if (trimmed.startsWith(rank)) return rank;
  }
  return null;
}

interface ParsedCardMessage {
  targetType: CardEventTargetType;
  seatNumber?: number;
  rank: Rank;
}

const DEALER_RE = /^Dealer: (.+)$/;
const SEAT_SPLIT_RE = /^Seat (\d+) \(split\): (.+)$/;
const SEAT_RE = /^Seat (\d+): (.+)$/;

function parseCardMessage(message: string): ParsedCardMessage | null {
  let m = message.match(DEALER_RE);
  if (m) {
    const rank = extractRank(m[1]);
    return rank ? { targetType: "dealer", rank } : null;
  }
  m = message.match(SEAT_SPLIT_RE);
  if (m) {
    const rank = extractRank(m[2]);
    return rank ? { targetType: "split", seatNumber: Number(m[1]), rank } : null;
  }
  m = message.match(SEAT_RE);
  if (m) {
    const rank = extractRank(m[2]);
    return rank ? { targetType: "seat", seatNumber: Number(m[1]), rank } : null;
  }
  return null;
}

function cardLogEntriesFor(
  eventLog: EventLogEntry[],
  targetType: "seat" | "split",
  seatNumber: number
): { entry: EventLogEntry; rank: Rank }[] {
  return eventLog
    .filter((e) => e.type === "card")
    .map((e) => ({ entry: e, parsed: parseCardMessage(e.message) }))
    .filter(
      (x): x is { entry: EventLogEntry; parsed: ParsedCardMessage & { seatNumber: number } } =>
        x.parsed != null && x.parsed.targetType === targetType && x.parsed.seatNumber === seatNumber
    )
    .sort((a, b) => a.entry.timestamp.localeCompare(b.entry.timestamp))
    .map((x) => ({ entry: x.entry, rank: x.parsed.rank }));
}

interface UnsequencedEvent {
  targetType: CardEventTargetType;
  targetId: number | "dealer";
  rank: Rank;
}

function reconcileRound(round: Round): { events: UnsequencedEvent[]; ambiguities: LegacyAmbiguity[] } {
  const events: UnsequencedEvent[] = [];
  const ambiguities: LegacyAmbiguity[] = [];

  // Dealer is never removable mid-round, so its structured hand is always
  // authoritative — no event-log fallback ever needed for it.
  for (const card of round.dealerHand.cards) {
    events.push({ targetType: "dealer", targetId: "dealer", rank: card.rank });
  }

  // Every seat number this round ever mentions, whether currently occupied
  // (structured data present) or since vacated (event-log-only).
  const seatNumbers = new Set<number>();
  for (const key of Object.keys(round.seats)) seatNumbers.add(Number(key));
  for (const key of Object.keys(round.splitHands)) seatNumbers.add(Number(key));
  for (const entry of round.eventLog) {
    if (entry.type !== "card") continue;
    const parsed = parseCardMessage(entry.message);
    if (parsed?.seatNumber != null) seatNumbers.add(parsed.seatNumber);
  }

  for (const seatNumber of seatNumbers) {
    const seatRecord = round.seats[seatNumber];
    if (seatRecord) {
      // Structured data present and therefore complete — never also parse
      // the event log for this target, or the same card would be counted
      // twice.
      for (const card of seatRecord.playerCards) {
        events.push({ targetType: "seat", targetId: seatNumber, rank: card.rank });
      }
    } else {
      const logCards = cardLogEntriesFor(round.eventLog, "seat", seatNumber);
      if (logCards.length > 0) {
        for (const { rank } of logCards) events.push({ targetType: "seat", targetId: seatNumber, rank });
        ambiguities.push({
          roundId: round.id,
          roundNumber: round.roundNumber,
          shoeNumber: round.shoeNumber,
          targetType: "seat",
          targetId: seatNumber,
          reason:
            "Seat was marked empty before a card ledger existed for this investigation; recovered from event-log card messages. Cannot rule out an undone card inflating this count.",
        });
      }
    }

    const splitRecord = round.splitHands[seatNumber];
    if (splitRecord) {
      for (const card of splitRecord.playerCards) {
        events.push({ targetType: "split", targetId: seatNumber, rank: card.rank });
      }
    } else {
      const logCards = cardLogEntriesFor(round.eventLog, "split", seatNumber);
      if (logCards.length > 0) {
        for (const { rank } of logCards) events.push({ targetType: "split", targetId: seatNumber, rank });
        ambiguities.push({
          roundId: round.id,
          roundNumber: round.roundNumber,
          shoeNumber: round.shoeNumber,
          targetType: "split",
          targetId: seatNumber,
          reason:
            "Split hand was cleared before a card ledger existed for this investigation; recovered from event-log card messages. Cannot rule out an undone card inflating this count.",
        });
      }
    }
  }

  return { events, ambiguities };
}

/** True if an investigation has any recorded card activity at all — the gate for whether legacy recovery has anything to do. Investigations created after the ledger existed always have real CardEvents already, so this never runs for them. */
export function hasLegacyCardActivity(investigation: Investigation): boolean {
  return investigation.rounds.some(
    (round) =>
      round.dealerHand.cards.length > 0 ||
      Object.values(round.seats).some((s) => (s?.playerCards.length ?? 0) > 0) ||
      Object.values(round.splitHands).some((s) => (s?.playerCards.length ?? 0) > 0) ||
      round.eventLog.some((e) => e.type === "card")
  );
}

/**
 * Reconstructs a full CardEvent ledger for an investigation recorded before
 * the ledger existed. Sequence numbers are assigned per shoe, round by
 * round in roundNumber order; within a round, order doesn't affect any
 * downstream sum (running/true count only depend on which cards are
 * active, never their order), so ambiguous/event-log-recovered targets are
 * simply sequenced before structured ones for that round rather than
 * attempting a byte-for-byte historical interleave the old data can't
 * actually support.
 */
export function recoverLegacyLedger(investigation: Investigation): LegacyRecoveryResult {
  const events: CardEvent[] = [];
  const ambiguities: LegacyAmbiguity[] = [];
  const now = new Date().toISOString();

  const shoeNumbers = Array.from(new Set(investigation.rounds.map((r) => r.shoeNumber))).sort((a, b) => a - b);

  for (const shoeNumber of shoeNumbers) {
    const rounds = investigation.rounds
      .filter((r) => r.shoeNumber === shoeNumber)
      .sort((a, b) => a.roundNumber - b.roundNumber);

    let sequence = 1;
    for (const round of rounds) {
      const { events: unsequenced, ambiguities: roundAmbiguities } = reconcileRound(round);
      ambiguities.push(...roundAmbiguities);
      for (const e of unsequenced) {
        events.push({
          id: uuidv4(),
          investigationId: investigation.localId,
          shoeNumber,
          roundId: round.id,
          sequence: sequence++,
          targetType: e.targetType,
          targetId: e.targetId,
          rank: e.rank,
          status: "active",
          createdAt: round.createdAt || now,
        });
      }
    }
  }

  return { events, ambiguities };
}

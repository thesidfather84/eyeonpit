import { generateCanonicalId } from "@/lib/versioning/id";
import { versionRef } from "@/lib/versioning/types";
import { calculateRoundCountSnapshot } from "@/lib/analysis/roundCountSnapshot";
import { BUILT_IN_COUNT_METHODS } from "@/lib/gold-standard/countMethodAdapters";
import type { CardEvent } from "@/lib/counting-engine/types";
import type { CountingSystem, Investigation, Round, SeatRoundRecord } from "@/types/investigation";
import { PLAYER_OBSERVATION_SCHEMA_VERSION, type PlayerObservation, type PlayerActionDecision } from "./playerObservation";

/**
 * PRIORITY 1.7-1 — derives PlayerObservation[] entirely from real,
 * already-recorded Investigation/CardEvent data. No field here is invented
 * or guessed; every value is either a direct copy of an existing
 * SeatRoundRecord/Round field or a pure recomputation through the SAME
 * trusted engine functions lib/analysis/apLikelihood.ts already uses
 * (`calculateRoundCountSnapshot`) — this file adds no new counting
 * mathematics and does not touch lib/counting-engine in any way.
 *
 * SCOPE DECISION — count method: RC/TC are read from the investigation's
 * own trusted, already-computed `countingSystem` (Hi-Lo/KO/Zen/Omega II)
 * via the existing engine, referencing the matching BUILT-IN
 * CountMethodDefinition (countMethodAdapters.ts) for `countMethodRef`.
 * This deliberately does NOT attempt to re-derive true count for an
 * arbitrary custom CountMethodDefinition — doing so would mean inventing
 * new true-count math for methods the trusted engine doesn't itself
 * implement, which is out of scope here and would risk exactly the kind of
 * "second copy of counting math" this whole architecture avoids.
 */

const COUNTING_SYSTEM_TO_CANONICAL_ID: Record<CountingSystem, string> = {
  "Hi-Lo": "hi-lo",
  KO: "ko",
  Zen: "zen",
  "Omega II": "omega-ii",
};

interface ChronologicalRound {
  round: Round;
  shoeNumber: number;
  roundNumber: number;
}

function chronologicalRounds(investigation: Investigation): ChronologicalRound[] {
  return [...investigation.rounds]
    .sort((a, b) => (a.shoeNumber - b.shoeNumber) || (a.roundNumber - b.roundNumber))
    .map((round) => ({ round, shoeNumber: round.shoeNumber, roundNumber: round.roundNumber }));
}

/** Every seat number that ever appears in ANY round's `seats` or `splitHands` — deliberately NOT `investigation.occupiedSeats`, which reflects only CURRENT occupancy and would silently drop a seat's entire history once the player leaves. */
function allSeatNumbersEverObserved(investigation: Investigation): number[] {
  const seatNumbers = new Set<number>();
  for (const round of investigation.rounds) {
    for (const key of Object.keys(round.seats)) seatNumbers.add(Number(key));
    for (const key of Object.keys(round.splitHands)) seatNumbers.add(Number(key));
  }
  return [...seatNumbers].sort((a, b) => a - b);
}

function decisionsFromRecord(record: SeatRoundRecord): PlayerActionDecision[] {
  return record.actions as PlayerActionDecision[];
}

function observerNotesFor(record: SeatRoundRecord, round: Round): string[] {
  const notes: string[] = [];
  if (record.observationNote.trim()) notes.push(record.observationNote.trim());
  if (record.deviationNote.trim()) notes.push(record.deviationNote.trim());
  if (round.operatorNote.trim()) notes.push(round.operatorNote.trim());
  return notes;
}

export interface ExtractObservationsOptions {
  investigation: Investigation;
  cardEvents: CardEvent[];
}

/**
 * The single entry point. Returns every observed hand (main seat record and
 * any split sub-hand) across the whole investigation, in chronological
 * order, for every seat number that was ever occupied — not just currently
 * occupied ones.
 */
export function extractPlayerObservations(options: ExtractObservationsOptions): PlayerObservation[] {
  const { investigation, cardEvents } = options;
  const rounds = chronologicalRounds(investigation);
  const seatNumbers = allSeatNumbersEverObserved(investigation);

  const countMethod = BUILT_IN_COUNT_METHODS[COUNTING_SYSTEM_TO_CANONICAL_ID[investigation.countingSystem]];
  const countMethodRef = countMethod ? versionRef(countMethod) : null;

  const observations: PlayerObservation[] = [];

  for (const seatNumber of seatNumbers) {
    let priorRunningCount: number | null = null;
    let priorTrueCount: number | null = null;
    let wasPresentInPreviousRound = false;
    let handSequenceNumber = 0;

    for (let i = 0; i < rounds.length; i++) {
      const { round, shoeNumber, roundNumber } = rounds[i];
      const record = round.seats[seatNumber];
      const isPresentThisRound = record != null;

      if (isPresentThisRound && record) {
        handSequenceNumber += 1;
        const isFirstHandOfEntry = !wasPresentInPreviousRound;
        // Look ahead to the immediately following round to detect a genuine
        // gap (the seat plays again later, or the investigation simply
        // continues without them) — never inferred from the final round of
        // the whole investigation, which is just "investigation ended," not
        // exit evidence.
        const nextRound = rounds[i + 1];
        const isLastHandBeforeExit = nextRound != null && nextRound.round.seats[seatNumber] == null;

        const dealerUpcard = round.dealerHand.cards[0]?.rank ?? null;
        const insuranceOffered = dealerUpcard === "A";

        const base: Omit<PlayerObservation, "id" | "isSplitHand" | "playerCards" | "actions" | "outcome" | "wagerAmount" | "startingWagerAmount" | "wagerChangeDirection" | "wagerChangeAmount" | "insuranceAmount" | "insuranceTaken" | "observerNotes"> = {
          schemaVersion: PLAYER_OBSERVATION_SCHEMA_VERSION,
          investigationId: investigation.localId,
          investigationDisplayId: investigation.displayId,
          playerGroupId: investigation.seatPlayerGroups[seatNumber] ?? null,
          tableIdentifier: investigation.tableNumber,
          spotNumber: seatNumber,
          shoeNumber,
          roundNumber,
          handSequenceNumber,
          timestamp: round.startTime,
          runningCountAtWager: priorRunningCount,
          trueCountAtWager: priorTrueCount,
          countMethodRef,
          dealerUpcard,
          insuranceOffered,
          isFirstHandOfEntry,
          isLastHandBeforeExit,
        };

        observations.push({
          ...base,
          id: generateCanonicalId(),
          isSplitHand: false,
          playerCards: record.playerCards,
          actions: decisionsFromRecord(record),
          outcome: record.outcome,
          wagerAmount: record.betAmount,
          startingWagerAmount: record.startingWagerAmount,
          wagerChangeDirection: record.wagerChange.direction,
          wagerChangeAmount: record.wagerChange.amount,
          insuranceAmount: record.insuranceAmount,
          insuranceTaken: insuranceOffered ? (record.insuranceAmount != null && record.insuranceAmount > 0) : null,
          observerNotes: observerNotesFor(record, round),
        });

        const splitRecord = round.splitHands[seatNumber];
        if (splitRecord) {
          observations.push({
            ...base,
            id: generateCanonicalId(),
            isSplitHand: true,
            playerCards: splitRecord.playerCards,
            actions: decisionsFromRecord(splitRecord),
            outcome: splitRecord.outcome,
            wagerAmount: splitRecord.betAmount,
            startingWagerAmount: splitRecord.startingWagerAmount,
            wagerChangeDirection: splitRecord.wagerChange.direction,
            wagerChangeAmount: splitRecord.wagerChange.amount,
            insuranceAmount: splitRecord.insuranceAmount,
            insuranceTaken: insuranceOffered ? (splitRecord.insuranceAmount != null && splitRecord.insuranceAmount > 0) : null,
            observerNotes: observerNotesFor(splitRecord, round),
          });
        }
      }

      wasPresentInPreviousRound = isPresentThisRound;

      const snapshot = calculateRoundCountSnapshot(investigation, cardEvents, round);
      const systemResult = snapshot[investigation.countingSystem];
      priorRunningCount = systemResult.running;
      priorTrueCount = systemResult.trueCount;
    }
  }

  return observations.sort((a, b) => (a.shoeNumber - b.shoeNumber) || (a.roundNumber - b.roundNumber) || (a.spotNumber - b.spotNumber));
}

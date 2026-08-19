import type { VersionRef } from "@/lib/versioning/types";
import type { CardCode, HandOutcome, Rank, WagerDirection } from "@/types/investigation";

/**
 * PRIORITY 1.7-1 — the PlayerObservation model. One row per observed
 * decision-point (a seat's hand in a round, or a split sub-hand), derived
 * entirely from real, already-recorded Investigation/CardEvent data — this
 * file defines the SHAPE only; extraction lives in extractObservations.ts.
 *
 * IDENTITY, NOT PII (see docs/EYEONPIT_1_5_REPORTING.md §3's Player
 * Identity Privacy Rule, which this extends unchanged): a PlayerObservation
 * identifies a player only by `investigationId` + `spotNumber` (+ the
 * existing, already-non-PII `playerGroupId` label like "P1" when seats are
 * grouped as the same physical player). No name, no loyalty number, no
 * government ID, no new identity field of any kind. This model must never
 * gain a persistent cross-investigation player identity until a future,
 * deliberate, separately-reviewed enterprise identity feature explicitly
 * allows it — see that same privacy rule for what such a feature would be
 * required to do first (optional, temporary, excluded from search,
 * permissions/audit designed before it ships).
 *
 * `PLAYER_OBSERVATION_SCHEMA_VERSION` follows the same "bump only when the
 * shape/meaning changes" discipline as `ENGINE_VERSIONS.reportSchema` (see
 * lib/versioning/types.ts) — every observation carries it so a future
 * analytics change can tell which shape produced a given observation.
 */
export const PLAYER_OBSERVATION_SCHEMA_VERSION = 1;

export type PlayerActionDecision =
  | "hit"
  | "stand"
  | "double"
  | "split"
  | "surrender"
  | "insurance"
  | "blackjack"
  | "other";

export interface PlayerObservation {
  schemaVersion: number;
  id: string;

  // ---- Identity (investigation/spot/session only — see doc comment above) ----
  investigationId: string;
  investigationDisplayId: string;
  /** The existing, already-non-PII player-grouping label (e.g. "P1") when this seat is grouped with others as one physical player — never a name. */
  playerGroupId: string | null;
  tableIdentifier: string;
  /** "Spot" per Floor Mode terminology / "Seat" per Surveillance — same internal seat number either way (see docs/EYEONPIT_PRODUCT_SPEC.md §4's terminology standard). */
  spotNumber: number;

  // ---- When ----
  shoeNumber: number;
  roundNumber: number;
  /** 1-based index of this player's OWN observed hands within the investigation — the "hands observed" counter every downstream analytic and the Confidence Engine key off of, never a raw round number (a player who sits out rounds doesn't accrue evidence for rounds they weren't in). */
  handSequenceNumber: number;
  timestamp: string;
  isSplitHand: boolean;

  // ---- Wager ----
  wagerAmount: number | null;
  startingWagerAmount: number | null;
  wagerChangeDirection: WagerDirection | null;
  wagerChangeAmount: number | null;

  // ---- Count context at the moment this wager was placed ----
  /** The running/true count as of the END of the previous round in this shoe (0/null at the first round of a shoe) — this is the information actually available to the player when they placed THIS wager, matching lib/analysis/apLikelihood.ts's existing "priorTrueCount" convention. */
  runningCountAtWager: number | null;
  trueCountAtWager: number | null;
  /** Which trusted counting system/version this RC/TC came from — always one of the four existing built-in adapters (see extractObservations.ts's own doc comment on why an arbitrary custom method isn't re-derived here). */
  countMethodRef: VersionRef | null;

  // ---- Hand / decisions ----
  playerCards: CardCode[] | null;
  dealerUpcard: Rank | null;
  actions: PlayerActionDecision[];
  outcome: HandOutcome;

  // ---- Insurance ----
  insuranceOffered: boolean;
  insuranceTaken: boolean | null;
  insuranceAmount: number | null;

  // ---- Entry / exit (evidence only — see entryExitAnalysis.ts) ----
  isFirstHandOfEntry: boolean;
  isLastHandBeforeExit: boolean;

  // ---- Notes ----
  /** Verbatim copies of the round's own `deviationNote`/`observationNote` fields where present — never paraphrased, never invented (matching docs/EYEONPIT_PRODUCT_SPEC.md §13's "original observation must be preserved" rule). Empty array when neither is set. */
  observerNotes: string[];
}

/** True when an observation actually has a wager+count pair usable for bet/count analytics — the shared "usable evidence" gate every Priority 2-6 analytic applies before counting a hand toward its own sample size. */
export function hasUsableWagerCountEvidence(obs: PlayerObservation): boolean {
  return obs.wagerAmount != null && obs.trueCountAtWager != null;
}

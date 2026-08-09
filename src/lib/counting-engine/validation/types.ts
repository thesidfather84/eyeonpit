/** TEST-ONLY. Shared shapes for the mass-validation harness (see simulator.ts, oracle.ts, rng.ts). */
import type { EntryRank } from "./rng";

export type SimTargetType = "dealer" | "seat" | "split";

/**
 * One operation applied to a single shoe, in the exact order it happened.
 * A failing simulation's replay payload is just the seed/config plus the
 * list of these for the one shoe where a mismatch was detected — small,
 * shoe-scoped, and enough to deterministically reproduce the failure via
 * `replaySimOps` in simulator.ts without re-running the entire multi-shoe,
 * multi-session simulation that originally found it.
 */
export type SimOp =
  | { kind: "occupySeat"; seatNumber: number }
  | { kind: "addCard"; targetType: SimTargetType; targetId: number | "dealer"; rank: EntryRank }
  | { kind: "undo"; targetType: SimTargetType; targetId: number | "dealer" }
  | { kind: "redo"; targetType: SimTargetType; targetId: number | "dealer" }
  | { kind: "markSeatEmpty"; seatNumber: number }
  | { kind: "clearHand"; targetType: SimTargetType; targetId: number | "dealer" }
  | { kind: "nextRound" };

/**
 * Everything needed to exactly reproduce one shoe's worth of simulated
 * activity in isolation, outside the full run that found a problem —
 * requirement 8's "compact replay payload." Deliberately does NOT include
 * anything from other shoes/sessions: the CardEvent ledger is scoped by
 * shoe, so a single shoe's operations are already a complete, self-
 * contained reproduction of any counting mismatch found inside it.
 */
export interface ReplayPayload {
  seed: number;
  deckCount: number;
  shoeNumber: number;
  countingSystemUnderTest: "Hi-Lo" | "KO" | "Zen" | "Omega II";
  ops: SimOp[];
}

export interface MismatchDetail {
  seed: number;
  investigationId: string;
  shoeNumber: number;
  roundNumber: number;
  opIndex: number;
  op: SimOp;
  field: string;
  expected: unknown;
  actual: unknown;
  replay: ReplayPayload;
}

export interface HarnessConfig {
  seed: number;
  /** Number of independent investigations ("sessions") to simulate — the primary lever for total scale (see rng.ts's shoe-pool builder and docs/VALIDATION.md's scaling note). */
  sessionCount: number;
  shoesPerSession: [min: number, max: number];
  roundsPerShoe: [min: number, max: number];
  cardsPerHand: [min: number, max: number];
  seatCount: [min: number, max: number];
  deckCounts: number[];
  /** Probability, per round, of exercising a workflow-preservation scenario (undo/redo, mark seat empty, clear hand, reload) instead of only dealing cards. */
  workflowOpProbability: number;
  /**
   * Verify the production-vs-oracle snapshot after every Nth `addCard` op
   * rather than every single one — the dominant per-event cost is this
   * verification (a fresh DB read + recompute), so this is the lever for
   * reaching very large total event counts without runtime growing
   * linearly with it. 1 (verify every card) for SMOKE/fixtures; a larger
   * value for STANDARD/STRESS. Every non-addCard op (undo/redo/mark-seat-
   * empty/clear-hand) and every `replayPayload` op is still verified
   * unconditionally regardless of this setting — sampling only ever
   * applies to the highest-frequency op. A skipped sample doesn't weaken
   * detection permanently: any divergence it introduces is still caught by
   * the very next verified sample, still reproducible via that sample's
   * replay payload (which contains every op since the shoe began, sampled
   * or not).
   */
  checkEveryNEvents: number;
}

export interface HarnessResult {
  config: HarnessConfig;
  elapsedMs: number;
  sessionsSimulated: number;
  shoesSimulated: number;
  roundsSimulated: number;
  cardEventsProcessed: number;
  undoOpsProcessed: number;
  redoOpsProcessed: number;
  reloadChecksProcessed: number;
  snapshotChecksProcessed: number;
  systemsChecked: readonly string[];
  mismatches: MismatchDetail[];
}

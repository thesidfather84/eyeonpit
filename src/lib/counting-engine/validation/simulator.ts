/**
 * TEST-ONLY. The mass-validation harness's driver — exercises the REAL
 * production CardEvent/counting path (createInvestigation, occupySeat,
 * addCardToRound, undoTargetCard/redoTargetCard, advanceRound,
 * markSeatEmpty, mutateRound, getCardEventsFor*, calculateCountSnapshot)
 * against the independent oracle in oracle.ts. This file contains no
 * counting math of its own — every number it asserts against comes either
 * straight from production or straight from the oracle; its own job is
 * only to generate realistic sequences of operations and compare the two.
 *
 * See docs/VALIDATION.md for what this proves, what it does not, and how
 * to run it at smoke/standard/stress scale.
 */
import { calculateCountSnapshot } from "@/lib/counting-engine/calculateCounts";
import { mostRecentActiveEventForTarget } from "@/lib/counting-engine/ledger";
import type { CardEventTargetType } from "@/lib/counting-engine/types";
import { appendCardForTarget, cardFromRank, popLastCardForTarget } from "@/lib/utils/cardEventTarget";
import {
  addCardToRound,
  getCardEventsForInvestigation,
  getCardEventsForShoe,
  redoTargetCard,
  undoTargetCard,
} from "@/lib/db/repositories/cardEvents";
import {
  advanceRound,
  completeInvestigation,
  createInvestigation,
  getInvestigation,
  markSeatEmpty,
  mutateRound,
  occupySeat,
  resetPracticeInvestigationLiveState,
} from "@/lib/db/repositories/investigations";
import type { CountingSystem, Investigation, Round } from "@/types/investigation";
import { ORACLE_SYSTEMS, ShoeOracle, type OracleSnapshot } from "./oracle";
import { buildShuffledShoePool, SeededRng, type EntryRank } from "./rng";
import type { HarnessConfig, HarnessResult, MismatchDetail, ReplayPayload, SimOp, SimTargetType } from "./types";

const SEAT_NUMBERS = [1, 2, 3, 4, 5, 6] as const;
const FLOAT_EPSILON = 1e-9;

function nearlyEqual(a: number, b: number, epsilon = FLOAT_EPSILON): boolean {
  return Math.abs(a - b) <= epsilon;
}

/** Everything one shoe's worth of simulation needs to carry between operations. */
interface ShoeContext {
  investigationId: string;
  shoeNumber: number;
  deckCount: number;
  countingSystemUnderTest: CountingSystem;
  oracle: ShoeOracle;
  roundId: string;
  roundNumber: number;
  /** Per-target LIFO stack of undone CardEvent ids, mirroring the oracle's own undo/redo stack structure exactly (see oracle.ts) — what a "redo" op needs to find the real row to flip back to active. */
  undoneEventIds: Map<string, string[]>;
  /**
   * Per-target LIFO stack of ranks added DURING THE CURRENT ROUND ONLY —
   * cleared every time `roundId` changes. This exists because production's
   * real Undo is round-scoped: InvestigationContext.tsx's `undo()` filters
   * `cardEvents` to `e.roundId === currentRound.id` before calling
   * `mostRecentActiveEventForTarget`, so a card from an earlier round in
   * the same shoe is never a valid Undo target even though it's still
   * `active` in the shoe-wide ledger. `ShoeOracle`'s own stacks are
   * deliberately shoe-wide (they only need to get the aggregate running
   * count right), so this separate, round-scoped stack is what the harness
   * uses to decide whether attempting an Undo/Clear on a given target is
   * even valid right now — mirroring the real UI's own scoping, not just
   * the ledger's.
   */
  roundActiveRanks: Map<string, EntryRank[]>;
  ops: SimOp[];
  seed: number;
}

function roundStackFor(ctx: ShoeContext, key: string): EntryRank[] {
  let stack = ctx.roundActiveRanks.get(key);
  if (!stack) {
    stack = [];
    ctx.roundActiveRanks.set(key, stack);
  }
  return stack;
}

function targetKey(targetType: SimTargetType, targetId: number | "dealer"): string {
  return `${targetType}:${targetId}`;
}

function pushUndone(ctx: ShoeContext, key: string, eventId: string): void {
  const stack = ctx.undoneEventIds.get(key) ?? [];
  stack.push(eventId);
  ctx.undoneEventIds.set(key, stack);
}

function popUndone(ctx: ShoeContext, key: string): string | undefined {
  return ctx.undoneEventIds.get(key)?.pop();
}

function clearUndone(ctx: ShoeContext, key: string): void {
  ctx.undoneEventIds.set(key, []);
}

function buildReplayPayload(ctx: ShoeContext): ReplayPayload {
  return {
    seed: ctx.seed,
    deckCount: ctx.deckCount,
    shoeNumber: ctx.shoeNumber,
    countingSystemUnderTest: ctx.countingSystemUnderTest,
    ops: [...ctx.ops],
  };
}

/**
 * Fetches the real production snapshot for this shoe and compares every
 * field against the oracle's independently-computed expectation. Throws
 * (carrying a full MismatchDetail, including a ready-to-replay payload) on
 * the first field that disagrees — per the "stop and report, never adjust
 * production math to agree" rule, this function never tolerates or
 * averages away a disagreement.
 */
async function verifySnapshot(
  ctx: ShoeContext,
  opIndex: number,
  triggeringOp: SimOp
): Promise<void> {
  const events = await getCardEventsForShoe(ctx.investigationId, ctx.shoeNumber);
  const actual = calculateCountSnapshot(events, ctx.deckCount);
  const expected: OracleSnapshot = ctx.oracle.snapshot();

  function fail(field: string, expectedValue: unknown, actualValue: unknown): never {
    const detail: MismatchDetail = {
      seed: ctx.seed,
      investigationId: ctx.investigationId,
      shoeNumber: ctx.shoeNumber,
      roundNumber: ctx.roundNumber,
      opIndex,
      op: triggeringOp,
      field,
      expected: expectedValue,
      actual: actualValue,
      replay: buildReplayPayload(ctx),
    };
    throw new MismatchError(detail);
  }

  if (actual.exposedCardCount !== expected.exposedCardCount) {
    fail("exposedCardCount", expected.exposedCardCount, actual.exposedCardCount);
  }
  if (!nearlyEqual(actual.decksRemaining, expected.decksRemaining)) {
    fail("decksRemaining", expected.decksRemaining, actual.decksRemaining);
  }
  for (const system of ORACLE_SYSTEMS) {
    if (actual[system].running !== expected[system].running) {
      fail(`${system}.running`, expected[system].running, actual[system].running);
    }
    const expectedTrue = expected[system].trueCount;
    const actualTrue = actual[system].trueCount;
    if (expectedTrue === null || actualTrue === null) {
      if (expectedTrue !== actualTrue) fail(`${system}.trueCount`, expectedTrue, actualTrue);
    } else if (!nearlyEqual(actualTrue, expectedTrue)) {
      fail(`${system}.trueCount`, expectedTrue, actualTrue);
    }
  }
}

export class MismatchError extends Error {
  readonly detail: MismatchDetail;
  constructor(detail: MismatchDetail) {
    super(
      `Counting mismatch: ${detail.field} expected ${JSON.stringify(detail.expected)} but production returned ${JSON.stringify(detail.actual)} ` +
        `(seed=${detail.seed}, shoe=${detail.shoeNumber}, round=${detail.roundNumber}, op#${detail.opIndex}=${JSON.stringify(detail.op)}).\n` +
        `Replay payload:\n${JSON.stringify(detail.replay)}`
    );
    this.detail = detail;
  }
}

function ledgerTarget(targetType: SimTargetType, targetId: number | "dealer"): {
  targetType: CardEventTargetType;
  targetId: number | "dealer";
} {
  return { targetType, targetId };
}

/**
 * Applies one SimOp against BOTH the real production path and the oracle,
 * verifying agreement afterward. Shared by the live randomized simulator
 * and the standalone replayer, so a saved failure reproduces through the
 * exact same code that found it.
 *
 * `verifyAddCard` (default true) only ever affects the highest-frequency
 * "addCard" op, and only when the live simulator has deliberately sampled
 * it out (see HarnessConfig.checkEveryNEvents) — `replayPayload` never
 * passes `false`, so a replay is always fully verified regardless of how
 * the original failing run was sampled.
 */
async function applyOp(
  ctx: ShoeContext,
  op: SimOp,
  opIndex: number,
  stats: MutableStats,
  verifyAddCard = true
): Promise<void> {
  ctx.ops.push(op);

  switch (op.kind) {
    case "occupySeat": {
      await occupySeat(ctx.investigationId, op.seatNumber);
      return;
    }
    case "addCard": {
      const card = cardFromRank(op.rank);
      const result = await addCardToRound({
        investigationLocalId: ctx.investigationId,
        roundId: ctx.roundId,
        targetType: op.targetType,
        targetId: op.targetId,
        rank: op.rank,
        applyToRound: (round) => appendCardForTarget(round, op.targetType, op.targetId, card),
        event: { type: "card", message: `${op.targetType} ${op.targetId}: ${op.rank}` },
      });
      void result;
      const key = targetKey(op.targetType, op.targetId);
      ctx.oracle.addCard(op.targetType, op.targetId, op.rank);
      roundStackFor(ctx, key).push(op.rank);
      clearUndone(ctx, key);
      stats.cardEventsProcessed += 1;
      if (verifyAddCard) await verifySnapshot(ctx, opIndex, op);
      return;
    }
    case "undo": {
      const key = targetKey(op.targetType, op.targetId);
      const roundStack = roundStackFor(ctx, key);
      if (roundStack.length === 0) {
        throw new Error(`applyOp(undo): ${key} has no active card in the CURRENT round — production's real Undo is round-scoped (see InvestigationContext.tsx's undo()), so this is never a valid op to attempt here.`);
      }
      // Round-scoped, exactly like production's real undo() — filters to
      // this round's events before searching, never the whole shoe.
      const roundEvents = (await getCardEventsForInvestigation(ctx.investigationId)).filter((e) => e.roundId === ctx.roundId);
      const { targetType, targetId } = ledgerTarget(op.targetType, op.targetId);
      const event = mostRecentActiveEventForTarget(roundEvents, ctx.shoeNumber, targetType, targetId);
      if (!event) throw new Error(`applyOp(undo): no active production CardEvent for ${key} in round ${ctx.roundId}.`);
      const expectedRank = roundStack[roundStack.length - 1];
      if (event.rank !== expectedRank) {
        throw new Error(
          `applyOp(undo): production's most-recent-active event for ${key} in this round is rank ${event.rank}, ` +
            `but the harness's own round-scoped stack says the last active card there was ${expectedRank} — the two models have already diverged on WHICH card is last, independent of any count math.`
        );
      }
      roundStack.pop();
      ctx.oracle.undoLastCard(op.targetType, op.targetId);
      await undoTargetCard(ctx.investigationId, ctx.roundId, event.id, targetType, targetId);
      pushUndone(ctx, key, event.id);
      stats.undoOpsProcessed += 1;
      await verifySnapshot(ctx, opIndex, op);
      return;
    }
    case "redo": {
      const key = targetKey(op.targetType, op.targetId);
      const eventId = popUndone(ctx, key);
      if (!eventId) throw new Error(`applyOp(redo): no undone production CardEvent id tracked for ${key}.`);
      const oracleRank = ctx.oracle.redoLastCard(op.targetType, op.targetId);
      roundStackFor(ctx, key).push(oracleRank);
      const { targetType, targetId } = ledgerTarget(op.targetType, op.targetId);
      await redoTargetCard(ctx.investigationId, ctx.roundId, eventId, targetType, targetId, oracleRank);
      stats.redoOpsProcessed += 1;
      await verifySnapshot(ctx, opIndex, op);
      return;
    }
    case "markSeatEmpty": {
      // Ledger-neutral by design (docs/counting-systems.md) — verifying the
      // snapshot is UNCHANGED immediately after is the actual invariant
      // this op exists to exercise.
      await markSeatEmpty(ctx.investigationId, op.seatNumber);
      await verifySnapshot(ctx, opIndex, op);
      return;
    }
    case "clearHand": {
      // Same ledger-neutral guarantee as markSeatEmpty, exercised via the
      // same mutateRound primitive InvestigationContext's "Clear" action
      // uses — only the round's *display* array changes.
      await mutateRound(
        ctx.investigationId,
        ctx.roundId,
        (round) =>
          op.targetType === "dealer"
            ? { ...round, dealerHand: { ...round.dealerHand, cards: [] } }
            : popAllCardsForTarget(round, op.targetType, op.targetId),
        { type: "correction", message: `Harness: cleared displayed hand for ${targetKey(op.targetType, op.targetId)}` }
      );
      await verifySnapshot(ctx, opIndex, op);
      return;
    }
    case "nextRound": {
      const round = await advanceRound(ctx.investigationId, { newShoe: false });
      ctx.roundId = round.id;
      ctx.roundNumber = round.roundNumber;
      // Both are round-scoped by construction (see ShoeContext's doc
      // comment on roundActiveRanks): an Undo/Redo opportunity from a round
      // the operator has already moved past is never valid in the real UI
      // either, and `transitionTargetCard` applies its round-display
      // mutation against whatever `roundId` the CALL passes — not the
      // CardEvent's own original round — so replaying a stale undone-event
      // id against a new round's id would silently corrupt that new
      // round's display array. Dropping both here is what keeps the
      // harness from ever attempting that.
      ctx.undoneEventIds = new Map();
      ctx.roundActiveRanks = new Map();
      return;
    }
    default: {
      const _exhaustive: never = op;
      throw new Error(`applyOp: unhandled SimOp ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function currentHandLength(round: Round, targetType: SimTargetType, targetId: number | "dealer"): number {
  if (targetType === "dealer") return round.dealerHand.cards.length;
  if (targetType === "split") return round.splitHands[Number(targetId)]?.playerCards.length ?? 0;
  return round.seats[Number(targetId)]?.playerCards.length ?? 0;
}

/** Repeatedly pops (not just the last one) — used only by "clearHand" to empty a target's whole displayed hand, exactly like the real "Clear current entry" action does. Bounded by the target's actual hand length, which a real hand never makes large. */
function popAllCardsForTarget(round: Round, targetType: SimTargetType, targetId: number | "dealer"): Round {
  let current = round;
  while (currentHandLength(current, targetType, targetId) > 0) {
    current = popLastCardForTarget(current, targetType as CardEventTargetType, targetId);
  }
  return current;
}

interface MutableStats {
  cardEventsProcessed: number;
  undoOpsProcessed: number;
  redoOpsProcessed: number;
  reloadChecksProcessed: number;
  snapshotChecksProcessed: number;
  roundsSimulated: number;
}

/** Fresh Practice reset destructively clears its own disposable ledger; a non-Practice investigation refuses the same call outright; a production shoe boundary preserves every prior CardEvent. Deterministic, not randomized — run once per harness invocation, independent of `seed`/scale (see docs/VALIDATION.md). */
async function runPracticeVsProductionScenario(): Promise<void> {
  const demo = await createInvestigation({
    casino: "", tableNumber: "", dealerName: "", investigationDate: "2026-01-01",
    operatorName: "", countingSystem: "Hi-Lo", shoeTotalDecks: 6, isDemo: true, status: "active",
  });
  const demoRound = demo.rounds[0];
  await addCardToRound({
    investigationLocalId: demo.localId, roundId: demoRound.id, targetType: "dealer", targetId: "dealer", rank: "10",
    applyToRound: (r) => ({ ...r, dealerHand: { cards: [...r.dealerHand.cards, { rank: "10", suit: "unspecified" }] } }),
    event: { type: "card", message: "Dealer: 10" },
  });
  await resetPracticeInvestigationLiveState(demo.localId);
  const demoAfterReset = await getInvestigation(demo.localId);
  const demoEventsAfterReset = await getCardEventsForInvestigation(demo.localId);
  if (demoEventsAfterReset.length !== 0) {
    throw new Error("Practice scenario failed: resetPracticeInvestigationLiveState left CardEvents behind on a disposable Practice investigation.");
  }
  if ((demoAfterReset?.rounds.length ?? -1) !== 1) {
    throw new Error("Practice scenario failed: reset did not collapse the investigation back to a single fresh round.");
  }

  const production = await createInvestigation({
    casino: "", tableNumber: "", dealerName: "", investigationDate: "2026-01-01",
    operatorName: "", countingSystem: "Hi-Lo", shoeTotalDecks: 6, isDemo: false, status: "active",
  });
  const prodRound = production.rounds[0];
  await addCardToRound({
    investigationLocalId: production.localId, roundId: prodRound.id, targetType: "dealer", targetId: "dealer", rank: "A",
    applyToRound: (r) => ({ ...r, dealerHand: { cards: [...r.dealerHand.cards, { rank: "A", suit: "unspecified" }] } }),
    event: { type: "card", message: "Dealer: A" },
  });
  const prodEventsBefore = await getCardEventsForInvestigation(production.localId);

  let threw = false;
  try {
    await resetPracticeInvestigationLiveState(production.localId);
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error("Practice scenario failed: resetPracticeInvestigationLiveState did NOT refuse a production (non-demo) investigation.");
  }
  const prodEventsAfterRefusedReset = await getCardEventsForInvestigation(production.localId);
  if (prodEventsAfterRefusedReset.length !== prodEventsBefore.length) {
    throw new Error("Practice scenario failed: a refused reset attempt still altered production CardEvents — evidence was not preserved.");
  }

  // New-shoe boundary: production's audit-safe reset path. Every CardEvent
  // from the prior shoe must remain, unchanged, forever.
  await advanceRound(production.localId, { newShoe: true });
  const eventsAfterNewShoe = await getCardEventsForInvestigation(production.localId);
  const shoe1Events = eventsAfterNewShoe.filter((e) => e.shoeNumber === 1);
  if (shoe1Events.length !== prodEventsBefore.length) {
    throw new Error("Practice scenario failed: starting a new shoe altered or removed the prior shoe's CardEvents.");
  }

  await completeInvestigation(production.localId);
  const closed = await getInvestigation(production.localId);
  const eventsAfterClose = await getCardEventsForInvestigation(production.localId);
  if (closed?.status !== "closed" || eventsAfterClose.length !== eventsAfterNewShoe.length) {
    throw new Error("Practice scenario failed: closing (completing) a production investigation altered its CardEvent ledger.");
  }
}

function randomOccupiedSeats(rng: SeededRng, config: HarnessConfig): number[] {
  const count = rng.intBetween(config.seatCount[0], config.seatCount[1]);
  const shuffled = rng.shuffle([...SEAT_NUMBERS]);
  return shuffled.slice(0, Math.min(count, SEAT_NUMBERS.length));
}

function randomCountingSystem(rng: SeededRng): CountingSystem {
  return rng.pick(ORACLE_SYSTEMS);
}

async function simulateShoe(
  rng: SeededRng,
  investigationId: string,
  investigation: Investigation,
  shoeNumber: number,
  deckCount: number,
  countingSystemUnderTest: CountingSystem,
  config: HarnessConfig,
  seed: number,
  occupiedSeats: number[],
  stats: MutableStats,
  mismatchSink: MismatchDetail[]
): Promise<void> {
  const currentRound = investigation.rounds[investigation.rounds.length - 1];
  const ctx: ShoeContext = {
    investigationId,
    shoeNumber,
    deckCount,
    countingSystemUnderTest,
    oracle: new ShoeOracle(deckCount),
    roundId: currentRound.id,
    roundNumber: currentRound.roundNumber,
    undoneEventIds: new Map(),
    roundActiveRanks: new Map(),
    ops: [],
    seed,
  };

  // Zero-state check: a brand-new shoe must start exactly at IRC/0 with
  // nothing exposed, before a single card is dealt.
  await verifySnapshot(ctx, -1, { kind: "nextRound" });

  const pool = buildShuffledShoePool(deckCount, rng);
  let opIndex = 0;
  const roundsThisShoe = rng.intBetween(config.roundsPerShoe[0], config.roundsPerShoe[1]);

  for (let round = 0; round < roundsThisShoe; round++) {
    if (round > 0) {
      try {
        await applyOp(ctx, { kind: "nextRound" }, opIndex++, stats);
      } catch (err) {
        recordAndRethrow(err, mismatchSink);
      }
    }
    stats.roundsSimulated += 1;

    // Build one round's worth of draws across every target, then shuffle
    // the flat list so dealer/seat cards land in a realistic interleaved
    // order rather than "all dealer, then all seats."
    type Draw = { targetType: SimTargetType; targetId: number | "dealer" };
    const draws: Draw[] = [];
    const dealerCount = rng.intBetween(config.cardsPerHand[0], config.cardsPerHand[1]);
    for (let i = 0; i < dealerCount; i++) draws.push({ targetType: "dealer", targetId: "dealer" });
    for (const seat of occupiedSeats) {
      const seatCount = rng.intBetween(config.cardsPerHand[0], config.cardsPerHand[1]);
      for (let i = 0; i < seatCount; i++) draws.push({ targetType: "seat", targetId: seat });
    }
    rng.shuffle(draws);

    let poolExhausted = false;
    for (const draw of draws) {
      // A seat marked empty by an interleaved workflow op *after* this
      // round's draw list was built (but before this specific draw was
      // reached) is no longer a valid target — skip it rather than dealing
      // a card to a seat with no record on the round, exactly as a real
      // operator physically could not deal to a seat someone just marked
      // empty. `occupiedSeats` is the live, continuously-mutated source of
      // truth (see maybeApplyWorkflowOp's markSeatEmpty branch); `draws`
      // itself is a fixed snapshot taken once per round.
      if (draw.targetType === "seat" && !occupiedSeats.includes(draw.targetId as number)) {
        continue;
      }
      if (pool.length === 0) {
        poolExhausted = true;
        break;
      }
      const rank = pool.pop()!;
      const shouldVerify = (stats.cardEventsProcessed + 1) % config.checkEveryNEvents === 0;
      try {
        await applyOp(ctx, { kind: "addCard", targetType: draw.targetType, targetId: draw.targetId, rank }, opIndex++, stats, shouldVerify);
      } catch (err) {
        recordAndRethrow(err, mismatchSink);
      }
      if (shouldVerify) stats.snapshotChecksProcessed += 1;

      // Interleave workflow-preservation ops amid the dealing, at the
      // configured rate — undo/redo, mark-seat-empty, clear-hand.
      if (rng.chance(config.workflowOpProbability)) {
        await maybeApplyWorkflowOp(ctx, rng, occupiedSeats, opIndex, stats, mismatchSink);
        opIndex++;
      }
    }

    // End-of-hand reload check: forget every in-memory reference and
    // re-derive the snapshot purely from a fresh repository read.
    const reloadedEvents = await getCardEventsForShoe(ctx.investigationId, ctx.shoeNumber);
    const reloadedSnapshot = calculateCountSnapshot(reloadedEvents, ctx.deckCount);
    const liveSnapshot = ctx.oracle.snapshot();
    for (const system of ORACLE_SYSTEMS) {
      if (reloadedSnapshot[system].running !== liveSnapshot[system].running) {
        const detail: MismatchDetail = {
          seed, investigationId, shoeNumber, roundNumber: ctx.roundNumber, opIndex,
          op: { kind: "nextRound" }, field: `reload:${system}.running`,
          expected: liveSnapshot[system].running, actual: reloadedSnapshot[system].running,
          replay: buildReplayPayload(ctx),
        };
        mismatchSink.push(detail);
        throw new MismatchError(detail);
      }
    }
    stats.reloadChecksProcessed += 1;

    if (poolExhausted) break; // cut-card / shoe-exhaustion style stopping
  }
}

async function maybeApplyWorkflowOp(
  ctx: ShoeContext,
  rng: SeededRng,
  occupiedSeats: number[],
  opIndex: number,
  stats: MutableStats,
  mismatchSink: MismatchDetail[]
): Promise<void> {
  const candidates: { targetType: SimTargetType; targetId: number | "dealer" }[] = [
    { targetType: "dealer", targetId: "dealer" },
    ...occupiedSeats.map((s) => ({ targetType: "seat" as const, targetId: s })),
  ];
  // "redo" is weighted higher than its peers: it's only ever a valid op
  // immediately after an "undo" on the same target within the same round
  // (see hasUndoneCardThisRound below), a narrower window than the other
  // three choices get — without the extra weight, redo ends up exercised
  // far less often than undo/clearHand/markSeatEmpty across a run.
  const choice = rng.pick(["undo", "redo", "redo", "clearHand", "markSeatEmpty"] as const);
  const target = rng.pick(candidates);

  const hasActiveCardThisRound = (t: typeof target) => (ctx.roundActiveRanks.get(targetKey(t.targetType, t.targetId))?.length ?? 0) > 0;
  // Authoritative and round-scoped (see the "nextRound" case, which clears
  // this on every round change) — deliberately NOT ctx.oracle.hasUndoneCard,
  // which is shoe-wide and would happily say "yes" for a target undone in
  // an earlier round this harness has already decided never to redo across.
  const hasUndoneCardThisRound = (t: typeof target) => (ctx.undoneEventIds.get(targetKey(t.targetType, t.targetId))?.length ?? 0) > 0;

  try {
    // Undo and Clear are both round-scoped in the real app (see
    // ShoeContext's roundActiveRanks doc comment) — gated on that, not the
    // oracle's shoe-wide activity, or the harness could pick a target whose
    // only active card belongs to an earlier round.
    if (choice === "undo" && hasActiveCardThisRound(target)) {
      await applyOp(ctx, { kind: "undo", targetType: target.targetType, targetId: target.targetId }, opIndex, stats);
    } else if (choice === "redo" && hasUndoneCardThisRound(target)) {
      await applyOp(ctx, { kind: "redo", targetType: target.targetType, targetId: target.targetId }, opIndex, stats);
    } else if (choice === "clearHand" && hasActiveCardThisRound(target)) {
      await applyOp(ctx, { kind: "clearHand", targetType: target.targetType, targetId: target.targetId }, opIndex, stats);
    } else if (choice === "markSeatEmpty" && target.targetType === "seat" && occupiedSeats.includes(target.targetId as number)) {
      await applyOp(ctx, { kind: "markSeatEmpty", seatNumber: target.targetId as number }, opIndex, stats);
      // markSeatEmpty removes the seat from production's
      // investigation.occupiedSeats (and drops its SeatRoundRecord from the
      // current — and every subsequent — round, since advanceRound only
      // ever seeds records for seats still in that list). The harness's own
      // occupiedSeats tracking MUST be mutated in place here to match, or a
      // later round would keep trying to deal cards to a seat with no
      // record on it (a caller bug, not a counting bug — but one that would
      // otherwise crash the harness with a confusing "no matching target"
      // error instead of the mismatch reports this file exists to produce).
      const idx = occupiedSeats.indexOf(target.targetId as number);
      if (idx !== -1) occupiedSeats.splice(idx, 1);
    }
  } catch (err) {
    recordAndRethrow(err, mismatchSink);
  }
}

function recordAndRethrow(err: unknown, mismatchSink: MismatchDetail[]): never {
  if (err instanceof MismatchError) mismatchSink.push(err.detail);
  throw err;
}

/** Main entry point — smoke/standard/stress all call this with a different `HarnessConfig`. Deterministic: the same `config.seed` always generates the exact same sequence of sessions/shoes/rounds/cards. */
export async function runHarness(config: HarnessConfig): Promise<HarnessResult> {
  const startedAt = Date.now();
  const rng = new SeededRng(config.seed);
  const stats: MutableStats = {
    cardEventsProcessed: 0, undoOpsProcessed: 0, redoOpsProcessed: 0,
    reloadChecksProcessed: 0, snapshotChecksProcessed: 0, roundsSimulated: 0,
  };
  const mismatches: MismatchDetail[] = [];
  let shoesSimulated = 0;

  await runPracticeVsProductionScenario();

  for (let session = 0; session < config.sessionCount; session++) {
    const deckCount = rng.pick(config.deckCounts);
    const countingSystem = randomCountingSystem(rng);
    const investigation = await createInvestigation({
      casino: "Harness Casino", tableNumber: String(session), dealerName: "Harness Dealer",
      investigationDate: "2026-01-01", operatorName: "Harness", countingSystem,
      shoeTotalDecks: deckCount, status: "active",
    });

    // Seat occupancy is investigation-level and ledger-neutral (see
    // markSeatEmpty's own doc comment) — no shoe/oracle context is needed
    // to apply it, unlike every other op.
    const occupiedSeats = randomOccupiedSeats(rng, config);
    for (const seat of occupiedSeats) {
      await occupySeat(investigation.localId, seat);
    }

    const shoeCount = rng.intBetween(config.shoesPerSession[0], config.shoesPerSession[1]);
    for (let shoeIndex = 0; shoeIndex < shoeCount; shoeIndex++) {
      let current = await getInvestigation(investigation.localId);
      if (!current) throw new Error("runHarness: investigation vanished mid-run.");

      if (shoeIndex > 0) {
        await advanceRound(investigation.localId, { newShoe: true });
        current = await getInvestigation(investigation.localId);
        if (!current) throw new Error("runHarness: investigation vanished mid-run.");
      }
      const shoeNumber = current.rounds[current.rounds.length - 1].shoeNumber;

      await simulateShoe(
        rng, investigation.localId, current, shoeNumber, deckCount, countingSystem,
        config, config.seed, occupiedSeats, stats, mismatches
      );
      shoesSimulated += 1;
    }

    // Whole-investigation invariants: no duplicate CardEvent ids, ever.
    const allEvents = await getCardEventsForInvestigation(investigation.localId);
    const ids = new Set(allEvents.map((e) => e.id));
    if (ids.size !== allEvents.length) {
      throw new Error(`runHarness: duplicate CardEvent id detected in investigation ${investigation.localId} (${allEvents.length} rows, ${ids.size} distinct ids).`);
    }

    await completeInvestigation(investigation.localId);
  }

  return {
    config,
    elapsedMs: Date.now() - startedAt,
    sessionsSimulated: config.sessionCount,
    shoesSimulated,
    roundsSimulated: stats.roundsSimulated,
    cardEventsProcessed: stats.cardEventsProcessed,
    undoOpsProcessed: stats.undoOpsProcessed,
    redoOpsProcessed: stats.redoOpsProcessed,
    reloadChecksProcessed: stats.reloadChecksProcessed,
    snapshotChecksProcessed: stats.snapshotChecksProcessed,
    systemsChecked: ORACLE_SYSTEMS,
    mismatches,
  };
}

/**
 * Replays exactly one shoe's worth of previously-recorded ops (a
 * `ReplayPayload` printed by a prior failure) against a brand-new
 * investigation, through the exact same `applyOp`/`verifySnapshot` code the
 * live harness uses — the point being that a bug found during a giant
 * randomized run reproduces deterministically in isolation, in milliseconds,
 * without re-running the whole original simulation.
 */
export async function replayPayload(payload: ReplayPayload): Promise<HarnessResult> {
  const startedAt = Date.now();
  const stats: MutableStats = {
    cardEventsProcessed: 0, undoOpsProcessed: 0, redoOpsProcessed: 0,
    reloadChecksProcessed: 0, snapshotChecksProcessed: 0, roundsSimulated: 0,
  };
  const mismatches: MismatchDetail[] = [];

  const investigation = await createInvestigation({
    casino: "Replay", tableNumber: "0", dealerName: "Replay", investigationDate: "2026-01-01",
    operatorName: "Replay", countingSystem: payload.countingSystemUnderTest,
    shoeTotalDecks: payload.deckCount, status: "active",
  });
  const seatsInOps = new Set<number>();
  for (const op of payload.ops) {
    if (op.kind === "occupySeat") seatsInOps.add(op.seatNumber);
  }

  const ctx: ShoeContext = {
    investigationId: investigation.localId,
    shoeNumber: investigation.rounds[0].shoeNumber,
    deckCount: payload.deckCount,
    countingSystemUnderTest: payload.countingSystemUnderTest,
    oracle: new ShoeOracle(payload.deckCount),
    roundId: investigation.rounds[0].id,
    roundNumber: 1,
    undoneEventIds: new Map(),
    roundActiveRanks: new Map(),
    ops: [],
    seed: payload.seed,
  };

  for (let i = 0; i < payload.ops.length; i++) {
    try {
      await applyOp(ctx, payload.ops[i], i, stats);
    } catch (err) {
      recordAndRethrow(err, mismatches);
    }
  }

  return {
    config: {
      seed: payload.seed, sessionCount: 1, shoesPerSession: [1, 1], roundsPerShoe: [1, 1],
      cardsPerHand: [1, 1], seatCount: [seatsInOps.size, seatsInOps.size], deckCounts: [payload.deckCount],
      workflowOpProbability: 0, checkEveryNEvents: 1,
    },
    elapsedMs: Date.now() - startedAt,
    sessionsSimulated: 1,
    shoesSimulated: 1,
    roundsSimulated: stats.roundsSimulated,
    cardEventsProcessed: stats.cardEventsProcessed,
    undoOpsProcessed: stats.undoOpsProcessed,
    redoOpsProcessed: stats.redoOpsProcessed,
    reloadChecksProcessed: stats.reloadChecksProcessed,
    snapshotChecksProcessed: stats.snapshotChecksProcessed,
    systemsChecked: ORACLE_SYSTEMS,
    mismatches,
  };
}

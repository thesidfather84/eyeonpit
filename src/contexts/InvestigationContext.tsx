"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useEffect } from "react";
import {
  advanceRound as advanceRoundRepo,
  assignSeatToPlayerGroup as assignSeatToPlayerGroupRepo,
  completeRound as completeRoundRepo,
  createPlayerGroup as createPlayerGroupRepo,
  getInvestigation,
  linkSeats as linkSeatsRepo,
  logTableEvent as logTableEventRepo,
  markSeatEmpty as markSeatEmptyRepo,
  misdealRound as misdealRoundRepo,
  mutateRound,
  occupySeat as occupySeatRepo,
  pauseInvestigation,
  renamePlayerGroup as renamePlayerGroupRepo,
  reopenRound as reopenRoundRepo,
  resumeInvestigation,
  splitSeat as splitSeatRepo,
  unlinkSeat as unlinkSeatRepo,
  updateInvestigation,
} from "@/lib/db/repositories/investigations";
import type { RoundExceptionReason } from "@/lib/db/repositories/investigations";
import {
  addCardToRound,
  ensureLegacyLedger,
  getCardEventsForInvestigation,
  occupySeatAndAddCard as occupySeatAndAddCardRepo,
  redoTargetCard,
  undoTargetCard,
} from "@/lib/db/repositories/cardEvents";
import { orderedSeatNumbersFor } from "@/lib/utils/seats";
import { calculateCountSnapshot } from "@/lib/counting-engine/calculateCounts";
import { eventsInShoe, mostRecentActiveEventForTarget } from "@/lib/counting-engine/ledger";
import type { CardEvent, CardEventTargetType } from "@/lib/counting-engine/types";
import { describeLedgerTarget, ledgerTargetFor } from "@/lib/utils/cardEventTarget";
import { isDoubledWithNoPostDoubleCard, reapplyDouble, resolveSeatTarget, revertDouble } from "@/lib/utils/seatTarget";
import { diagnostics } from "@/lib/diagnostics/logger";
import type {
  EventType,
  Investigation,
  PlayerGroup,
  Rank,
  Round,
  TableEventKind,
  WagerChange,
} from "@/types/investigation";

/** Which hand the next tapped card / action applies to. */
export type CardTarget = "dealer" | number;

/**
 * Undo/redo covers three independent kinds of change. `round` is a whole
 * prior-round snapshot restore — correct for generic `mutate()` calls
 * (bets, actions, notes) as long as it's undone in strict LIFO order, which
 * is the only order `mutate()` ever produces. `target-card` is a card
 * addition specifically: instead of a snapshot, it carries just enough
 * (the CardEvent id, its exact ledger target, and its rank) to reverse
 * *that one card* by popping/re-appending it directly on whatever the
 * round currently looks like — see popLastCardForTarget/appendCardForTarget
 * in lib/utils/cardEventTarget.ts. That's what makes it safe to undo
 * out of LIFO order (context-aware Undo, see `undo()` below): reversing an
 * earlier target's card never has to touch a later target's already-
 * entered card, because it never restores a shared snapshot in the first
 * place. `seat-config` covers investigation-level seat/grouping mutations,
 * which never touch `rounds` at all so can't be captured by a Round
 * snapshot.
 */
type HistoryEntry =
  | { kind: "round"; round: Round }
  | {
      kind: "target-card";
      cardEventId: string;
      targetType: CardEventTargetType;
      targetId: number | "dealer";
      rank: Rank;
    }
  | {
      kind: "seat-config";
      occupiedSeats: number[];
      playerGroups: Record<string, PlayerGroup>;
      seatPlayerGroups: Partial<Record<number, string>>;
    }
  | { kind: "rounds-snapshot"; rounds: Round[] }
  /**
   * EyeOnPit 1.10 Phase 2 — a target-scoped Double reversal, the same
   * "identity, not a snapshot" shape `target-card` already uses for cards
   * (see that variant's own reasoning). `doubledAtCardCount` is the value
   * to restore on Redo — captured once, at undo-time, from the record
   * being reverted, exactly like `target-card` captures a card's own rank
   * so Redo can reconstruct it without re-deriving anything.
   */
  | { kind: "target-double"; target: number; doubledAtCardCount: number };

function snapshotSeatConfig(investigation: Investigation): HistoryEntry {
  return {
    kind: "seat-config",
    occupiedSeats: investigation.occupiedSeats,
    playerGroups: investigation.playerGroups,
    seatPlayerGroups: investigation.seatPlayerGroups,
  };
}

interface InvestigationContextValue {
  investigation: Investigation;
  currentRound: Round;
  activeTarget: CardTarget;
  setActiveTarget: (target: CardTarget) => void;
  canUndo: boolean;
  canRedo: boolean;
  /**
   * What Undo will actually affect, e.g. "Undo Seat 3" / "Undo Dealer" —
   * reflects the active target's own most recent card when one exists,
   * otherwise whatever the global-last-action fallback would undo (a
   * specific target's card if that's what it is, "Undo" generically for a
   * non-card action). Lets the button tell the operator exactly what's
   * about to happen instead of an ambiguous plain "Undo".
   */
  undoLabel: string;
  /** Resolves once the reversal's write AND the following refresh() have both landed — awaited by useRoundControls' handleUndo so its own post-undo spoken summary reads guaranteed-fresh state, never a stale pre-undo count. */
  undo: () => Promise<void>;
  redo: () => void;
  busy: boolean;
  mutate: (
    updater: (round: Round) => Round,
    event: { type: EventType; message: string }
  ) => Promise<void>;
  /** Every CardEvent recorded for this investigation, across every shoe — the sole source for every displayed/derived running & true count. See lib/counting-engine. */
  cardEvents: CardEvent[];
  /** The single card-entry path: writes the round's display-array mutation and its structured CardEvent atomically, and makes the addition undoable/redoable via the ledger rather than a whole-round snapshot. */
  addCard: (
    target: { targetType: CardEventTargetType; targetId: number | "dealer"; rank: Rank },
    applyToRound: (round: Round) => Round,
    event: { type: EventType; message: string }
  ) => Promise<void>;
  /**
   * For a single recognized command that names BOTH an empty seat and a
   * card in the same breath ("seat two five") — occupies the seat and
   * writes the card in one Dexie transaction (see occupySeatAndAddCard in
   * cardEvents.ts) so the two can never partially succeed. Use `addCard`
   * instead whenever the target is dealer or an already-occupied seat.
   */
  occupySeatAndAddCard: (
    seatNumber: number,
    target: { targetType: CardEventTargetType; targetId: number | "dealer"; rank: Rank },
    applyToRound: (round: Round) => Round,
    event: { type: EventType; message: string }
  ) => Promise<void>;
  refresh: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  /** Locks the current round from further entry. Button-driven: shown as "Complete Round". */
  completeRound: () => Promise<void>;
  /** Unlocks a completed round for correction, without losing anything. */
  reopenRound: () => Promise<void>;
  /** Advances to the next round within the same shoe. Requires the current round to already be completed. */
  nextRound: () => Promise<void>;
  /** The Complete Round button's action — completes and immediately advances in one step. Caller must gate on canCompleteRound() first. */
  completeRoundAndAdvance: () => Promise<void>;
  /** Starts a new shoe. Assumes the current round is already completed (or empty) — callers must check `currentRound.completed` first and route through completeRoundAndStartNewShoe / voidRoundAndStartNewShoe otherwise. */
  startNewShoe: () => Promise<void>;
  /** "Complete Round First" branch of the New Shoe prompt when a round is still open. */
  completeRoundAndStartNewShoe: () => Promise<void>;
  /** "Void Current Round and Start New Shoe" branch — discards the incomplete round instead of saving it. */
  voidRoundAndStartNewShoe: () => Promise<void>;
  /** Normal tap on an empty seat: occupies it, auto-creates a new player group, and makes it the active seat. No-op if already occupied — use selectSeat for that case. */
  occupySeat: (seatNumber: number) => Promise<void>;
  /** Normal tap on an occupied seat, or any other "make this the active entry target" action. Never mutates data. */
  selectSeat: (seatNumber: number) => void;
  /** Deliberate action only — clears the seat's current-round data and, if it contains none, does so immediately; confirmation is the caller's responsibility. */
  markSeatEmpty: (seatNumber: number) => Promise<void>;
  /** Links targetSeatNumber to sourceSeatNumber's existing player group. */
  linkSeats: (sourceSeatNumber: number, targetSeatNumber: number) => Promise<void>;
  /** Detaches a seat into a brand-new player group of its own. */
  unlinkSeat: (seatNumber: number) => Promise<void>;
  /** Assigns a seat directly to an existing player group — the "Add as Additional Spot for Existing Player" flow. */
  assignSeatToPlayerGroup: (seatNumber: number, playerGroupId: string) => Promise<void>;
  /** Creates a new, unassigned player group. Most flows don't need this directly — occupySeat/unlinkSeat create their own group inline. */
  createPlayerGroup: (label?: string) => Promise<PlayerGroup>;
  renamePlayerGroup: (playerGroupId: string, label: string) => Promise<void>;
  /** Sets one seat's own bet for the current round — never touches any other seat, even a linked one. */
  updateSeatBet: (seatNumber: number, amount: number, wagerChange: WagerChange) => Promise<void>;
  /** Explicit, operator-initiated only — applies the same bet to every seat sharing seatNumber's player group. Never called automatically. */
  applyBetToLinkedSpots: (seatNumber: number, amount: number, wagerChange: WagerChange) => Promise<void>;
  /** Moves to the next occupied seat (betting spot, not unique player) in ascending order, or to the dealer once the last seat is passed. */
  advanceToNext: () => void;
  /** Clears the active target's current-round entry — a seat's whole hand, or the dealer's whole hand. */
  clearActiveEntry: () => void;
  /** Clears one seat's current-round hand (cards/actions/result) by seat number, independent of what's currently active. Keeps its bet. */
  clearSeatHand: (seatNumber: number) => Promise<void>;
  /** Creates the seat's second hand after Split. No-op if the seat has no primary hand yet or is already split. */
  splitSeat: (seatNumber: number) => Promise<void>;
  /** Voids the current hand's outcomes (keeping its exposed cards, so the count stays correct) and immediately begins the next hand in the same shoe. Bypasses canCompleteRound()'s validation — this is an explicit declared exception (Misdeal / Incomplete Observation / Dealer Error), not a normal resolution. */
  misdealAndAdvance: (reason?: RoundExceptionReason) => Promise<void>;
  /** Logs a table event (dealer change, shuffle, seat/player joins-leaves, table closed) to the current round. */
  logTableEvent: (kind: TableEventKind, detail?: string) => Promise<void>;
}

const InvestigationContext = createContext<InvestigationContextValue | null>(null);

export function useInvestigationContext(): InvestigationContextValue {
  const ctx = useContext(InvestigationContext);
  if (!ctx) {
    throw new Error("useInvestigationContext must be used within InvestigationProvider");
  }
  return ctx;
}

export function InvestigationProvider({
  investigationId,
  children,
}: {
  investigationId: string;
  children: ReactNode;
}) {
  const [investigation, setInvestigation] = useState<Investigation | null>(null);
  const [cardEvents, setCardEvents] = useState<CardEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTarget, setActiveTargetState] = useState<CardTarget>("dealer");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [future, setFuture] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    getInvestigation(investigationId).then(async (fresh) => {
      if (!fresh) {
        if (!cancelled) {
          setInvestigation(null);
          setLoading(false);
        }
        return;
      }
      // Backfills the card ledger for investigations recorded before it
      // existed — a no-op for anything that already has ledger rows (every
      // investigation created after this point, from its first card) or
      // has no recorded card activity to recover.
      await ensureLegacyLedger(fresh);
      const events = await getCardEventsForInvestigation(investigationId);
      if (cancelled) return;
      setInvestigation(fresh);
      setCardEvents(events);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [investigationId]);

  const refresh = useCallback(async () => {
    const [fresh, events] = await Promise.all([
      getInvestigation(investigationId),
      getCardEventsForInvestigation(investigationId),
    ]);
    setInvestigation(fresh ?? null);
    setCardEvents(events);
  }, [investigationId]);

  const currentRound = investigation?.rounds[investigation.rounds.length - 1];

  // Undo/redo history is scoped to the current investigation, not the
  // current round — reset only when switching investigations, by adjusting
  // state during render (React's documented pattern for this) rather than
  // an effect. Every action that changes WHICH round is current
  // (completeRoundAndAdvance, misdealAndAdvance, the New Shoe actions)
  // pushes a "rounds-snapshot" entry first, and undo/redo of that entry
  // replace the whole `rounds` array rather than targeting `currentRound.id`
  // — so it stays correct across the boundary. Resetting on every round
  // change here used to discard that entry before an operator could ever
  // reach it, silently breaking "Undo" for an accidental Next Hand/Misdeal/
  // New Shoe tap despite that being the documented intent below.
  const [historyInvestigationId, setHistoryInvestigationId] = useState<string | undefined>(
    investigation?.localId
  );
  if (investigation?.localId !== historyInvestigationId) {
    setHistoryInvestigationId(investigation?.localId);
    setHistory([]);
    setFuture([]);
  }

  // The active target is persisted so a refresh lands back on the same
  // seat/dealer instead of resetting to "dealer" — restored once, the
  // first render after each investigation load, via the same
  // adjust-during-render pattern as the history reset above.
  const [restoredTargetForId, setRestoredTargetForId] = useState<string | undefined>(undefined);
  if (investigation && investigation.localId !== restoredTargetForId) {
    setRestoredTargetForId(investigation.localId);
    setActiveTargetState(investigation.activeTarget ?? "dealer");
  }

  const pushHistory = useCallback((entry: HistoryEntry) => {
    setHistory((h) => [...h, entry]);
    setFuture([]);
  }, []);

  const setActiveTarget = useCallback(
    (target: CardTarget) => {
      setActiveTargetState(target);
      if (investigation) {
        updateInvestigation(investigation.localId, { activeTarget: target });
      }
    },
    [investigation]
  );

  const mutate = useCallback(
    async (updater: (round: Round) => Round, event: { type: EventType; message: string }) => {
      if (!investigation || !currentRound) return;
      setBusy(true);
      try {
        pushHistory({ kind: "round", round: currentRound });
        await mutateRound(investigation.localId, currentRound.id, updater, event);
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [investigation, currentRound, refresh, pushHistory]
  );

  /**
   * The single card-entry path. Writes the round's display-array mutation
   * and its structured CardEvent atomically (addCardToRound), then records
   * a target-scoped undo entry (the event's id, its ledger target, and its
   * rank — see the `target-card` HistoryEntry) rather than a whole-round
   * snapshot, so undo/redo of a card addition flips that specific ledger
   * event's status (undoTargetCard/redoTargetCard) and pops/re-appends
   * exactly that one card, never any other target's. The count stays
   * derived from the ledger even across undo/redo. Every count anywhere in
   * the app (CountSummaryPanel, BottomStatusBar, Analysis) is calculated
   * from `cardEvents`, never from this round-array mutation directly.
   */
  const addCard = useCallback(
    async (
      target: { targetType: CardEventTargetType; targetId: number | "dealer"; rank: Rank },
      applyToRound: (round: Round) => Round,
      event: { type: EventType; message: string }
    ) => {
      if (!investigation || !currentRound) return;
      setBusy(true);
      try {
        const before = calculateCountSnapshot(
          eventsInShoe(cardEvents, currentRound.shoeNumber),
          investigation.shoeTotalDecks
        );
        const { round: updatedRound, cardEvent } = await addCardToRound({
          investigationLocalId: investigation.localId,
          roundId: currentRound.id,
          targetType: target.targetType,
          targetId: target.targetId,
          rank: target.rank,
          applyToRound,
          event,
        });
        pushHistory({
          kind: "target-card",
          cardEventId: cardEvent.id,
          targetType: target.targetType,
          targetId: target.targetId,
          rank: target.rank,
        });
        const afterEvents = [...cardEvents, cardEvent];
        const after = calculateCountSnapshot(
          eventsInShoe(afterEvents, updatedRound.shoeNumber),
          investigation.shoeTotalDecks
        );
        diagnostics.debug("count-engine", event.message, {
          investigationId: investigation.localId,
          shoeNumber: updatedRound.shoeNumber,
          roundNumber: updatedRound.roundNumber,
          activeTarget,
          countingSystem: investigation.countingSystem,
          hiLoBefore: before["Hi-Lo"].running,
          hiLoAfter: after["Hi-Lo"].running,
          koAfter: after.KO.running,
          zenAfter: after.Zen.running,
          omegaIIAfter: after["Omega II"].running,
          cardsSeenAfter: after.exposedCardCount,
        });
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [investigation, currentRound, cardEvents, activeTarget, refresh, pushHistory]
  );

  /**
   * The atomic counterpart to `addCard` for a single recognized voice
   * command that names an empty seat AND a card together ("seat two
   * five") — see occupySeatAndAddCard in cardEvents.ts for why the seat's
   * creation and the card's CardEvent/display mutation must land in the
   * same Dexie transaction rather than as two independent writes. Pushes
   * TWO history entries, in the same order a manual "tap the empty seat,
   * then tap a card" sequence would produce — a seat-config snapshot
   * first, then the target-scoped card entry — so Undo reverses them one
   * at a time exactly as it would for two separate operator actions, even
   * though both landed in one transaction.
   */
  const occupySeatAndAddCard = useCallback(
    async (
      seatNumber: number,
      target: { targetType: CardEventTargetType; targetId: number | "dealer"; rank: Rank },
      applyToRound: (round: Round) => Round,
      event: { type: EventType; message: string }
    ) => {
      if (!investigation || !currentRound) return;
      setBusy(true);
      try {
        pushHistory(snapshotSeatConfig(investigation));
        const before = calculateCountSnapshot(
          eventsInShoe(cardEvents, currentRound.shoeNumber),
          investigation.shoeTotalDecks
        );
        const { round: updatedRound, cardEvent } = await occupySeatAndAddCardRepo(
          { localId: investigation.localId, seatNumber },
          {
            investigationLocalId: investigation.localId,
            roundId: currentRound.id,
            targetType: target.targetType,
            targetId: target.targetId,
            rank: target.rank,
            applyToRound,
            event,
          }
        );
        pushHistory({
          kind: "target-card",
          cardEventId: cardEvent.id,
          targetType: target.targetType,
          targetId: target.targetId,
          rank: target.rank,
        });
        const afterEvents = [...cardEvents, cardEvent];
        const after = calculateCountSnapshot(
          eventsInShoe(afterEvents, updatedRound.shoeNumber),
          investigation.shoeTotalDecks
        );
        diagnostics.debug("count-engine", event.message, {
          investigationId: investigation.localId,
          shoeNumber: updatedRound.shoeNumber,
          roundNumber: updatedRound.roundNumber,
          activeTarget,
          countingSystem: investigation.countingSystem,
          hiLoBefore: before["Hi-Lo"].running,
          hiLoAfter: after["Hi-Lo"].running,
          koAfter: after.KO.running,
          zenAfter: after.Zen.running,
          omegaIIAfter: after["Omega II"].running,
          cardsSeenAfter: after.exposedCardCount,
        });
        setActiveTarget(seatNumber);
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [investigation, currentRound, cardEvents, activeTarget, refresh, pushHistory, setActiveTarget]
  );

  /**
   * Context-aware: reverses the active target's own most recent active
   * card first, regardless of whether some *other* target's card was
   * added more recently — the reported bug was Undo always reversing
   * whatever was globally last (e.g. Seat 5's card) even while the
   * operator was actively working Seat 3. Only when the active target has
   * nothing of its own to undo (a fresh target, or its last action was a
   * non-card one) does this fall back to the pre-existing global
   * last-action stack, unchanged. See the HistoryEntry doc comment above
   * for why the target-scoped path is safe out of LIFO order.
   */
  const undo = useCallback(async () => {
    if (!investigation || !currentRound) return;

    // EyeOnPit 1.10 Phase 2 — the Double/Undo defect fix. Checked FIRST,
    // ahead of the context-aware card lookup below: when the active
    // target's own hand is doubled with no post-double card yet, that
    // hand's own most recent real action WAS the double, not an earlier
    // (pre-double) card — so Undo must revert the double, and must never
    // touch the hand's existing cards. Once a post-double card exists,
    // this check is false (see isDoubledWithNoPostDoubleCard's own doc
    // comment) and undo() falls through to the existing card-undo path
    // exactly as before — removing that one card first, which is what
    // makes the SECOND Undo correctly reach this branch on its own.
    if (isDoubledWithNoPostDoubleCard(currentRound, activeTarget)) {
      const target = activeTarget as number; // isDoubledWithNoPostDoubleCard is false for "dealer"
      const { record } = resolveSeatTarget(currentRound, target);
      const doubledAtCardCount = record!.doubledAtCardCount!;
      setFuture((f) => [{ kind: "target-double", target, doubledAtCardCount }, ...f]);
      setBusy(true);
      try {
        await mutateRound(investigation.localId, currentRound.id, (round) => revertDouble(round, target), {
          type: "correction",
          message: `${describeLedgerTarget(target < 0 ? "split" : "seat", Math.abs(target))}: Undo Double`,
        });
        await refresh();
      } finally {
        setBusy(false);
      }
      return;
    }

    const ledgerTarget = ledgerTargetFor(activeTarget);
    const roundEvents = cardEvents.filter((e) => e.roundId === currentRound.id);
    const targetEvent = mostRecentActiveEventForTarget(
      roundEvents,
      currentRound.shoeNumber,
      ledgerTarget.targetType,
      ledgerTarget.targetId
    );

    if (targetEvent) {
      // This card's own entry may not be at the top of the session stack
      // (or may not be in it at all, e.g. after a reload) — remove it from
      // wherever it sits so a later, unrelated global-fallback undo can
      // never re-target an event this call already reversed.
      const idx = history.findIndex((h) => h.kind === "target-card" && h.cardEventId === targetEvent.id);
      if (idx !== -1) setHistory((h) => [...h.slice(0, idx), ...h.slice(idx + 1)]);
      setFuture((f) => [
        {
          kind: "target-card",
          cardEventId: targetEvent.id,
          targetType: targetEvent.targetType,
          targetId: targetEvent.targetId,
          rank: targetEvent.rank,
        },
        ...f,
      ]);
      setBusy(true);
      try {
        await undoTargetCard(investigation.localId, currentRound.id, targetEvent.id, targetEvent.targetType, targetEvent.targetId);
        await refresh();
      } finally {
        setBusy(false);
      }
      return;
    }

    if (history.length === 0) return;
    const entry = history[history.length - 1];
    setBusy(true);
    setHistory((h) => h.slice(0, -1));

    try {
      if (entry.kind === "target-card") {
        setFuture((f) => [entry, ...f]);
        await undoTargetCard(investigation.localId, currentRound.id, entry.cardEventId, entry.targetType, entry.targetId);
        await refresh();
      } else if (entry.kind === "round") {
        setFuture((f) => [{ kind: "round", round: currentRound }, ...f]);
        await mutateRound(investigation.localId, currentRound.id, () => entry.round, {
          type: "correction",
          message: "Undo: reverted last change",
        });
        await refresh();
      } else if (entry.kind === "seat-config") {
        setFuture((f) => [snapshotSeatConfig(investigation), ...f]);
        await updateInvestigation(investigation.localId, {
          occupiedSeats: entry.occupiedSeats,
          playerGroups: entry.playerGroups,
          seatPlayerGroups: entry.seatPlayerGroups,
        });
        await refresh();
      } else if (entry.kind === "target-double") {
        // Reached only via the generic history fallback — e.g. undoing a
        // just-redone double while some OTHER target is active. Same
        // reversal the dedicated early-return branch above performs.
        setFuture((f) => [entry, ...f]);
        await mutateRound(investigation.localId, currentRound.id, (round) => revertDouble(round, entry.target), {
          type: "correction",
          message: `${describeLedgerTarget(entry.target < 0 ? "split" : "seat", Math.abs(entry.target))}: Undo Double`,
        });
        await refresh();
      } else {
        setFuture((f) => [{ kind: "rounds-snapshot", rounds: investigation.rounds }, ...f]);
        await updateInvestigation(investigation.localId, { rounds: entry.rounds });
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }, [investigation, currentRound, cardEvents, activeTarget, history, refresh]);

  /**
   * Redo is never context-aware by design — it always reapplies whatever
   * was most recently undone (top of `future`), regardless of the active
   * target, exactly like before. Only Undo needed the target-priority
   * behavior; redoing anything else would be surprising ("I undid Seat 3,
   * selected Seat 5, and now Redo does something to Seat 5?").
   */
  const redo = useCallback(() => {
    if (!investigation || !currentRound || future.length === 0) return;
    const entry = future[0];
    setBusy(true);
    setFuture((f) => f.slice(1));

    if (entry.kind === "target-card") {
      setHistory((h) => [...h, entry]);
      redoTargetCard(
        investigation.localId,
        currentRound.id,
        entry.cardEventId,
        entry.targetType,
        entry.targetId,
        entry.rank
      )
        .then(refresh)
        .finally(() => setBusy(false));
    } else if (entry.kind === "round") {
      setHistory((h) => [...h, { kind: "round", round: currentRound }]);
      mutateRound(investigation.localId, currentRound.id, () => entry.round, {
        type: "correction",
        message: "Redo: reapplied change",
      })
        .then(refresh)
        .finally(() => setBusy(false));
    } else if (entry.kind === "seat-config") {
      setHistory((h) => [...h, snapshotSeatConfig(investigation)]);
      updateInvestigation(investigation.localId, {
        occupiedSeats: entry.occupiedSeats,
        playerGroups: entry.playerGroups,
        seatPlayerGroups: entry.seatPlayerGroups,
      })
        .then(refresh)
        .finally(() => setBusy(false));
    } else if (entry.kind === "target-double") {
      setHistory((h) => [...h, entry]);
      mutateRound(investigation.localId, currentRound.id, (round) => reapplyDouble(round, entry.target, entry.doubledAtCardCount), {
        type: "correction",
        message: `${describeLedgerTarget(entry.target < 0 ? "split" : "seat", Math.abs(entry.target))}: Redo Double`,
      })
        .then(refresh)
        .finally(() => setBusy(false));
    } else {
      setHistory((h) => [...h, { kind: "rounds-snapshot", rounds: investigation.rounds }]);
      updateInvestigation(investigation.localId, { rounds: entry.rounds })
        .then(refresh)
        .finally(() => setBusy(false));
    }
  }, [investigation, currentRound, future, refresh]);

  const pause = useCallback(async () => {
    if (!investigation) return;
    setBusy(true);
    try {
      await pauseInvestigation(investigation.localId);
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [investigation, refresh]);

  const resume = useCallback(async () => {
    if (!investigation) return;
    setBusy(true);
    try {
      await resumeInvestigation(investigation.localId);
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [investigation, refresh]);

  const completeRound = useCallback(async () => {
    if (!investigation || !currentRound) return;
    setBusy(true);
    try {
      await completeRoundRepo(investigation.localId, currentRound.id);
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [investigation, currentRound, refresh]);

  const reopenRound = useCallback(async () => {
    if (!investigation || !currentRound) return;
    setBusy(true);
    try {
      await reopenRoundRepo(investigation.localId, currentRound.id);
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [investigation, currentRound, refresh]);

  const nextRound = useCallback(async () => {
    if (!investigation || !currentRound || !currentRound.completed) return;
    setBusy(true);
    try {
      await advanceRoundRepo(investigation.localId, { newShoe: false });
      setActiveTarget("dealer");
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [investigation, currentRound, refresh, setActiveTarget]);

  /**
   * The primary bottom-bar action, gated by canCompleteRound(): saves and
   * locks the current round, then immediately begins the next one in the
   * same shoe — no intermediate "locked, waiting to advance" state, so
   * there's nothing else to tap. Captured as one undoable step (the whole
   * pre-advance `rounds` array) so an accidental tap can be reverted in one
   * Undo rather than needing a separate Reopen Round action.
   */
  const completeRoundAndAdvance = useCallback(async () => {
    if (!investigation || !currentRound) return;
    setBusy(true);
    try {
      pushHistory({ kind: "rounds-snapshot", rounds: investigation.rounds });
      await completeRoundRepo(investigation.localId, currentRound.id);
      await advanceRoundRepo(investigation.localId, { newShoe: false });
      // Guided mode starts the new hand on the first seat in entry-direction
      // order; Free Entry always starts back at the dealer — waiting for the
      // dealer up card is the one universal first step regardless of order.
      const ordered = orderedSeatNumbersFor(investigation);
      setActiveTarget(investigation.entryMode === "guided" ? (ordered[0] ?? "dealer") : "dealer");
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [investigation, currentRound, refresh, pushHistory, setActiveTarget]);

  const startNewShoe = useCallback(async () => {
    if (!investigation) return;
    setBusy(true);
    try {
      await advanceRoundRepo(investigation.localId, { newShoe: true });
      setActiveTarget("dealer");
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [investigation, refresh, setActiveTarget]);

  const completeRoundAndStartNewShoe = useCallback(async () => {
    if (!investigation || !currentRound) return;
    setBusy(true);
    try {
      await completeRoundRepo(investigation.localId, currentRound.id);
      await advanceRoundRepo(investigation.localId, { newShoe: true });
      setActiveTarget("dealer");
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [investigation, currentRound, refresh, setActiveTarget]);

  const voidRoundAndStartNewShoe = useCallback(async () => {
    if (!investigation) return;
    setBusy(true);
    try {
      await advanceRoundRepo(investigation.localId, { newShoe: true, voidCurrentRound: true });
      setActiveTarget("dealer");
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [investigation, refresh, setActiveTarget]);

  const occupySeat = useCallback(
    async (seatNumber: number) => {
      if (!investigation) return;
      if (investigation.occupiedSeats.includes(seatNumber)) {
        setActiveTarget(seatNumber);
        return;
      }
      setBusy(true);
      try {
        pushHistory(snapshotSeatConfig(investigation));
        await occupySeatRepo(investigation.localId, seatNumber);
        setActiveTarget(seatNumber);
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [investigation, refresh, pushHistory, setActiveTarget]
  );

  const selectSeat = useCallback(
    (seatNumber: number) => {
      setActiveTarget(seatNumber);
    },
    [setActiveTarget]
  );

  const markSeatEmpty = useCallback(
    async (seatNumber: number) => {
      if (!investigation) return;
      setBusy(true);
      try {
        pushHistory(snapshotSeatConfig(investigation));
        await markSeatEmptyRepo(investigation.localId, seatNumber);
        if (activeTarget === seatNumber) setActiveTarget("dealer");
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [investigation, activeTarget, refresh, pushHistory, setActiveTarget]
  );

  const linkSeats = useCallback(
    async (sourceSeatNumber: number, targetSeatNumber: number) => {
      if (!investigation) return;
      setBusy(true);
      try {
        pushHistory(snapshotSeatConfig(investigation));
        await linkSeatsRepo(investigation.localId, sourceSeatNumber, targetSeatNumber);
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [investigation, refresh, pushHistory]
  );

  const unlinkSeat = useCallback(
    async (seatNumber: number) => {
      if (!investigation) return;
      setBusy(true);
      try {
        pushHistory(snapshotSeatConfig(investigation));
        await unlinkSeatRepo(investigation.localId, seatNumber);
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [investigation, refresh, pushHistory]
  );

  const assignSeatToPlayerGroup = useCallback(
    async (seatNumber: number, playerGroupId: string) => {
      if (!investigation) return;
      setBusy(true);
      try {
        pushHistory(snapshotSeatConfig(investigation));
        await assignSeatToPlayerGroupRepo(investigation.localId, seatNumber, playerGroupId);
        setActiveTarget(seatNumber);
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [investigation, refresh, pushHistory, setActiveTarget]
  );

  const createPlayerGroup = useCallback(
    async (label?: string) => {
      if (!investigation) throw new Error("No active investigation.");
      setBusy(true);
      try {
        pushHistory(snapshotSeatConfig(investigation));
        const group = await createPlayerGroupRepo(investigation.localId, label);
        await refresh();
        return group;
      } finally {
        setBusy(false);
      }
    },
    [investigation, refresh, pushHistory]
  );

  const renamePlayerGroup = useCallback(
    async (playerGroupId: string, label: string) => {
      if (!investigation) return;
      setBusy(true);
      try {
        await renamePlayerGroupRepo(investigation.localId, playerGroupId, label);
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [investigation, refresh]
  );

  const updateSeatBet = useCallback(
    (seatNumber: number, amount: number, wagerChange: WagerChange) => {
      return mutate(
        (round) => {
          const seat = round.seats[seatNumber];
          if (!seat) return round;
          return {
            ...round,
            seats: { ...round.seats, [seatNumber]: { ...seat, betAmount: amount, wagerChange } },
          };
        },
        { type: "bet-change", message: `Spot ${seatNumber} bet set to $${amount}` }
      );
    },
    [mutate]
  );

  const applyBetToLinkedSpots = useCallback(
    (seatNumber: number, amount: number, wagerChange: WagerChange) => {
      if (!investigation) return Promise.resolve();
      const groupId = investigation.seatPlayerGroups[seatNumber];
      if (!groupId) return updateSeatBet(seatNumber, amount, wagerChange);

      const linkedSeats = Object.entries(investigation.seatPlayerGroups)
        .filter(([, gId]) => gId === groupId)
        .map(([seat]) => Number(seat));

      return mutate(
        (round) => {
          let seats = round.seats;
          for (const seat of linkedSeats) {
            const record = seats[seat];
            if (!record) continue;
            seats = { ...seats, [seat]: { ...record, betAmount: amount, wagerChange } };
          }
          return { ...round, seats };
        },
        { type: "bet-change", message: `Bet $${amount} applied to ${linkedSeats.length} linked spot(s)` }
      );
    },
    [investigation, mutate, updateSeatBet]
  );

  const splitSeat = useCallback(
    async (seatNumber: number) => {
      if (!investigation || !currentRound) return;
      setBusy(true);
      try {
        pushHistory({ kind: "round", round: currentRound });
        await splitSeatRepo(investigation.localId, currentRound.id, seatNumber);
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [investigation, currentRound, refresh, pushHistory]
  );

  const misdealAndAdvance = useCallback(async (reason: RoundExceptionReason = "misdeal") => {
    if (!investigation || !currentRound) return;
    setBusy(true);
    try {
      pushHistory({ kind: "rounds-snapshot", rounds: investigation.rounds });
      await misdealRoundRepo(investigation.localId, currentRound.id, reason);
      await advanceRoundRepo(investigation.localId, { newShoe: false });
      const ordered = orderedSeatNumbersFor(investigation);
      setActiveTarget(investigation.entryMode === "guided" ? (ordered[0] ?? "dealer") : "dealer");
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [investigation, currentRound, refresh, pushHistory, setActiveTarget]);

  const logTableEvent = useCallback(
    async (kind: TableEventKind, detail?: string) => {
      if (!investigation) return;
      setBusy(true);
      try {
        await logTableEventRepo(investigation.localId, kind, detail);
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [investigation, refresh]
  );

  const clearSeatHand = useCallback(
    (seatNumber: number) => {
      return mutate(
        (round) => {
          const seat = round.seats[seatNumber];
          if (!seat) return round;
          return {
            ...round,
            seats: {
              ...round.seats,
              [seatNumber]: { ...seat, playerCards: [], actions: [], outcome: null, deviationNote: "" },
            },
          };
        },
        { type: "correction", message: `Spot ${seatNumber} hand cleared` }
      );
    },
    [mutate]
  );

  const advanceToNext = useCallback(() => {
    if (!investigation) return;
    // Free Entry mode never auto-advances — the operator selects each seat
    // manually as it becomes observable (pitch/face-down games have no
    // forced order). A direct tap on a seat still works either way, since
    // that goes through selectSeat/occupySeat, not this function.
    if (investigation.entryMode === "free") return;
    const ordered = orderedSeatNumbersFor(investigation);
    if (typeof activeTarget !== "number") {
      setActiveTarget(ordered[0] ?? "dealer");
      return;
    }
    const idx = ordered.indexOf(activeTarget);
    if (idx === -1 || idx === ordered.length - 1) {
      setActiveTarget("dealer");
      return;
    }
    setActiveTarget(ordered[idx + 1]);
  }, [investigation, activeTarget, setActiveTarget]);

  const clearActiveEntry = useCallback(() => {
    if (typeof activeTarget === "number") {
      clearSeatHand(activeTarget);
    } else {
      mutate(
        (round) => ({ ...round, dealerHand: { cards: [] } }),
        { type: "correction", message: "Dealer cards cleared" }
      );
    }
  }, [activeTarget, clearSeatHand, mutate]);

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading investigation…</div>;
  }
  if (!investigation || !currentRound) {
    return <div className="p-4 text-sm text-muted-foreground">Investigation not found.</div>;
  }

  // Mirrors undo()'s own priority, including the 1.10 Phase 2 double-undo
  // check added ahead of everything else: the active target's own doubled-
  // with-no-post-double-card state, then its own most recent active card,
  // then whatever the global-last-action fallback would affect. Recomputed
  // every render so the button always reflects the current active target
  // and ledger state, not just the session's history stack (a target-
  // specific card — or a doubled hand — can be undoable here even with an
  // empty `history`, e.g. right after a reload).
  const isDoubleUndo = isDoubledWithNoPostDoubleCard(currentRound, activeTarget);
  const ledgerTargetForActive = ledgerTargetFor(activeTarget);
  const roundEventsForUndo = cardEvents.filter((e) => e.roundId === currentRound.id);
  const undoTargetEvent = mostRecentActiveEventForTarget(
    roundEventsForUndo,
    currentRound.shoeNumber,
    ledgerTargetForActive.targetType,
    ledgerTargetForActive.targetId
  );
  const fallbackEntry = history[history.length - 1];
  const undoLabel = isDoubleUndo
    ? `Undo ${describeLedgerTarget(typeof activeTarget === "number" && activeTarget < 0 ? "split" : "seat", typeof activeTarget === "number" ? Math.abs(activeTarget) : "dealer")} Double`
    : undoTargetEvent
      ? `Undo ${describeLedgerTarget(undoTargetEvent.targetType, undoTargetEvent.targetId)}`
      : fallbackEntry?.kind === "target-card"
        ? `Undo ${describeLedgerTarget(fallbackEntry.targetType, fallbackEntry.targetId)}`
        : "Undo";
  const canUndo = isDoubleUndo || undoTargetEvent != null || history.length > 0;

  return (
    <InvestigationContext.Provider
      value={{
        investigation,
        currentRound,
        activeTarget,
        setActiveTarget,
        canUndo,
        canRedo: future.length > 0,
        undoLabel,
        undo,
        redo,
        busy,
        mutate,
        cardEvents,
        addCard,
        occupySeatAndAddCard,
        refresh,
        pause,
        resume,
        completeRound,
        reopenRound,
        nextRound,
        completeRoundAndAdvance,
        startNewShoe,
        completeRoundAndStartNewShoe,
        voidRoundAndStartNewShoe,
        occupySeat,
        selectSeat,
        markSeatEmpty,
        linkSeats,
        unlinkSeat,
        assignSeatToPlayerGroup,
        createPlayerGroup,
        renamePlayerGroup,
        updateSeatBet,
        applyBetToLinkedSpots,
        advanceToNext,
        clearActiveEntry,
        clearSeatHand,
        splitSeat,
        misdealAndAdvance,
        logTableEvent,
      }}
    >
      {children}
    </InvestigationContext.Provider>
  );
}

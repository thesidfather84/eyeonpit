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
  markSeatEmpty as markSeatEmptyRepo,
  mutateRound,
  occupySeat as occupySeatRepo,
  pauseInvestigation,
  renamePlayerGroup as renamePlayerGroupRepo,
  reopenRound as reopenRoundRepo,
  resumeInvestigation,
  unlinkSeat as unlinkSeatRepo,
  updateInvestigation,
} from "@/lib/db/repositories/investigations";
import { orderedSeatNumbersFor } from "@/lib/utils/seats";
import type { EventType, Investigation, PlayerGroup, Round, WagerChange } from "@/types/investigation";

/** Which hand the next tapped card / action applies to. "dealer-hole" is a transient state entered only via the Dealer Panel's reveal control. */
export type CardTarget = "dealer" | "dealer-hole" | number;

/**
 * Undo/redo covers two independent kinds of change: in-round mutations
 * (cards, bets, actions) and investigation-level seat-config mutations
 * (occupancy, player grouping) — occupying/linking/unlinking a seat never
 * touches `rounds`, so it can't be captured by a Round snapshot.
 */
type HistoryEntry =
  | { kind: "round"; round: Round }
  | {
      kind: "seat-config";
      occupiedSeats: number[];
      playerGroups: Record<string, PlayerGroup>;
      seatPlayerGroups: Partial<Record<number, string>>;
    };

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
  undo: () => void;
  redo: () => void;
  busy: boolean;
  mutate: (
    updater: (round: Round) => Round,
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
  const [loading, setLoading] = useState(true);
  const [activeTarget, setActiveTargetState] = useState<CardTarget>("dealer");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [future, setFuture] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    getInvestigation(investigationId).then((fresh) => {
      if (cancelled) return;
      setInvestigation(fresh ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [investigationId]);

  const refresh = useCallback(async () => {
    const fresh = await getInvestigation(investigationId);
    setInvestigation(fresh ?? null);
  }, [investigationId]);

  const currentRound = investigation?.rounds[investigation.rounds.length - 1];

  // Undo/redo history is scoped to the current round. Reset it the moment
  // the round changes by adjusting state during render (React's documented
  // pattern for this) rather than an effect — avoids an extra render tick
  // and the set-state-in-effect lint rule.
  const [historyRoundId, setHistoryRoundId] = useState<string | undefined>(currentRound?.id);
  if (currentRound?.id !== historyRoundId) {
    setHistoryRoundId(currentRound?.id);
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
        const persisted: number | "dealer" = target === "dealer-hole" ? "dealer" : target;
        updateInvestigation(investigation.localId, { activeTarget: persisted });
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

  const undo = useCallback(() => {
    if (!investigation || !currentRound || history.length === 0) return;
    const entry = history[history.length - 1];
    setBusy(true);
    setHistory((h) => h.slice(0, -1));

    if (entry.kind === "round") {
      setFuture((f) => [{ kind: "round", round: currentRound }, ...f]);
      mutateRound(investigation.localId, currentRound.id, () => entry.round, {
        type: "correction",
        message: "Undo: reverted last change",
      })
        .then(refresh)
        .finally(() => setBusy(false));
    } else {
      setFuture((f) => [snapshotSeatConfig(investigation), ...f]);
      updateInvestigation(investigation.localId, {
        occupiedSeats: entry.occupiedSeats,
        playerGroups: entry.playerGroups,
        seatPlayerGroups: entry.seatPlayerGroups,
      })
        .then(refresh)
        .finally(() => setBusy(false));
    }
  }, [investigation, currentRound, history, refresh]);

  const redo = useCallback(() => {
    if (!investigation || !currentRound || future.length === 0) return;
    const entry = future[0];
    setBusy(true);
    setFuture((f) => f.slice(1));

    if (entry.kind === "round") {
      setHistory((h) => [...h, { kind: "round", round: currentRound }]);
      mutateRound(investigation.localId, currentRound.id, () => entry.round, {
        type: "correction",
        message: "Redo: reapplied change",
      })
        .then(refresh)
        .finally(() => setBusy(false));
    } else {
      setHistory((h) => [...h, snapshotSeatConfig(investigation)]);
      updateInvestigation(investigation.localId, {
        occupiedSeats: entry.occupiedSeats,
        playerGroups: entry.playerGroups,
        seatPlayerGroups: entry.seatPlayerGroups,
      })
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
        { type: "bet-change", message: `Seat ${seatNumber} bet set to $${amount}` }
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
        { type: "correction", message: `Seat ${seatNumber} hand cleared` }
      );
    },
    [mutate]
  );

  const advanceToNext = useCallback(() => {
    if (!investigation) return;
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
        (round) => ({
          ...round,
          dealerHand: {
            upcard: null,
            holeCard: null,
            holeCardRevealed: false,
            drawCards: [],
            result: null,
          },
        }),
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

  return (
    <InvestigationContext.Provider
      value={{
        investigation,
        currentRound,
        activeTarget,
        setActiveTarget,
        canUndo: history.length > 0,
        canRedo: future.length > 0,
        undo,
        redo,
        busy,
        mutate,
        refresh,
        pause,
        resume,
        completeRound,
        reopenRound,
        nextRound,
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
      }}
    >
      {children}
    </InvestigationContext.Provider>
  );
}

"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useEffect } from "react";
import {
  advanceRound,
  getInvestigation,
  mutateRound,
  pauseInvestigation,
  resumeInvestigation,
  updateSeatConfiguration,
} from "@/lib/db/repositories/investigations";
import type { EventType, Investigation, Round } from "@/types/investigation";

/** Which hand the next tapped card / action applies to. "dealer-hole" is a transient state entered only via the Dealer Panel's reveal control. */
export type CardTarget = "dealer" | "dealer-hole" | number;

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
  nextRound: () => Promise<void>;
  newShoe: () => Promise<void>;
  /** Marks a seat occupied + tracked (if it wasn't already), ensures the current round has a record for it, and makes it the active target — one tap covers all of it. */
  activateSeat: (seatNumber: number) => Promise<void>;
  /** Moves to the next tracked seat in ascending order, or to the dealer once the last seat is passed. */
  advanceToNext: () => void;
  /** Clears the active target's current-round entry — a seat's cards, or the dealer's whole hand. */
  clearActiveEntry: () => void;
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
  const [activeTarget, setActiveTarget] = useState<CardTarget>("dealer");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Round[]>([]);
  const [future, setFuture] = useState<Round[]>([]);

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

  const mutate = useCallback(
    async (updater: (round: Round) => Round, event: { type: EventType; message: string }) => {
      if (!investigation || !currentRound) return;
      setBusy(true);
      try {
        setHistory((h) => [...h, currentRound]);
        setFuture([]);
        await mutateRound(investigation.localId, currentRound.id, updater, event);
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [investigation, currentRound, refresh]
  );

  const undo = useCallback(() => {
    if (!investigation || !currentRound || history.length === 0) return;
    const previous = history[history.length - 1];
    setBusy(true);
    setHistory((h) => h.slice(0, -1));
    setFuture((f) => [currentRound, ...f]);
    mutateRound(investigation.localId, currentRound.id, () => previous, {
      type: "correction",
      message: "Undo: reverted last change",
    })
      .then(refresh)
      .finally(() => setBusy(false));
  }, [investigation, currentRound, history, refresh]);

  const redo = useCallback(() => {
    if (!investigation || !currentRound || future.length === 0) return;
    const next = future[0];
    setBusy(true);
    setFuture((f) => f.slice(1));
    setHistory((h) => [...h, currentRound]);
    mutateRound(investigation.localId, currentRound.id, () => next, {
      type: "correction",
      message: "Redo: reapplied change",
    })
      .then(refresh)
      .finally(() => setBusy(false));
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

  const nextRound = useCallback(async () => {
    if (!investigation) return;
    setBusy(true);
    try {
      await advanceRound(investigation.localId, { newShoe: false });
      setActiveTarget("dealer");
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [investigation, refresh]);

  const newShoe = useCallback(async () => {
    if (!investigation) return;
    setBusy(true);
    try {
      await advanceRound(investigation.localId, { newShoe: true });
      setActiveTarget("dealer");
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [investigation, refresh]);

  const activateSeat = useCallback(
    async (seatNumber: number) => {
      if (!investigation) return;
      const needsOccupied = !investigation.occupiedSeats.includes(seatNumber);
      const needsTracked = !investigation.trackedSeats.includes(seatNumber);

      if (needsOccupied || needsTracked) {
        const nextOccupied = needsOccupied
          ? [...investigation.occupiedSeats, seatNumber].sort((a, b) => a - b)
          : investigation.occupiedSeats;
        const nextTracked = needsTracked
          ? [...investigation.trackedSeats, seatNumber].sort((a, b) => a - b)
          : investigation.trackedSeats;
        await updateSeatConfiguration(investigation.localId, nextOccupied, nextTracked);
      }

      if (needsTracked) {
        await mutate(
          (round) => {
            if (round.seats[seatNumber]) return round;
            return {
              ...round,
              seats: {
                ...round.seats,
                [seatNumber]: {
                  seatNumber,
                  betAmount: null,
                  wagerChange: { direction: "first", amount: null, overridden: false },
                  playerCards: [],
                  actions: [],
                  outcome: null,
                  deviationNote: "",
                  observationNote: "",
                },
              },
            };
          },
          { type: "seat-select", message: `Seat ${seatNumber} added to table` }
        );
      } else if (needsOccupied) {
        await refresh();
      }

      setActiveTarget(seatNumber);
    },
    [investigation, mutate, refresh]
  );

  const advanceToNext = useCallback(() => {
    if (!investigation) return;
    const ordered = [...investigation.trackedSeats].sort((a, b) => a - b);
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
  }, [investigation, activeTarget]);

  const clearActiveEntry = useCallback(() => {
    if (typeof activeTarget === "number") {
      const seatNumber = activeTarget;
      mutate(
        (round) => {
          const seat = round.seats[seatNumber];
          if (!seat) return round;
          return {
            ...round,
            seats: { ...round.seats, [seatNumber]: { ...seat, playerCards: [] } },
          };
        },
        { type: "correction", message: `Seat ${seatNumber} cards cleared` }
      );
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
  }, [activeTarget, mutate]);

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
        nextRound,
        newShoe,
        activateSeat,
        advanceToNext,
        clearActiveEntry,
      }}
    >
      {children}
    </InvestigationContext.Provider>
  );
}

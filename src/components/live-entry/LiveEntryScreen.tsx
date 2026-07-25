"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getInvestigation,
  pauseInvestigation,
  resumeInvestigation,
  startNextRound,
} from "@/lib/db/repositories/investigations";
import { useElapsedTimer } from "@/hooks/useElapsedTimer";
import { formatElapsedTime } from "@/lib/utils/formatters";
import { Badge } from "@/components/ui/Badge";
import { EditSeatsSheet } from "@/components/investigation-setup/EditSeatsSheet";
import { DealerPanel } from "./DealerPanel";
import { SeatRail } from "./SeatRail";
import { ActiveSeatPanel } from "./ActiveSeatPanel";
import { RoundActionBar } from "./RoundActionBar";
import { PauseResumeControl } from "./PauseResumeControl";
import type { DealerHand, Investigation } from "@/types/investigation";

const EMPTY_DEALER_HAND: DealerHand = {
  upcard: null,
  holeCard: null,
  holeCardRevealed: false,
  drawCards: [],
  result: null,
};

export function LiveEntryScreen({ investigationId }: { investigationId: string }) {
  const [investigation, setInvestigation] = useState<Investigation | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSeat, setActiveSeat] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [editSeatsOpen, setEditSeatsOpen] = useState(false);

  const refresh = useCallback(async () => {
    const fresh = await getInvestigation(investigationId);
    setInvestigation(fresh ?? null);
    return fresh ?? null;
  }, [investigationId]);

  useEffect(() => {
    let cancelled = false;
    getInvestigation(investigationId).then((fresh) => {
      if (cancelled) return;
      setInvestigation(fresh ?? null);
      setLoading(false);
      if (fresh && fresh.trackedSeats.length > 0) {
        setActiveSeat((current) => current ?? fresh.trackedSeats[0]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [investigationId]);

  // Recording starts the instant the operator lands here — ensure round 1 exists.
  useEffect(() => {
    if (!investigation || investigation.rounds.length > 0) return;
    startNextRound(investigation.localId).then(() => refresh());
  }, [investigation, refresh]);

  const elapsedMs = useElapsedTimer(investigation);

  async function handlePause() {
    if (!investigation) return;
    setBusy(true);
    await pauseInvestigation(investigation.localId);
    await refresh();
    setBusy(false);
  }

  async function handleResume() {
    if (!investigation) return;
    setBusy(true);
    await resumeInvestigation(investigation.localId);
    await refresh();
    setBusy(false);
  }

  async function handleNextRound() {
    if (!investigation) return;
    setBusy(true);
    await startNextRound(investigation.localId);
    await refresh();
    setBusy(false);
  }

  if (loading) {
    return <p className="p-4 text-sm text-muted-foreground">Loading investigation…</p>;
  }

  if (!investigation) {
    return <p className="p-4 text-sm text-muted-foreground">Investigation not found.</p>;
  }

  const currentRound = investigation.rounds[investigation.rounds.length - 1];
  const seatRecord = activeSeat != null ? currentRound?.seats[activeSeat] : undefined;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Permanent header block: dealer panel + seat rail stay put while the
          seat detail below scrolls — plan.md §10 "permanent, pinned". */}
      <div className="flex-none">
        <div className="flex items-center justify-between border-b border-border bg-surface px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{investigation.displayId}</span>
            {investigation.isDemo && <Badge tone="accent">PRACTICE</Badge>}
            {investigation.status === "paused" && <Badge>Paused</Badge>}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>Round {currentRound?.roundNumber ?? 1}</span>
            <span>{formatElapsedTime(elapsedMs)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-b border-border bg-surface px-3 py-2">
          <button
            onClick={() => setEditSeatsOpen(true)}
            className="tap-target rounded-lg border border-border px-3 text-xs text-muted-foreground hover:text-foreground"
          >
            Edit Seats
          </button>
          <PauseResumeControl
            status={investigation.status}
            busy={busy}
            onPause={handlePause}
            onResume={handleResume}
          />
        </div>

        <DealerPanel dealerHand={currentRound?.dealerHand ?? EMPTY_DEALER_HAND} />
        <SeatRail
          occupiedSeats={investigation.occupiedSeats}
          trackedSeats={investigation.trackedSeats}
          activeSeat={activeSeat}
          onSelect={setActiveSeat}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeSeat != null ? (
          <ActiveSeatPanel seatNumber={activeSeat} seatRecord={seatRecord} />
        ) : (
          <p className="p-4 text-sm text-muted-foreground">No tracked seats yet.</p>
        )}
      </div>

      <div className="flex-none">
        <RoundActionBar
          onNextRound={handleNextRound}
          disabled={busy || investigation.status !== "active"}
        />
      </div>

      {editSeatsOpen && (
        <EditSeatsSheet
          investigation={investigation}
          onClose={() => setEditSeatsOpen(false)}
          onUpdated={refresh}
        />
      )}
    </div>
  );
}

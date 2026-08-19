"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { listInvestigations } from "@/lib/db/repositories/investigations";
import { getCardEventsForInvestigation } from "@/lib/db/repositories/cardEvents";
import { extractPlayerObservations } from "@/lib/player-analytics/extractObservations";
import { groupObservationsBySeat } from "@/lib/player-analytics/reportIntegration";
import { runConfidenceEngine, type ConfidenceEngineResult } from "@/lib/player-analytics/confidenceEngine";
import { HAND_CHECKPOINTS } from "@/lib/player-analytics/validation/benchmarkHarness";
import type { Investigation } from "@/types/investigation";
import type { PlayerObservation } from "@/lib/player-analytics/playerObservation";

/**
 * PRIORITY 1.7-10 — Player Behavior Analysis. Runs the REAL extraction +
 * analytics pipeline (lib/player-analytics/*) against a REAL, operator-
 * selected past investigation's real recorded data — "No fake charts or
 * placeholder numbers" (this priority's own rule). The Confidence Engine
 * behind this is EXPERIMENTAL / NOT VALIDATED — see
 * docs/EYEONPIT_1_7_COUNTER_DETECTION.md. Nothing here writes back to the
 * investigation or any report; this is a read-only research view.
 */
export default function PlayerAnalyticsPage() {
  const [investigations, setInvestigations] = useState<Investigation[] | null>(null);
  const [selectedInvestigationId, setSelectedInvestigationId] = useState<string>("");
  const [observationsBySeat, setObservationsBySeat] = useState<Map<number, PlayerObservation[]> | null>(null);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [insuranceThreshold, setInsuranceThreshold] = useState(3);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listInvestigations().then(setInvestigations);
  }, []);

  async function loadInvestigation(investigationId: string) {
    setSelectedInvestigationId(investigationId);
    setSelectedSeat(null);
    setObservationsBySeat(null);
    if (!investigationId) return;
    setLoading(true);
    const investigation = investigations?.find((i) => i.localId === investigationId);
    if (!investigation) {
      setLoading(false);
      return;
    }
    const cardEvents = await getCardEventsForInvestigation(investigationId);
    const observations = extractPlayerObservations({ investigation, cardEvents });
    setObservationsBySeat(groupObservationsBySeat(observations));
    setLoading(false);
  }

  const seatObservations = selectedSeat != null ? observationsBySeat?.get(selectedSeat) ?? [] : [];
  const result: ConfidenceEngineResult | null =
    selectedSeat != null && seatObservations.length > 0 ? runConfidenceEngine(seatObservations, { insuranceTrueCountThreshold: insuranceThreshold }) : null;

  // Confidence PROGRESSION — the same real engine re-run against successive
  // prefixes of this seat's actual observation history, at the standard
  // hand checkpoints. Real, freshly computed, never a fabricated curve.
  const progression =
    selectedSeat != null
      ? HAND_CHECKPOINTS.filter((cp) => cp <= seatObservations.length || cp === HAND_CHECKPOINTS[0]).map((cp) => {
          const slice = seatObservations.slice(0, cp);
          const r = slice.length > 0 ? runConfidenceEngine(slice, { insuranceTrueCountThreshold: insuranceThreshold }) : null;
          return { hands: Math.min(cp, seatObservations.length), classification: r?.classification ?? "INSUFFICIENT_DATA", score: r?.confidenceScore ?? 0 };
        })
      : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-accent" aria-hidden />
        <h1 className="text-lg font-bold text-foreground">Player Behavior Analysis</h1>
      </div>
      <p className="rounded-md border border-pending/40 bg-pending/10 p-2 text-xs font-medium text-pending">
        EXPERIMENTAL — NOT VALIDATED. An investigative indicator only, never an accusation or conclusion. Human
        judgment is always final. See docs/EYEONPIT_1_7_COUNTER_DETECTION.md.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-muted-foreground">
          Investigation
          <select
            value={selectedInvestigationId}
            onChange={(e) => loadInvestigation(e.target.value)}
            className="tap-target rounded-lg border border-border bg-surface px-2 text-sm text-foreground"
          >
            <option value="">Select an investigation…</option>
            {investigations?.map((inv) => (
              <option key={inv.localId} value={inv.localId}>
                {inv.displayId} — {inv.casino || "Unspecified"} ({inv.status})
              </option>
            ))}
          </select>
        </label>

        {observationsBySeat && observationsBySeat.size > 0 && (
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
            Spot
            <select
              value={selectedSeat ?? ""}
              onChange={(e) => setSelectedSeat(e.target.value ? Number(e.target.value) : null)}
              className="tap-target rounded-lg border border-border bg-surface px-2 text-sm text-foreground"
            >
              <option value="">Select a spot…</option>
              {[...observationsBySeat.keys()].sort((a, b) => a - b).map((seat) => (
                <option key={seat} value={seat}>
                  Spot {seat} ({observationsBySeat.get(seat)?.length ?? 0} hands)
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
          Insurance TC threshold
          <input
            type="number"
            value={insuranceThreshold}
            onChange={(e) => setInsuranceThreshold(Number(e.target.value))}
            className="tap-target w-24 rounded-lg border border-border bg-surface px-2 text-sm text-foreground"
          />
        </label>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {observationsBySeat && observationsBySeat.size === 0 && (
        <p className="text-sm text-muted-foreground">This investigation has no recorded seat/wager data to analyze.</p>
      )}

      {result && (
        <>
          <section className="rounded-xl border border-border bg-surface p-3">
            <h2 className="mb-2 text-sm font-bold text-foreground">Classification</h2>
            <p className="text-sm text-foreground">
              <span className="font-semibold">{result.classification.replace(/_/g, " ")}</span> — confidence{" "}
              {result.confidenceScore.toFixed(2)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {result.handsObserved} hands observed, {result.handsWithUsableEvidence} with usable wager/count evidence (minimum{" "}
              {result.minimumHandsForClassification} required for any classification beyond INSUFFICIENT_DATA).
            </p>
          </section>

          <section className="rounded-xl border border-border bg-surface p-3">
            <h2 className="mb-2 text-sm font-bold text-foreground">Confidence Progression</h2>
            <ul className="flex flex-col gap-0.5 text-xs text-foreground">
              {progression.map((p, i) => (
                <li key={i}>
                  {p.hands} hands: {p.classification.replace(/_/g, " ")} ({p.score.toFixed(2)})
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-border bg-surface p-3">
            <h2 className="mb-2 text-sm font-bold text-foreground">Signal Breakdown</h2>
            {result.allSignals.length === 0 ? (
              <p className="text-xs text-muted-foreground">No usable signals for this seat yet.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-xs text-foreground">
                {result.allSignals.map((s) => (
                  <li key={s.signalKey}>
                    <span className="font-semibold">{s.signalKey}</span> ({s.direction}, n={s.sampleSize}): strength{" "}
                    {s.strength.toFixed(2)} — {s.description}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-border bg-surface p-3">
            <h2 className="mb-2 text-sm font-bold text-foreground">Bet / Count Relationship</h2>
            <p className="text-xs text-foreground">
              Sample size {result.betCountAnalytics.sampleSize} · Correlation with true count:{" "}
              {result.betCountAnalytics.correlationWithTrueCount?.toFixed(2) ?? "—"} · Bet spread:{" "}
              {result.betCountAnalytics.betSpread
                ? `${result.betCountAnalytics.betSpread.minWager}-${result.betCountAnalytics.betSpread.maxWager}`
                : "—"}
            </p>
          </section>

          <section className="rounded-xl border border-border bg-surface p-3">
            <h2 className="mb-2 text-sm font-bold text-foreground">Playing-Deviation Evidence</h2>
            <p className="text-xs text-foreground">
              {result.playingDeviation.totalDeviations}/{result.playingDeviation.totalOpportunities} decisions deviated from basic
              strategy.{" "}
              {result.playingDeviation.indexTableProvided
                ? `Index-consistent: ${result.playingDeviation.indexConsistentDeviationRate != null ? `${(result.playingDeviation.indexConsistentDeviationRate * 100).toFixed(0)}%` : "—"}`
                : "No index table supplied — index-consistency not evaluated (see docs/EYEONPIT_1_7_COUNTER_DETECTION.md)."}
            </p>
          </section>
        </>
      )}
    </div>
  );
}

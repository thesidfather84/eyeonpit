"use client";

import { useState } from "react";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import {
  addOperatorNote,
  completeInvestigation,
  updateInvestigation,
} from "@/lib/db/repositories/investigations";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { dealerVisibleCards, computeHandTotal, deriveDealerResult } from "@/lib/utils/blackjackTotal";
import { formatCard } from "@/lib/utils/cards";

export function ReportScreen() {
  const { investigation, refresh } = useInvestigationContext();

  const [summary, setSummary] = useState(investigation.executiveSummary);
  const [memo, setMemo] = useState(investigation.surveillanceMemo);
  const [noteText, setNoteText] = useState("");
  const [completing, setCompleting] = useState(false);
  const [busy, setBusy] = useState(false);

  async function saveSummary() {
    if (summary === investigation.executiveSummary) return;
    await updateInvestigation(investigation.localId, { executiveSummary: summary });
    await refresh();
  }

  async function saveMemo() {
    if (memo === investigation.surveillanceMemo) return;
    await updateInvestigation(investigation.localId, { surveillanceMemo: memo });
    await refresh();
  }

  async function handleAddNote() {
    if (!noteText.trim()) return;
    await addOperatorNote(investigation.localId, noteText.trim());
    setNoteText("");
    await refresh();
  }

  async function handleComplete() {
    setBusy(true);
    try {
      await completeInvestigation(investigation.localId);
      // Stay put — the operator can keep reviewing this Reports overlay
      // (and the rest of the now-closed console) without navigating away.
      await refresh();
    } finally {
      setBusy(false);
      setCompleting(false);
    }
  }

  const rounds = [...investigation.rounds].sort((a, b) => a.roundNumber - b.roundNumber);

  return (
    <div className="flex flex-col gap-4 p-3">
      <section>
        <h2 className="mb-1 text-sm font-semibold text-foreground">Executive Summary</h2>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          onBlur={saveSummary}
          rows={4}
          placeholder="Operator-authored summary…"
          className="w-full rounded-lg border border-border bg-surface p-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
        />
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold text-foreground">Surveillance Memo</h2>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          onBlur={saveMemo}
          rows={4}
          placeholder="Operator-authored memo…"
          className="w-full rounded-lg border border-border bg-surface p-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
        />
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold text-foreground">Notes</h2>
        <ul className="mb-2 flex flex-col gap-1">
          {investigation.operatorNotes.map((note) => (
            <li key={note.id} className="rounded-md border border-border bg-surface p-2 text-xs">
              <span className="text-muted-foreground">
                {new Date(note.timestamp).toLocaleString()} —{" "}
              </span>
              <span className="text-foreground">{note.text}</span>
            </li>
          ))}
          {investigation.operatorNotes.length === 0 && (
            <li className="text-xs text-muted-foreground">No notes yet.</li>
          )}
        </ul>
        <div className="flex gap-2">
          <input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note…"
            className="tap-target w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
          />
          <Button variant="secondary" onClick={handleAddNote}>
            Add
          </Button>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold text-foreground">Round-by-Round Evidence</h2>
        <div className="flex flex-col gap-2">
          {rounds.map((round) => {
            const total = computeHandTotal(dealerVisibleCards(round.dealerHand));
            const dealerResult = deriveDealerResult(round.dealerHand.cards);
            return (
              <div key={round.id} className="rounded-lg border border-border bg-surface p-2 text-xs">
                <p className="mb-1 font-semibold text-foreground">
                  Round {round.roundNumber} (Shoe {round.shoeNumber})
                </p>
                <p className="mb-1 text-muted-foreground">
                  Dealer: {dealerVisibleCards(round.dealerHand).map(formatCard).join(" ") || "—"} (
                  {total.value}
                  {dealerResult ? `, ${dealerResult}` : ""})
                </p>
                {Object.values(round.seats).map(
                  (seat) =>
                    seat && (
                      <p key={seat.seatNumber} className="text-muted-foreground">
                        Seat {seat.seatNumber}: ${seat.betAmount ?? 0} —{" "}
                        {seat.playerCards.map(formatCard).join(" ") || "no cards"} —{" "}
                        {seat.outcome ?? "pending"}
                      </p>
                    )
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        {investigation.status === "closed" ? (
          <p className="rounded-lg border border-border bg-surface p-3 text-center text-xs font-medium text-muted-foreground">
            Investigation closed — every round and card above is preserved.
          </p>
        ) : (
          <Button variant="destructive" fullWidth onClick={() => setCompleting(true)}>
            Complete Investigation
          </Button>
        )}
      </section>

      <ConfirmDialog
        open={completing}
        title="Complete this investigation?"
        message={`${investigation.rounds.length} rounds recorded across ${investigation.occupiedSeats.length} occupied seat(s). You can still reopen it later from History.`}
        confirmLabel="Complete"
        destructive
        busy={busy}
        onConfirm={handleComplete}
        onCancel={() => setCompleting(false)}
      />
    </div>
  );
}

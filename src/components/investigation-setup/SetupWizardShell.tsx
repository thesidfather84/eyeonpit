"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createInvestigation } from "@/lib/db/repositories/investigations";
import { ProgressIndicator } from "@/components/onboarding/ProgressIndicator";
import { Button } from "@/components/ui/Button";
import { TableSetupStep } from "./TableSetupStep";
import { SeatSetupStep } from "./SeatSetupStep";
import { InitialBetsStep } from "./InitialBetsStep";
import { ShoeSetupStep } from "./ShoeSetupStep";
import { BeginRecordingStep } from "./BeginRecordingStep";
import type { CountingSystem } from "@/types/investigation";

export interface WizardDraft {
  casino: string;
  tableNumber: string;
  dealerName: string;
  operatorName: string;
  investigationDate: string;
  occupiedSeats: number[];
  trackedSeats: number[];
  initialWagers: Record<number, number>;
  countingSystem: CountingSystem;
  shoeTotalDecks: number;
}

const STEP_LABELS = [
  "Table Setup",
  "Seat Setup",
  "Initial Bets",
  "Shoe Setup",
  "Begin Recording",
];
const TOTAL_STEPS = STEP_LABELS.length;

export function SetupWizardShell() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Starts blank rather than defaulting to "today" here: computing that
  // during the initial render would disagree with whatever date this
  // statically-prerendered page happened to be built on, risking a
  // hydration mismatch. TableSetupStep offers a one-tap "Today" button
  // instead — a real user event, not a render-time computation. See
  // plan.md §13.3.
  const [draft, setDraft] = useState<WizardDraft>({
    casino: "",
    tableNumber: "",
    dealerName: "",
    operatorName: "",
    investigationDate: "",
    occupiedSeats: [],
    trackedSeats: [],
    initialWagers: {},
    countingSystem: "Hi-Lo",
    shoeTotalDecks: 6,
  });

  function updateDraft(patch: Partial<WizardDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  const canProceed = (() => {
    switch (step) {
      case 1:
        return Boolean(
          draft.casino.trim() &&
            draft.tableNumber.trim() &&
            draft.dealerName.trim() &&
            draft.operatorName.trim() &&
            draft.investigationDate
        );
      case 2:
        return draft.occupiedSeats.length > 0 && draft.trackedSeats.length > 0;
      case 3:
        return draft.trackedSeats.every((seat) => (draft.initialWagers[seat] ?? 0) > 0);
      default:
        return true;
    }
  })();

  async function handleBeginRecording() {
    setSubmitting(true);
    setError(null);
    try {
      const investigation = await createInvestigation({
        casino: draft.casino.trim(),
        tableNumber: draft.tableNumber.trim(),
        dealerName: draft.dealerName.trim(),
        investigationDate: draft.investigationDate,
        operatorName: draft.operatorName.trim(),
        occupiedSeats: draft.occupiedSeats,
        trackedSeats: draft.trackedSeats,
        initialWagers: draft.initialWagers,
        countingSystem: draft.countingSystem,
        shoeTotalDecks: draft.shoeTotalDecks,
        status: "active",
      });
      router.push(`/investigations/${investigation.localId}/live`);
    } catch (err) {
      console.error("Failed to create investigation:", err);
      setError("Couldn't save the investigation. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border p-4">
        <button
          onClick={() => router.push("/")}
          className="tap-target text-sm text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        <ProgressIndicator step={step} totalSteps={TOTAL_STEPS} label={STEP_LABELS[step - 1]} />
      </div>

      <div className="flex-1 p-4">
        {step === 1 && <TableSetupStep draft={draft} onChange={updateDraft} />}
        {step === 2 && <SeatSetupStep draft={draft} onChange={updateDraft} />}
        {step === 3 && <InitialBetsStep draft={draft} onChange={updateDraft} />}
        {step === 4 && <ShoeSetupStep draft={draft} onChange={updateDraft} />}
        {step === 5 && <BeginRecordingStep draft={draft} />}

        {error && (
          <p className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <div className="flex gap-3 border-t border-border p-4">
        {step > 1 && (
          <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
        )}
        <div className="flex-1" />
        {step < TOTAL_STEPS ? (
          <Button
            variant="primary"
            disabled={!canProceed}
            onClick={() => setStep((s) => s + 1)}
          >
            Next
          </Button>
        ) : (
          <Button variant="primary" disabled={submitting} onClick={handleBeginRecording}>
            {submitting ? "Starting…" : "Begin Recording Hands"}
          </Button>
        )}
      </div>
    </div>
  );
}

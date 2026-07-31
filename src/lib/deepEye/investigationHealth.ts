import { canCompleteRound } from "@/lib/utils/roundValidation";
import { hasLegacyCardActivity, recoverLegacyLedger } from "@/lib/counting-engine/migration";
import type { CardEvent } from "@/lib/counting-engine/types";
import type { Investigation } from "@/types/investigation";
import { buildReport, type DiagnosticCheck, type DiagnosticReport } from "./types";

export interface InvestigationHealthSummary {
  shoeCount: number;
  roundCount: number;
  occupiedSeatCount: number;
  activeCardEventCount: number;
  operatorNoteCount: number;
}

export interface InvestigationHealthResult extends DiagnosticReport {
  summary: InvestigationHealthSummary;
}

function isContiguousFrom1(numbers: number[]): boolean {
  const sorted = [...numbers].sort((a, b) => a - b);
  return sorted.every((n, i) => n === i + 1);
}

/**
 * Structural health of an Investigation as a whole — round/shoe numbering,
 * whether every round marked "completed" would still pass today's
 * canCompleteRound() (reusing that exact existing function, not a
 * reimplementation of its rules), and whether legacy-ledger recovery has
 * anything to report. Read-only: it calls recoverLegacyLedger() to see
 * what *would* be recovered, but never calls ensureLegacyLedger() and
 * never writes to Dexie — this diagnostic must be safe to run on a closed
 * or archived investigation without changing anything about it.
 */
export function checkInvestigationHealth(
  investigation: Investigation,
  cardEvents: CardEvent[]
): InvestigationHealthResult {
  const checks: DiagnosticCheck[] = [];

  const shoeNumbers = Array.from(new Set(investigation.rounds.map((r) => r.shoeNumber)));
  const shoesContiguous = isContiguousFrom1(shoeNumbers);
  checks.push({
    id: "shoe-numbers-contiguous",
    label: "Shoe numbers contiguous from 1",
    status: shoesContiguous ? "pass" : "fail",
    detail: shoesContiguous
      ? `${shoeNumbers.length} shoe(s), numbered 1..${shoeNumbers.length}.`
      : `Shoe numbers found: [${[...shoeNumbers].sort((a, b) => a - b).join(", ")}] — expected a contiguous run from 1.`,
  });

  for (const shoeNumber of shoeNumbers) {
    const roundNumbers = investigation.rounds
      .filter((r) => r.shoeNumber === shoeNumber)
      .map((r) => r.roundNumber);
    const contiguous = isContiguousFrom1(roundNumbers);
    checks.push({
      id: `round-numbers-contiguous-shoe-${shoeNumber}`,
      label: `Shoe ${shoeNumber} — round numbers contiguous from 1`,
      status: contiguous ? "pass" : "fail",
      detail: contiguous
        ? `${roundNumbers.length} round(s), numbered 1..${roundNumbers.length}.`
        : `Round numbers found: [${[...roundNumbers].sort((a, b) => a - b).join(", ")}].`,
    });
  }

  const completedRounds = investigation.rounds.filter((r) => r.completed);
  const stillValid = completedRounds.filter((r) => canCompleteRound(investigation, r).canComplete);
  checks.push({
    id: "completed-rounds-still-valid",
    label: "Every completed round still passes today's completion rules",
    status: stillValid.length === completedRounds.length ? "pass" : "warn",
    detail:
      stillValid.length === completedRounds.length
        ? `${completedRounds.length} completed round(s), all still valid.`
        : `${completedRounds.length - stillValid.length} of ${completedRounds.length} completed round(s) would no longer pass canCompleteRound() — investigate before trusting their derived outcomes.`,
  });

  // Read-only preview of what ensureLegacyLedger() would do — never calls
  // it, never writes. Only relevant for investigations with zero real
  // CardEvents but pre-ledger recorded activity; a normal, already-migrated
  // investigation always short-circuits both gates and reports clean.
  let legacyAmbiguityCount = 0;
  if (cardEvents.length === 0 && hasLegacyCardActivity(investigation)) {
    legacyAmbiguityCount = recoverLegacyLedger(investigation).ambiguities.length;
  }
  checks.push({
    id: "legacy-ledger-ambiguities",
    label: "Legacy ledger recovery has no flagged ambiguities",
    status: legacyAmbiguityCount === 0 ? "pass" : "warn",
    detail:
      legacyAmbiguityCount === 0
        ? cardEvents.length > 0
          ? "This investigation already has a real card-event ledger — nothing to recover."
          : "No pre-ledger card activity found — nothing to recover."
        : `${legacyAmbiguityCount} round/target(s) would be recovered from event-log text rather than structured data — see the investigation's own legacy-recovery ambiguities for detail.`,
  });

  const summary: InvestigationHealthSummary = {
    shoeCount: shoeNumbers.length,
    roundCount: investigation.rounds.length,
    occupiedSeatCount: investigation.occupiedSeats.length,
    activeCardEventCount: cardEvents.filter((e) => e.status === "active").length,
    operatorNoteCount: investigation.operatorNotes.length,
  };

  return { ...buildReport(checks), summary };
}

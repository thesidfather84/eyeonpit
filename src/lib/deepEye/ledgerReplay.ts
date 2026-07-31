import { activeEventsInOrder } from "@/lib/counting-engine/calculateCounts";
import type { CardEvent } from "@/lib/counting-engine/types";
import type { Investigation } from "@/types/investigation";
import { buildReport, type DiagnosticCheck, type DiagnosticReport } from "./types";

const KNOWN_STATUSES = new Set(["active", "undone", "void"]);

/**
 * Verifies the ledger's own internal ordering — not what it counts to
 * (see countIntegrity.ts), but whether its sequence numbers form a coherent
 * history at all. nextSequence() always assigns max(existing)+1 *within a
 * shoe*, over every event ever created for it regardless of status (an
 * undone event still permanently consumes its sequence number — it is
 * never reused). So per shoe, the full set of sequence numbers — active
 * and undone together — must be exactly {1, 2, ..., N} with no gap and no
 * repeat. A gap or repeat means either a bug in how events were written, or
 * data that arrived by some path other than createCardEvent (a hand edit,
 * a bad import, a merge of two devices' event streams).
 */
export function checkLedgerReplay(investigation: Investigation, events: CardEvent[]): DiagnosticReport {
  const checks: DiagnosticCheck[] = [];

  const roundIds = new Set(investigation.rounds.map((r) => r.id));
  const shoeNumbers = Array.from(new Set(events.map((e) => e.shoeNumber))).sort((a, b) => a - b);

  for (const shoeNumber of shoeNumbers) {
    const inShoe = events.filter((e) => e.shoeNumber === shoeNumber);
    const sequences = inShoe.map((e) => e.sequence).sort((a, b) => a - b);
    const expected = Array.from({ length: sequences.length }, (_, i) => i + 1);
    const contiguous = sequences.length > 0 && sequences.every((s, i) => s === expected[i]);
    checks.push({
      id: `sequence-contiguous-shoe-${shoeNumber}`,
      label: `Shoe ${shoeNumber} — sequence numbers contiguous from 1`,
      status: contiguous ? ("pass" as const) : ("fail" as const),
      detail: contiguous
        ? `${sequences.length} event(s), sequence 1..${sequences.length}, no gaps or repeats.`
        : `Found sequences [${sequences.join(", ")}] — expected exactly 1..${sequences.length}.`,
    });
  }

  const orphaned = events.filter((e) => !roundIds.has(e.roundId));
  checks.push({
    id: "no-orphaned-events",
    label: "Every event points at a round that still exists",
    status: orphaned.length === 0 ? "pass" : "fail",
    detail:
      orphaned.length === 0
        ? `${events.length} event(s), every roundId resolves.`
        : `${orphaned.length} event(s) reference a roundId not present in investigation.rounds.`,
  });

  const badStatus = events.filter((e) => !KNOWN_STATUSES.has(e.status));
  checks.push({
    id: "all-statuses-recognized",
    label: "Every event's status is a recognized value",
    status: badStatus.length === 0 ? "pass" : "fail",
    detail:
      badStatus.length === 0
        ? `${events.length} event(s), all statuses recognized (active/undone/void).`
        : `${badStatus.length} event(s) carry an unrecognized status value.`,
  });

  // Idempotency: activeEventsInOrder is meant to be safe to run again on its
  // own output — dedup-by-id + active-only + sequence order should already
  // be a fixed point. If a second pass changes anything, that's a bug in
  // the dedup/ordering logic itself, not a data problem.
  const once = activeEventsInOrder(events);
  const twice = activeEventsInOrder(once);
  const stable =
    once.length === twice.length && once.every((e, i) => e.id === twice[i]?.id && e.sequence === twice[i]?.sequence);
  checks.push({
    id: "active-events-in-order-idempotent",
    label: "Replaying the active-event ordering twice is stable",
    status: stable ? "pass" : "fail",
    detail: stable
      ? `${once.length} active event(s), identical result on a second pass.`
      : `A second pass over the same input produced a different ordering — this must never happen.`,
  });

  return buildReport(checks);
}

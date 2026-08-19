import type { PlayerObservation } from "./playerObservation";

/**
 * PRIORITY 1.7-5 — entry/exit (wong-in/wong-out) EVIDENCE tracking. Every
 * value here is a plain count or rate over `isFirstHandOfEntry`/
 * `isLastHandBeforeExit` (already derived, honestly, in
 * extractObservations.ts) and `trueCountAtWager` — never a classification.
 * "This should be evidence input only. Do not classify solely from
 * wong-in/wong-out behavior" (this priority's own rule) — nothing in this
 * file outputs a verdict; the Confidence Engine (confidenceEngine.ts) is
 * the only place multiple evidence sources are ever combined into a
 * classification.
 *
 * A player's very FIRST appearance in an investigation is excluded from
 * "entry consistency" — sitting down for the first time is ordinary table
 * behavior, not wong-in behavior by definition. Only later RESUMES (an
 * `isFirstHandOfEntry` observation that isn't the seat's first-ever
 * appearance) count as entry evidence.
 *
 * "Count at exit" is approximated as the exiting hand's OWN
 * `trueCountAtWager` (the count context of the last hand actually played
 * before leaving) — there is no later observation to read a truer
 * "count at the moment of standing up" from when the player never returns,
 * so this is a documented approximation, not a further invented statistic.
 */
export const ENTRY_EXIT_ANALYSIS_VERSION = 1;

export interface EntryEvent {
  observationId: string;
  handSequenceNumber: number;
  trueCountAtEntry: number | null;
  isInitialJoin: boolean;
}

export interface ExitEvent {
  observationId: string;
  handSequenceNumber: number;
  trueCountAtExit: number | null;
}

export interface EntryExitEvidence {
  version: number;
  entries: EntryEvent[];
  exits: ExitEvent[];
  resumeCount: number;
  entriesAtPositiveCount: number;
  entriesAtNegativeOrZeroCount: number;
  exitsAtPositiveCount: number;
  exitsAtNegativeOrZeroCount: number;
  /** Of RESUME entries (initial join excluded) with a known count, the fraction that occurred at a positive true count. Null with no usable resumes. */
  entryCountConsistencyRate: number | null;
  /** Of exits with a known count, the fraction that occurred at a negative-or-zero true count. Null with no usable exits. */
  exitCountConsistencyRate: number | null;
}

export function computeEntryExitEvidence(observations: PlayerObservation[]): EntryExitEvidence {
  const sorted = [...observations].filter((o) => !o.isSplitHand).sort((a, b) => a.handSequenceNumber - b.handSequenceNumber);

  const entries: EntryEvent[] = sorted
    .filter((o) => o.isFirstHandOfEntry)
    .map((o) => ({
      observationId: o.id,
      handSequenceNumber: o.handSequenceNumber,
      trueCountAtEntry: o.trueCountAtWager,
      isInitialJoin: o.handSequenceNumber === (sorted[0]?.handSequenceNumber ?? o.handSequenceNumber),
    }));

  const exits: ExitEvent[] = sorted
    .filter((o) => o.isLastHandBeforeExit)
    .map((o) => ({ observationId: o.id, handSequenceNumber: o.handSequenceNumber, trueCountAtExit: o.trueCountAtWager }));

  const resumeEntries = entries.filter((e) => !e.isInitialJoin);
  const resumesWithCount = resumeEntries.filter((e) => e.trueCountAtEntry != null);
  const resumesAtPositive = resumesWithCount.filter((e) => (e.trueCountAtEntry as number) > 0).length;
  const resumesAtNegativeOrZero = resumesWithCount.length - resumesAtPositive;

  const exitsWithCount = exits.filter((e) => e.trueCountAtExit != null);
  const exitsAtPositive = exitsWithCount.filter((e) => (e.trueCountAtExit as number) > 0).length;
  const exitsAtNegativeOrZero = exitsWithCount.length - exitsAtPositive;

  return {
    version: ENTRY_EXIT_ANALYSIS_VERSION,
    entries,
    exits,
    resumeCount: resumeEntries.length,
    entriesAtPositiveCount: resumesAtPositive,
    entriesAtNegativeOrZeroCount: resumesAtNegativeOrZero,
    exitsAtPositiveCount: exitsAtPositive,
    exitsAtNegativeOrZeroCount: exitsAtNegativeOrZero,
    entryCountConsistencyRate: resumesWithCount.length === 0 ? null : resumesAtPositive / resumesWithCount.length,
    exitCountConsistencyRate: exitsWithCount.length === 0 ? null : exitsAtNegativeOrZero / exitsWithCount.length,
  };
}

import type { VoiceUtteranceSummary } from "./voiceDiagnosticsTypes";

/**
 * PC Field Test #2, PRIORITY 12 — a session-level summary derived purely
 * from data VoiceControl already collects (VoiceUtteranceSummary entries
 * plus three small lifecycle counters — see VoiceControl's own
 * sessionsStarted/sessionsWithFinal/asrNoFinalCount state). No new
 * tracking mechanism, no change to what's dispatched or committed: this is
 * read-only aggregation over the existing diagnostic record, exactly like
 * VoiceDiagnosticsPanel's own "latest utterance" view is.
 */
export interface VoiceSessionMetrics {
  totalUtterances: number;
  accepted: number;
  rejected: number;
  /** accepted / totalUtterances, 0 when there were no utterances at all (never NaN). */
  acceptanceRate: number;
  sessionsStarted: number;
  sessionsWithFinal: number;
  asrNoFinal: number;
  /** asrNoFinal / sessionsStarted, 0 when no sessions have started yet. */
  asrNoFinalRate: number;
  /** Accepted utterances where N-best resolution picked a non-top-ranked alternative. */
  nBestRescues: number;
  /** Accepted utterances rescued via the dealer-confusion recovery grammar (DEALER_ASR_TAYLOR/DEALER_ASR_SPOTIFY/...). */
  dealerConfusionRescues: number;
  /** Accepted utterances rescued via the player/"play"-confusion ASR normalization rules (ASR_PLAY_*). */
  playerConfusionRescues: number;
  /** Accepted utterances where at least one ASR-artifact normalization rule fired on the winning alternative. */
  normalizationRescues: number;
  /** Accepted utterances whose winning classification carried 2+ ordered operations (compound narration, a multi-card dealer recovery, ...). */
  compoundUtterancesAccepted: number;
  /** Accepted utterances specifically via the target-omitted continuation path — i.e. the winning classification carried no explicit target for at least one card in the sequence. Best-effort: derived from `hasExplicitTarget` on narration-shaped winners only. */
  activeTargetContinuationRescues: number;
  averageSpeechStartToFinalMs: number | null;
  medianSpeechStartToFinalMs: number | null;
  averageFinalToCommitMs: number | null;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function computeSessionMetrics(
  utterances: VoiceUtteranceSummary[],
  counters: { sessionsStarted: number; sessionsWithFinal: number; asrNoFinal: number }
): VoiceSessionMetrics {
  const accepted = utterances.filter((u) => u.outcome === "ACCEPTED");
  const rejected = utterances.filter((u) => u.outcome !== "ACCEPTED");

  const speechStartToFinal = utterances
    .map((u) => u.speechStartToFinalMs)
    .filter((v): v is number => v != null);
  const finalToCommit = utterances.map((u) => u.finalToCommitMs).filter((v): v is number => v != null);

  return {
    totalUtterances: utterances.length,
    accepted: accepted.length,
    rejected: rejected.length,
    acceptanceRate: utterances.length === 0 ? 0 : accepted.length / utterances.length,
    sessionsStarted: counters.sessionsStarted,
    sessionsWithFinal: counters.sessionsWithFinal,
    asrNoFinal: counters.asrNoFinal,
    asrNoFinalRate: counters.sessionsStarted === 0 ? 0 : counters.asrNoFinal / counters.sessionsStarted,
    nBestRescues: accepted.filter((u) => u.nBestRescue).length,
    dealerConfusionRescues: accepted.filter((u) => u.recoveryRuleId?.startsWith("DEALER_ASR_")).length,
    playerConfusionRescues: accepted.filter((u) =>
      (u.normalizationRuleIds ?? []).some((id) => id.startsWith("ASR_PLAY_"))
    ).length,
    normalizationRescues: accepted.filter((u) => (u.normalizationRuleIds ?? []).length > 0).length,
    compoundUtterancesAccepted: accepted.filter((u) => (u.narrationOpsCount ?? 0) > 1).length,
    // Target-omitted continuation (PRIORITY 3): a narration-shaped winner
    // ((narrationOpsCount ?? 0) >= 1) with NO explicit target anywhere in
    // it — every card resolved purely against the live active target.
    activeTargetContinuationRescues: accepted.filter(
      (u) => (u.narrationOpsCount ?? 0) >= 1 && u.hasExplicitTarget === false
    ).length,
    averageSpeechStartToFinalMs: average(speechStartToFinal),
    medianSpeechStartToFinalMs: median(speechStartToFinal),
    averageFinalToCommitMs: average(finalToCommit),
  };
}

// @vitest-environment node
import { describe, expect, it } from "vitest";
import { computeSessionMetrics } from "./sessionMetrics";
import type { VoiceUtteranceSummary } from "./voiceDiagnosticsTypes";

function utterance(overrides: Partial<VoiceUtteranceSummary>): VoiceUtteranceSummary {
  return {
    voiceEventId: "V-000001",
    time: "00:00:00.000",
    alternatives: [{ index: 0, transcript: "dealer king", confidence: 0.9 }],
    winnerIndex: 0,
    winningTranscript: "dealer king",
    normalized: "dealer king",
    outcome: "ACCEPTED",
    resolveReason: "Only valid alternative.",
    actionSummary: "DEALER: K",
    activeTargetBefore: "DEALER",
    ...overrides,
  };
}

describe("computeSessionMetrics", () => {
  it("returns all-zero, never NaN, for an empty session", () => {
    const metrics = computeSessionMetrics([], { sessionsStarted: 0, sessionsWithFinal: 0, asrNoFinal: 0 });
    expect(metrics.totalUtterances).toBe(0);
    expect(metrics.acceptanceRate).toBe(0);
    expect(metrics.asrNoFinalRate).toBe(0);
    expect(metrics.averageSpeechStartToFinalMs).toBeNull();
    expect(metrics.medianSpeechStartToFinalMs).toBeNull();
  });

  it("computes acceptance rate and counts from a mix of accepted/rejected utterances", () => {
    const metrics = computeSessionMetrics(
      [utterance({ outcome: "ACCEPTED" }), utterance({ outcome: "ACCEPTED" }), utterance({ outcome: "REJECTED" })],
      { sessionsStarted: 3, sessionsWithFinal: 3, asrNoFinal: 0 }
    );
    expect(metrics.totalUtterances).toBe(3);
    expect(metrics.accepted).toBe(2);
    expect(metrics.rejected).toBe(1);
    expect(metrics.acceptanceRate).toBeCloseTo(2 / 3);
  });

  it("computes ASR_NO_FINAL rate from session counters, independent of utterance count", () => {
    const metrics = computeSessionMetrics([], { sessionsStarted: 10, sessionsWithFinal: 6, asrNoFinal: 4 });
    expect(metrics.asrNoFinalRate).toBeCloseTo(0.4);
  });

  it("counts N-best rescues only among accepted utterances that were not the top-ranked alternative", () => {
    const metrics = computeSessionMetrics(
      [
        utterance({ outcome: "ACCEPTED", nBestRescue: true }),
        utterance({ outcome: "ACCEPTED", nBestRescue: false }),
        utterance({ outcome: "REJECTED", nBestRescue: true }), // rejected — must not count
      ],
      { sessionsStarted: 3, sessionsWithFinal: 3, asrNoFinal: 0 }
    );
    expect(metrics.nBestRescues).toBe(1);
  });

  it("distinguishes dealer-confusion, player-confusion, and plain normalization rescues by rule ID", () => {
    const metrics = computeSessionMetrics(
      [
        utterance({ outcome: "ACCEPTED", recoveryRuleId: "DEALER_ASR_TAYLOR" }),
        utterance({ outcome: "ACCEPTED", normalizationRuleIds: ["ASR_PLAY_TO_PLAYER"] }),
        utterance({ outcome: "ACCEPTED", normalizationRuleIds: ["ASR_SEAT_PREFIX_VARIANT"] }),
      ],
      { sessionsStarted: 3, sessionsWithFinal: 3, asrNoFinal: 0 }
    );
    expect(metrics.dealerConfusionRescues).toBe(1);
    expect(metrics.playerConfusionRescues).toBe(1);
    // normalizationRescues counts `normalizationRuleIds`, a DIFFERENT signal
    // from `recoveryRuleId` (dealer-confusion recovery bypasses ordinary
    // ASR-artifact normalization entirely) — only the two utterances that
    // actually carry normalizationRuleIds count here, not the dealer one.
    expect(metrics.normalizationRescues).toBe(2);
  });

  it("counts compound utterances (2+ ops) and target-omitted continuation (no explicit target) separately", () => {
    const metrics = computeSessionMetrics(
      [
        utterance({ outcome: "ACCEPTED", narrationOpsCount: 3, hasExplicitTarget: true }),
        utterance({ outcome: "ACCEPTED", narrationOpsCount: 1, hasExplicitTarget: false }),
        utterance({ outcome: "ACCEPTED", narrationOpsCount: 1, hasExplicitTarget: true }),
      ],
      { sessionsStarted: 3, sessionsWithFinal: 3, asrNoFinal: 0 }
    );
    expect(metrics.compoundUtterancesAccepted).toBe(1);
    expect(metrics.activeTargetContinuationRescues).toBe(1);
  });

  it("computes average and median timing from only the utterances that have it", () => {
    const metrics = computeSessionMetrics(
      [
        utterance({ speechStartToFinalMs: 100, finalToCommitMs: 10 }),
        utterance({ speechStartToFinalMs: 200, finalToCommitMs: 20 }),
        utterance({ speechStartToFinalMs: 300, finalToCommitMs: undefined }),
        utterance({ speechStartToFinalMs: undefined }),
      ],
      { sessionsStarted: 4, sessionsWithFinal: 4, asrNoFinal: 0 }
    );
    expect(metrics.averageSpeechStartToFinalMs).toBeCloseTo(200);
    expect(metrics.medianSpeechStartToFinalMs).toBeCloseTo(200);
    expect(metrics.averageFinalToCommitMs).toBeCloseTo(15);
  });
});

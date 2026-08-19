import type { Report, ReportAiAssistMetadata } from "./reportSchema";

/**
 * PRIORITY A7 — AI-assisted narrative draft support. This foundation pass
 * ships a DETERMINISTIC, NON-AI draft generator (`buildDeterministicDraft`)
 * — there is no LLM API key/provider wired into this app, and standing one
 * up is a real infrastructure decision (cost, provider choice, data
 * handling) outside a single foundation patch's scope. What IS built is
 * the full CONTRACT a real AI provider would plug into later
 * (`NarrativeDraftProvider`) plus the safety rules every implementation —
 * deterministic or AI — must follow:
 *
 *   - summarizes evidence ALREADY PRESENT in the Report, never invents
 *     observations, player behavior, count values, or timestamps
 *   - never replaces the authoritative CardEvent/Investigation data
 *   - always marked `reviewedByOperator: false` until a human explicitly
 *     accepts it — see reportSchema.ts's ReportAiAssistMetadata
 *   - a draft is a SUGGESTION for the executive summary/memo text, never
 *     auto-applied to the report
 */

export interface NarrativeDraftResult {
  draftText: string;
  modelIdentifier: string;
  generatedAt: string;
}

/** The contract a real AI provider would implement later — see this file's own doc comment. Deliberately synchronous-friendly (a real implementation would be async; the deterministic one below just happens not to need to be). */
export interface NarrativeDraftProvider {
  identifier: string;
  generateDraft(report: Report): Promise<NarrativeDraftResult>;
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Assembles a plain, factual draft summary FROM THE REPORT'S OWN ALREADY-
 * COMPUTED FIELDS ONLY — no invention, no external call, fully offline. This
 * is what ships as the DEFAULT provider; a real AI provider can be added
 * later by implementing `NarrativeDraftProvider` and is never required for
 * the reporting feature to work.
 */
export const deterministicDraftProvider: NarrativeDraftProvider = {
  identifier: "eyeonpit-deterministic-v1",
  async generateDraft(report: Report): Promise<NarrativeDraftResult> {
    const { observedPlay, timing, property, gameConfig } = report;
    const parts: string[] = [];

    parts.push(
      `Investigation observed at ${property.propertyName} (table ${property.tableIdentifier}) on ${timing.investigationDate}, ` +
        `covering ${pluralize(observedPlay.shoesObserved, "shoe")} and ${pluralize(observedPlay.handsObserved, "hand")}.`
    );

    if (timing.durationMs != null) {
      const minutes = Math.round(timing.durationMs / 60000);
      parts.push(`Total observation duration: approximately ${pluralize(minutes, "minute")}.`);
    }

    parts.push(`Counting system: ${gameConfig.countingSystem}, ${gameConfig.shoeTotalDecks}-deck shoe.`);

    if (observedPlay.countHistory.length > 0) {
      const runningCounts = observedPlay.countHistory.map((c) => c.runningCount);
      const high = Math.max(...runningCounts);
      const low = Math.min(...runningCounts);
      parts.push(`Running count ranged from ${low} to ${high} across the observed play.`);
    }

    if (report.analysis?.betCountCorrelationBySeat && report.analysis.betCountCorrelationBySeat.length > 0) {
      const elevated = report.analysis.betCountCorrelationBySeat.filter((s) => s.level === "elevated");
      if (elevated.length > 0) {
        parts.push(
          `${pluralize(elevated.length, "seat")} showed an elevated bet/count correlation in this session's data (see Bet/Count Correlation section for details and sample size).`
        );
      }
    }

    if (report.narrative.operatorNotes.length > 0) {
      parts.push(`${pluralize(report.narrative.operatorNotes.length, "operator note")} recorded during the investigation.`);
    }

    parts.push("This is a factual draft assembled from recorded data — review and edit before use as the final summary.");

    return {
      draftText: parts.join(" "),
      modelIdentifier: deterministicDraftProvider.identifier,
      generatedAt: new Date().toISOString(),
    };
  },
};

/**
 * Runs a provider (defaults to the deterministic one). Returns the draft
 * TEXT separately from the ReportAiAssistMetadata that would be attached to
 * the Report — `metadata.reviewedByOperator` always starts `false`, per
 * this file's own safety rule; the caller (UI) must flip that only once a
 * human has actually looked at the draft, and must explicitly copy
 * `draftText` into `narrative.executiveSummary`/`surveillanceMemo` — this
 * function never writes to a Report itself.
 */
export async function generateNarrativeDraft(
  report: Report,
  provider: NarrativeDraftProvider = deterministicDraftProvider
): Promise<{ draftText: string; metadata: ReportAiAssistMetadata }> {
  const result = await provider.generateDraft(report);
  return {
    draftText: result.draftText,
    metadata: {
      used: true,
      modelIdentifier: result.modelIdentifier,
      draftGeneratedAt: result.generatedAt,
      reviewedByOperator: false,
    },
  };
}

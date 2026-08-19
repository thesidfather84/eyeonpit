import type { VersionedRecord, VersionRef } from "@/lib/versioning/types";
import type { CountingSystem } from "@/types/investigation";

/**
 * PRIORITY A4 — the versioned Report data model. See
 * docs/EYEONPIT_1_5_REPORTING.md for the full design rationale; this file
 * is the type definitions only (pure data — no React, no Dexie, no I/O).
 *
 * Every field here is either:
 *   (a) copied/derived from authoritative Investigation/CardEvent data at
 *       generation time (see reportBuilder.ts) — OBSERVED FACTS, or
 *   (b) operator-authored narrative text, or
 *   (c) an OPTIONAL analysis section, present only when real validated 1.6
 *       data exists to populate it — see `ReportAnalysisSection`'s own doc
 *       comment and docs/EYEONPIT_PRODUCT_SPEC.md §15's Deep Eye rules.
 *
 * A `Report` is generated FROM a completed (or in-progress) Investigation
 * and is its OWN persisted record — see the module doc comment in
 * reportBuilder.ts for why the Investigation type/schema itself was
 * deliberately left untouched.
 */

/** Bumped to 2 for EyeOnPit 1.7 — ReportAnalysisSection gained the counter/betting/playing-deviation/insurance/observation-confidence/methodology optional fields (see that interface's own doc comment). A schema-v1 report simply lacks these fields; nothing about v1 reports changes retroactively. */
export const REPORT_SCHEMA_VERSION = 2;

/** OBSERVED FACT vs. DERIVED ANALYSIS — every section of the report is tagged with which one it is, per docs/EYEONPIT_PRODUCT_SPEC.md §16's explicit requirement that the two never blur together. */
export type ReportSectionKind = "observed-fact" | "derived-analysis" | "narrative";

/** PRIORITY A2 (session-specific half) — table/shift/observer/incident-number context for THIS report. The property's own reusable identity (code/name/location) lives in PropertyMetadata; this is what's specific to one investigation's report. */
export interface ReportPropertyContext {
  /** Snapshot of PropertyMetadata at generation time — never a live reference, so editing a property later never silently rewrites an already-generated report. */
  propertyCode: string;
  propertyName: string;
  city?: string;
  state?: string;
  country?: string;
  tableIdentifier: string;
  shift?: string;
  /** The observer/investigator of record — distinct from `Investigation.operatorName`, which this is seeded from but may be corrected/expanded at report time (e.g. a full name vs. a floor nickname). */
  investigatorName: string;
  /** External case/incident number (e.g. a casino's own IN system) — free text, optional, never validated against a format EyeOnPit doesn't own. */
  externalIncidentNumber?: string;
  notes?: string;
}

/** PRIORITY A3 — Player Identity Privacy Rule. Deliberately absent: name, loyalty-card number, government ID, or any other persistent/searchable identifying field. This is enforced by the type system (there is nothing here TO populate with PII) — see docs/EYEONPIT_1_5_REPORTING.md's "Player Identity Privacy Rule" section for the full policy and why a runtime PII scrubber was deliberately NOT built instead (unreliable, false sense of safety). */
export interface ObservedPlayerProfile {
  /** Which seat(s) this profile corresponds to, for cross-reference with the round-by-round evidence below. */
  seatNumbers: number[];
  /** Physical/behavioral description ONLY — "male, 40s, red jacket" — never a name or ID. */
  physicalDescription?: string;
  /** A non-identifying label to distinguish players WITHIN this one report ("Player A") — never a real name, never persisted/searchable across investigations or reports. */
  referenceLabel?: string;
  /**
   * Explicitly optional and explicitly scoped to THIS report only — see
   * this interface's own doc comment. If a future feature adds richer
   * temporary player metadata, it must remain: optional, clearly temporary,
   * excluded from any persistent SEARCHABLE identity store, and designed
   * for future enterprise permissions/audit controls before it can be
   * relied upon operationally. Persistent identity/search remains
   * deliberately deferred past this schema.
   */
  temporaryReportOnlyNote?: string;
}

export interface ReportGameConfig {
  gameType: string;
  blackjackFormat: string;
  countingSystem: CountingSystem;
  shoeTotalDecks: number;
  /** Present only once a GameDefinition (Priority B1) has actually been attached to the investigation's play — omitted, never guessed, when no rule set was configured. */
  gameDefinitionRef?: VersionRef;
}

export interface ReportTiming {
  investigationDate: string;
  startedAt: string;
  /** Null while the investigation is still open — a report CAN be previewed/generated before Complete Investigation (Priority A5), in which case this and `durationMs` are both null rather than a fabricated end time. */
  endedAt: string | null;
  durationMs: number | null;
  /** Wall-clock time actually spent paused — subtracted from `durationMs` so duration reflects active observation time, matching `Investigation.pausedDurationMs`. */
  pausedDurationMs: number;
}

/** A single notable moment worth calling out on its own — a dealer bust streak, a large bet swing, a misdeal, a seat change — distinct from the full round-by-round evidence list, which is exhaustive rather than curated. */
export interface ReportSignificantEvent {
  timestamp: string;
  roundNumber: number | null;
  shoeNumber: number | null;
  description: string;
}

export interface ReportCountHistoryEntry {
  shoeNumber: number;
  roundNumber: number;
  runningCount: number;
  trueCount: number | null;
}

export interface ReportRoundEvidence {
  roundNumber: number;
  shoeNumber: number;
  dealerCards: string[];
  dealerTotal: number;
  dealerResult: string | null;
  seats: {
    seatNumber: number;
    betAmount: number | null;
    cards: string[];
    outcome: string | null;
  }[];
}

export interface ReportObservedPlay {
  shoesObserved: number;
  handsObserved: number;
  countHistory: ReportCountHistoryEntry[];
  significantEvents: ReportSignificantEvent[];
  roundEvidence: ReportRoundEvidence[];
}

export interface ReportNarrative {
  executiveSummary: string;
  surveillanceMemo: string;
  /** Verbatim operator notes, timestamp-ordered — never edited/summarized by this report layer; see docs/EYEONPIT_PRODUCT_SPEC.md §13. */
  operatorNotes: { timestamp: string; text: string }[];
  /** PRIORITY A7 — present only when an AI-assisted draft was actually generated and reviewed; see reportNarrative.ts. Never influences `executiveSummary`/`surveillanceMemo` automatically — a draft must be explicitly accepted (copied in) by the operator. */
  aiAssist?: ReportAiAssistMetadata;
}

/** PRIORITY A7 — traceability for an AI-assisted draft, never the draft's own authority over the final text. */
export interface ReportAiAssistMetadata {
  used: boolean;
  /** Free-text identifier of the model/service used, if any — never assumed present (offline-first: a report must be fully usable with this entirely absent). */
  modelIdentifier?: string;
  draftGeneratedAt?: string;
  /** True once the operator has explicitly reviewed and accepted (or edited) the draft into `executiveSummary`/`surveillanceMemo` — a report must never claim AI assistance was "used" while still showing an unreviewed draft as final. */
  reviewedByOperator: boolean;
}

/**
 * PRIORITY A5/S1 — the Deep Eye / Gold-Standard analysis section. OMITTED
 * ENTIRELY (not present as `undefined`-but-rendered, not a placeholder
 * object) whenever no validated data exists for a given sub-section — see
 * each field's own optionality below and reportBuilder.ts's own doc
 * comment. A report preview/export must render "not available for this
 * investigation" for any missing piece, never fabricate a number or a
 * confidence figure to fill the gap (docs/EYEONPIT_PRODUCT_SPEC.md §15's
 * explicit rule against invented AI-style confidence figures).
 */
export interface ReportAnalysisSection {
  /** Present only once computeApLikelihoodBySeat has real data (sampleSize > 0) for at least one seat — the CURRENT, real, already-implemented AP-correlation computation (lib/analysis/apLikelihood.ts), unchanged by this schema. */
  betCountCorrelationBySeat?: {
    seatNumber: number;
    correlation: number;
    sampleSize: number;
    level: "low" | "moderate" | "elevated";
  }[];
  /** Priority B7/B8 — omitted entirely until a real SimulationResult has been explicitly linked to this investigation's methodology (e.g. "does this operator's observed strategy deviate meaningfully from optimal?"); not populated by the foundation this patch builds. */
  simulationMethodologyRef?: VersionRef;

  // ---- EyeOnPit 1.7 — Counter Detection / Player Analytics (Priority 9) ----
  // Every field below is populated ONLY via the explicit, opt-in
  // `attachPlayerAnalytics` helper in lib/player-analytics/reportIntegration.ts
  // — never automatically by buildReportFromInvestigation. The Confidence
  // Engine that produces `counterAnalysisBySeat` is EXPERIMENTAL / NOT
  // VALIDATED (see docs/EYEONPIT_1_7_COUNTER_DETECTION.md) — a report that
  // includes it MUST also include `methodology` disclosing that status;
  // `attachPlayerAnalytics` enforces this structurally, not just by
  // convention. "Do NOT present experimental analysis as fact" (Priority
  // 9's own rule) is why this stays a deliberate, separate attachment step
  // rather than a field every report silently gains.

  /** The Confidence Engine's own five-state classification, per seat/player-group — see lib/player-analytics/confidenceEngine.ts. Never a bare boolean. */
  counterAnalysisBySeat?: {
    seatNumber: number;
    playerGroupId: string | null;
    classification: "INSUFFICIENT_DATA" | "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";
    confidenceScore: number;
    reasonCodes: string[];
    strongestContributingSignals: { signalKey: string; description: string; strength: number }[];
    contradictorySignals: { signalKey: string; description: string; strength: number }[];
    engineVersion: number;
  }[];

  /** Richer than `betCountCorrelationBySeat` — includes bet spread and count-threshold response, from lib/player-analytics/betCountAnalytics.ts. */
  bettingAnalysisBySeat?: {
    seatNumber: number;
    playerGroupId: string | null;
    sampleSize: number;
    correlationWithTrueCount: number | null;
    betSpread: { minWager: number; maxWager: number; ratio: number | null } | null;
    version: number;
  }[];

  /** Basic-strategy consistency is always real when present; index-consistency stays null unless a real, sourced index table was supplied — see lib/player-analytics/playingDeviationAnalysis.ts's own doc comment. */
  playingDeviationAnalysisBySeat?: {
    seatNumber: number;
    playerGroupId: string | null;
    totalOpportunities: number;
    totalDeviations: number;
    deviationRate: number | null;
    indexTableProvided: boolean;
    indexConsistentDeviationRate: number | null;
    version: number;
  }[];

  insuranceAnalysisBySeat?: {
    seatNumber: number;
    playerGroupId: string | null;
    timesOffered: number;
    timesTaken: number;
    countConsistentRate: number | null;
    trueCountThresholdUsed: number;
    version: number;
  }[];

  /** How much evidence backs each seat's analysis — the honest "how seriously should a reader take this" figure, always shown alongside `counterAnalysisBySeat`. */
  observationConfidenceBySeat?: {
    seatNumber: number;
    handsObserved: number;
    handsWithUsableEvidence: number;
    minimumHandsForClassification: number;
  }[];

  /** Required whenever ANY 1.7 analytics field above is present — see `attachPlayerAnalytics`. */
  methodology?: {
    playerObservationSchemaVersion: number;
    confidenceEngineVersion: number;
    validationStatus: "EXPERIMENTAL_NOT_VALIDATED";
    limitations: string[];
  };
}

export interface ReportDisposition {
  /** Blank/operator-fillable per docs/EYEONPIT_PRODUCT_SPEC.md §16 — "Blank fields that can be completed later (e.g., by a manager after the fact)." */
  managementNotes?: string;
  outcome?: "no-action" | "flagged-for-review" | "escalated" | "other";
  reviewedBy?: string;
  reviewedAt?: string;
}

/** PRIORITY A8 — Report Version Traceability. Every exported report must be traceable to exactly these. */
export interface ReportVersionInfo {
  reportSchemaVersion: number;
  /** package.json version, or the build-info route's own identifier — see reportVersionInfo.ts. */
  applicationVersion: string;
  countingEngineVersion: string;
  /** The CountingSystem actually used, plus its registry entry's version once Priority B2/B3 methods are wired to a real investigation — omitted (not fabricated) for investigations that predate the registry. */
  countMethodRef?: VersionRef;
  investigationId: string;
  investigationDisplayId: string;
  /** Populated only when ReportAnalysisSection is present and references real analytics with their own version. */
  analyticsVersions: VersionRef[];
  generatedAt: string;
}

export interface Report extends VersionedRecord {
  humanId: string;
  investigationId: string;
  status: "draft" | "final";
  property: ReportPropertyContext;
  gameConfig: ReportGameConfig;
  timing: ReportTiming;
  observedPlay: ReportObservedPlay;
  players: ObservedPlayerProfile[];
  narrative: ReportNarrative;
  /** Absent (not `null`, not an empty object) whenever no validated analysis exists — see ReportAnalysisSection's own doc comment. */
  analysis?: ReportAnalysisSection;
  disposition: ReportDisposition;
  versionInfo: ReportVersionInfo;
}

/** Tags each top-level report section with its ReportSectionKind, for a preview/export renderer to visually separate fact from analysis from narrative without hand-maintaining a parallel list elsewhere. */
export const REPORT_SECTION_KINDS: Record<string, ReportSectionKind> = {
  property: "observed-fact",
  gameConfig: "observed-fact",
  timing: "observed-fact",
  observedPlay: "observed-fact",
  players: "observed-fact",
  narrative: "narrative",
  analysis: "derived-analysis",
  disposition: "narrative",
};

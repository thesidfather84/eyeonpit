import { calculateRoundCountSnapshot } from "@/lib/analysis/roundCountSnapshot";
import { computeApLikelihoodBySeat } from "@/lib/analysis/apLikelihood";
import { dealerVisibleCards, computeHandTotal, deriveDealerResult } from "@/lib/utils/blackjackTotal";
import { formatCard } from "@/lib/utils/cards";
import { ENGINE_VERSIONS, type VersionedRecord } from "@/lib/versioning/types";
import { generateCanonicalId, generateHumanReadableId } from "@/lib/versioning/id";
import type { CardEvent } from "@/lib/counting-engine/types";
import type { Investigation } from "@/types/investigation";
import type { PropertyMetadata } from "./propertyMetadata";
import {
  REPORT_SCHEMA_VERSION,
  type Report,
  type ReportAnalysisSection,
  type ReportCountHistoryEntry,
  type ReportPropertyContext,
  type ReportRoundEvidence,
} from "./reportSchema";

/**
 * PRIORITY A4/A5 — derives a `Report` from AUTHORITATIVE investigation data.
 * Deliberately a pure function of its inputs (investigation, cardEvents,
 * property context) — no Dexie access, no React, no fabrication: every
 * field is either copied straight from the Investigation/CardEvent record,
 * computed via an EXISTING, already-tested analysis function
 * (calculateRoundCountSnapshot, computeApLikelihoodBySeat — both unchanged
 * by this file), or left genuinely blank for the operator/manager to fill
 * in later (executive summary, disposition).
 *
 * The `Investigation` type itself is intentionally UNTOUCHED by this whole
 * 1.5 track — see docs/EYEONPIT_1_5_REPORTING.md's "Why Investigation
 * Wasn't Modified" section. A Report is its own separate, versioned,
 * persisted record that REFERENCES an investigation by `localId`, rather
 * than new fields bolted onto the already-heavily-tested Investigation
 * schema. This is what "Report data must be derived from authoritative
 * investigation data whenever possible" (Priority A4) means in practice:
 * derived at generation time, not stored redundantly on the investigation.
 */

export interface BuildReportOptions {
  investigation: Investigation;
  cardEvents: CardEvent[];
  property?: PropertyMetadata;
  /** Session-specific context A2 requires that has no home on Investigation/PropertyMetadata — see ReportPropertyContext's own doc comment. */
  tableIdentifier?: string;
  shift?: string;
  investigatorName?: string;
  externalIncidentNumber?: string;
  propertyNotes?: string;
}

function buildPropertyContext(opts: BuildReportOptions): ReportPropertyContext {
  const p = opts.property;
  // Falls back to the investigation's own `casino` field (already captured
  // at investigation creation, per types/investigation.ts) when no
  // PropertyMetadata record has been configured yet — real, already-
  // recorded data beats a generic placeholder whenever it's available,
  // consistent with this whole module's "derive from authoritative data,
  // never fabricate" rule.
  const fallbackName = opts.investigation.casino.trim() || "Unspecified property";
  return {
    propertyCode: p?.code ?? "UNKNOWN",
    propertyName: p?.name ?? fallbackName,
    city: p?.city,
    state: p?.state,
    country: p?.country,
    tableIdentifier: opts.tableIdentifier ?? opts.investigation.tableNumber,
    shift: opts.shift,
    investigatorName: opts.investigatorName ?? opts.investigation.operatorName,
    externalIncidentNumber: opts.externalIncidentNumber,
    notes: opts.propertyNotes,
  };
}

function buildCountHistory(investigation: Investigation, cardEvents: CardEvent[]): ReportCountHistoryEntry[] {
  const rounds = [...investigation.rounds].sort((a, b) => a.shoeNumber - b.shoeNumber || a.roundNumber - b.roundNumber);
  return rounds.map((round) => {
    const snapshot = calculateRoundCountSnapshot(investigation, cardEvents, round);
    const primary = snapshot[investigation.countingSystem];
    return {
      shoeNumber: round.shoeNumber,
      roundNumber: round.roundNumber,
      runningCount: primary.running,
      trueCount: primary.trueCount,
    };
  });
}

function buildRoundEvidence(investigation: Investigation): ReportRoundEvidence[] {
  return [...investigation.rounds]
    .sort((a, b) => a.shoeNumber - b.shoeNumber || a.roundNumber - b.roundNumber)
    .map((round) => {
      const dealerCards = dealerVisibleCards(round.dealerHand);
      const total = computeHandTotal(dealerCards);
      return {
        roundNumber: round.roundNumber,
        shoeNumber: round.shoeNumber,
        dealerCards: dealerCards.map(formatCard),
        dealerTotal: total.value,
        dealerResult: deriveDealerResult(round.dealerHand.cards),
        seats: Object.values(round.seats)
          .filter((seat): seat is NonNullable<typeof seat> => seat != null)
          .map((seat) => ({
            seatNumber: seat.seatNumber,
            betAmount: seat.betAmount ?? null,
            cards: seat.playerCards.map(formatCard),
            outcome: seat.outcome ?? null,
          })),
      };
    });
}

/**
 * PRIORITY A5/S1 — only ever returns a populated section when at least one
 * sub-field has REAL data; returns `undefined` (the whole section omitted)
 * when nothing validated exists yet, per ReportAnalysisSection's own doc
 * comment. `computeApLikelihoodBySeat` is the EXISTING, already-implemented
 * AP-correlation function (lib/analysis/apLikelihood.ts) — this does not
 * reimplement or change it, only reads its output per shoe and folds every
 * shoe's results together, keeping the seat with the largest sample size
 * per seat number (a later shoe's correlation for the same seat/player
 * generally has more data than an earlier one to have started tracking).
 */
function buildAnalysisSection(investigation: Investigation, cardEvents: CardEvent[]): ReportAnalysisSection | undefined {
  const shoeNumbers = Array.from(new Set(investigation.rounds.map((r) => r.shoeNumber)));
  const bestBySeat = new Map<number, { correlation: number; sampleSize: number; level: "low" | "moderate" | "elevated" }>();

  for (const shoeNumber of shoeNumbers) {
    const bySeat = computeApLikelihoodBySeat(investigation, cardEvents, shoeNumber);
    for (const [seatKey, result] of Object.entries(bySeat)) {
      const seatNumber = Number(seatKey);
      if (result.sampleSize === 0) continue;
      const existing = bestBySeat.get(seatNumber);
      if (!existing || result.sampleSize > existing.sampleSize) {
        bestBySeat.set(seatNumber, { correlation: result.correlation, sampleSize: result.sampleSize, level: result.level });
      }
    }
  }

  if (bestBySeat.size === 0) return undefined;

  return {
    betCountCorrelationBySeat: Array.from(bestBySeat.entries())
      .map(([seatNumber, r]) => ({ seatNumber, ...r }))
      .sort((a, b) => a.seatNumber - b.seatNumber),
  };
}

/**
 * Builds a fresh, unsaved Report from an investigation's current state.
 * Always `status: "draft"` — persisting it (and, separately, ever moving it
 * to "final") is the caller's/repository's responsibility, never implied by
 * generation alone.
 */
export function buildReportFromInvestigation(opts: BuildReportOptions): Report {
  const { investigation, cardEvents } = opts;
  const now = new Date().toISOString();
  const humanId = generateHumanReadableId(opts.property?.code ?? "UNKNOWN", investigation.investigationDate);

  const startedAt = investigation.createdAt;
  const endedAt = investigation.status === "closed" ? investigation.updatedAt : null;
  const durationMs = endedAt ? new Date(endedAt).getTime() - new Date(startedAt).getTime() : null;

  const record: VersionedRecord = {
    id: generateCanonicalId(),
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  return {
    ...record,
    humanId,
    investigationId: investigation.localId,
    status: "draft",
    property: buildPropertyContext(opts),
    gameConfig: {
      gameType: investigation.gameType,
      blackjackFormat: investigation.blackjackFormat,
      countingSystem: investigation.countingSystem,
      shoeTotalDecks: investigation.shoeTotalDecks,
    },
    timing: {
      investigationDate: investigation.investigationDate,
      startedAt,
      endedAt,
      durationMs,
      pausedDurationMs: investigation.pausedDurationMs,
    },
    observedPlay: {
      shoesObserved: new Set(investigation.rounds.map((r) => r.shoeNumber)).size,
      handsObserved: investigation.rounds.length,
      countHistory: buildCountHistory(investigation, cardEvents),
      // Significant events are operator-curated (Priority A4's "significant
      // events" is distinct from the exhaustive round-by-round list below)
      // — this builder never invents one; a caller/UI adds them explicitly.
      // See docs/EYEONPIT_1_5_REPORTING.md for the planned curation UI.
      significantEvents: [],
      roundEvidence: buildRoundEvidence(investigation),
    },
    // Player profiles are operator-curated (Priority A3 — see
    // ObservedPlayerProfile's own doc comment): this builder never invents
    // physical descriptions or reference labels from ledger data alone.
    players: [],
    narrative: {
      executiveSummary: investigation.executiveSummary,
      surveillanceMemo: investigation.surveillanceMemo,
      operatorNotes: investigation.operatorNotes.map((n) => ({ timestamp: n.timestamp, text: n.text })),
    },
    analysis: buildAnalysisSection(investigation, cardEvents),
    disposition: {},
    versionInfo: {
      reportSchemaVersion: REPORT_SCHEMA_VERSION,
      applicationVersion: typeof process !== "undefined" ? (process.env.NEXT_PUBLIC_BUILD_ID ?? "local") : "local",
      countingEngineVersion: ENGINE_VERSIONS.countingEngine,
      investigationId: investigation.localId,
      investigationDisplayId: investigation.displayId,
      analyticsVersions: [],
      generatedAt: now,
    },
  };
}

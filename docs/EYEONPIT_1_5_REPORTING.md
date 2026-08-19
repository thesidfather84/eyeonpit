# EyeOnPit 1.5 — Advanced Reporting Architecture

**Status: foundation built, pending review.** This document describes the
Investigation ID, property metadata, Report schema, report preview, export,
and AI-narrative-assist architecture built for EyeOnPit 1.5. It is an
engineering reference, not a product pitch — see
`docs/EYEONPIT_PRODUCT_SPEC.md` §16 for the product-level requirement this
satisfies, and the [Implementation Status Matrix](EYEONPIT_PRODUCT_SPEC.md#implementation-status-matrix)
for what's actually shipped versus still planned.

This architecture is explicitly designed so that **1.6 Blackjack Gold
Standard analytics can flow into these same reports without a structural
rewrite** — see `docs/EYEONPIT_1_6_ARCHITECTURE.md` and "How 1.6 connects"
below. Do not build a new, parallel report data model for future analytics
sections; extend `Report`/`ReportAnalysisSection` instead.

---

## 1. Design principles carried through every piece of this architecture

- **Derived, not duplicated.** A `Report` is built *from* an `Investigation`
  and its `CardEvent` ledger — it never becomes a second place count/round
  data lives. See `buildReportFromInvestigation`.
- **No fabrication.** A report never shows an analytics section it can't
  back with real computed data. Missing analysis renders as "Not available
  for this investigation," never a blank space and never invented numbers.
- **No unnecessary player PII.** No player names, loyalty-card numbers, or
  government IDs are ever persisted — see §3.
- **Every export is traceable.** Report schema version, application
  version, counting-engine version, and the investigation's own display ID
  are stamped on every report and carried into every export format.
- **The investigation record itself is never modified by any of this.**
  `Report` and `PropertyMetadata` are additive Dexie tables that reference
  an investigation only by its `localId` string — see §7's schema note on
  why this was a deliberate architectural choice, not an oversight.

## 2. Investigation ID architecture (Priority A1)

Two IDs exist for every investigation-derived record from this point
forward, both defined in `src/lib/versioning/id.ts`:

- **Canonical ID** — `generateCanonicalId()`, a standard v4 UUID. Globally
  collision-resistant by construction, used as every new table's Dexie
  primary key (`id`). Never shown to an operator.
- **Human-readable ID** — `generateHumanReadableId(propertyCode, isoDate)`,
  format `PROPERTY-YYYYMMDD-XXXXXX` (e.g. `HOLLYMS-20260819-4F2A9C`), where
  the six-character suffix is drawn from `crypto.getRandomValues`. This is
  what appears on a report, in an export filename, and in any future
  cross-property reference.

**Not relied upon for global uniqueness today.** The human-readable ID is
structured — property-code prefix, date, random suffix — specifically so
that a **future global property registry** (out of scope for this patch)
could later enforce true cross-property uniqueness without changing the ID
*format*, only how/where it's validated. `validatePropertyCode` already
enforces the `[A-Z0-9]{2,10}` shape a registry would need. Until that
registry exists, uniqueness is collision-resistant (36^6 combinations per
property per day) but not formally guaranteed — this is documented, not
hidden.

## 3. Property metadata & the Player Identity Privacy Rule (Priorities A2, A3)

`src/lib/reporting/propertyMetadata.ts` defines `PropertyMetadata`:
property code, name, city/state/country, and notes — **property-level**
facts that don't change investigation to investigation. Session-specific
facts (table, shift, investigator, external incident number) deliberately
live on `Report` itself, not here — see that file's own doc comment for
the reasoning.

**Player Identity Privacy Rule.** `ObservedPlayerProfile` in
`reportSchema.ts` has exactly three optional fields: `seatNumbers`,
`physicalDescription`, and a single `temporaryReportOnlyNote`. There is no
name field, no loyalty-card field, no government-ID field anywhere in this
schema, and none should be added without a deliberate, separate product
decision — this is a privacy boundary, not an oversight. Any future
player-identity capability must be:

- optional,
- clearly temporary (not a persistent searchable identity store),
- excluded from any future cross-investigation player search, and
- designed from day one for enterprise permissions/audit controls before
  it ships.

Persistent player identity/search remains explicitly **deferred** — not
started, not scaffolded beyond the single free-text field above.

## 4. Report data model (Priority A4)

`src/lib/reporting/reportSchema.ts` — `REPORT_SCHEMA_VERSION = 2` (bumped
from 1 in EyeOnPit 1.7 when `ReportAnalysisSection` gained its player-
analytics fields — see §9).
`Report extends VersionedRecord` and is composed of typed sub-sections:

| Section | Contents |
|---|---|
| `property: ReportPropertyContext` | property code/name, table, shift, investigator, external incident # |
| `gameConfig: ReportGameConfig` | blackjack format, counting system, shoe deck count |
| `timing: ReportTiming` | investigation date, start/end, duration |
| `observedPlay: ReportObservedPlay` | shoes/hands observed, significant events, round evidence, count history |
| `narrative: ReportNarrative` | executive summary, surveillance memo, verbatim operator notes |
| `analysis?: ReportAnalysisSection` | **only present when real data backs it** — see §6 |
| `disposition: ReportDisposition` | outcome, management notes |
| `versionInfo: ReportVersionInfo` | see §8 |
| `aiAssist?: ReportAiAssistMetadata` | see §5 |

Every field here is either a direct copy of investigation/CardEvent data or
a pure function of it — `buildReportFromInvestigation` in
`reportBuilder.ts` is the single place that does this derivation. This
schema is designed to hold every future 1.6 analytics field without a
structural rewrite (see §6) — extending it is adding an optional field to
`ReportAnalysisSection`, not redesigning `Report`.

## 5. Report preview (Priority A5)

`src/components/report/ReportPreview.tsx`, reached from
`ReportScreen.tsx`'s "Preview / Export Report" link at
`/investigations/[id]/report-preview`. Every section is explicitly labeled
**OBSERVED FACT**, **NARRATIVE**, or **DERIVED ANALYSIS** — a reader never
has to guess which category a number belongs to. An analysis section with
no backing data renders "Not available for this investigation," matching
`reportSchema.ts`'s own no-fabrication rule exactly — the UI cannot show
something the data model doesn't have.

## 6. AI-assisted narrative (Priority A7)

`src/lib/reporting/reportNarrative.ts` — `generateNarrativeDraft(report,
provider?)`. The shipped `deterministicDraftProvider` is **not an LLM
call**: it assembles factual sentences purely from fields already present
on `Report` (property, table, date, shoes/hands counted, duration, counting
system, running-count range, any elevated bet/count correlation seats,
operator-note count), and always appends an explicit "review and edit"
reminder. `ReportAiAssistMetadata.reviewedByOperator` is always `false` at
generation time — nothing marks a draft as reviewed except an operator
actually doing so (that UI wiring is not yet built; the data model already
supports it). The `NarrativeDraftProvider` interface exists specifically so
a real model-backed provider could be substituted later **without**
changing `Report`'s shape — it would still only ever be allowed to
summarize fields that are already there, never invent new observations,
player behavior, count values, or timestamps (Priority A7's own rule).

## 7. Export foundation (Priority A6)

No PDF or DOCX library exists in `package.json`, and none was added
unilaterally. Two dependency-free export paths instead:

- **PDF** — `window.print()` on the Report Preview screen, styled by an
  inline `@media print` stylesheet (hides navigation chrome, forces a
  print-safe palette). Every modern browser's own "Save as PDF" print
  target produces a real PDF from this — there is no separate PDF-writing
  code to maintain.
- **"Word" export** — `src/lib/reporting/exportRtf.ts`,
  `downloadReportRtf(report)`. RTF (Rich Text Format) is a plain-text,
  dependency-free format that Word, Google Docs, and Apple Pages all open
  natively. This is an honest scope decision, not a claim of a full OOXML
  `.docx` writer — if a real `.docx` writer is wanted later, it is new,
  separately-scoped work.

Both paths render the same OBSERVED FACT / NARRATIVE / DERIVED ANALYSIS
section labels as the on-screen preview, and both are legible at normal
print size — no fine print.

## 8. Version traceability (Priority A8)

Every `Report.versionInfo` (`ReportVersionInfo`) stamps:

- `reportSchemaVersion` — from `ENGINE_VERSIONS.reportSchema`
  (`src/lib/versioning/types.ts`)
- `applicationVersion`
- `countingEngineVersion` — from `ENGINE_VERSIONS.countingEngine`
- `investigationDisplayId` — the investigation's own ID
- `generatedAt` — an ISO timestamp at build time
- `countMethodVersion` / `simulationMethodologyRef` — optional, populated
  only once 1.6 analytics actually contribute to a report (see §9)

This block is rendered in the report footer and included in both export
formats, so a report printed or exported today remains traceable to
exactly the schema/engine versions that produced it even after those
versions change later.

## 9. How 1.6/1.7 connect (shared architecture, Priority S1)

`ReportAnalysisSection`'s original real field —
`betCountCorrelationBySeat`, computed by the existing (pre-1.6)
`computeApLikelihoodBySeat` — is `undefined`, not an empty object, when no
seat has enough sample data to compute a correlation. This is the pattern
every analytics field added since has followed:

- **UPDATE (EyeOnPit 1.7):** `ReportAnalysisSection` now also carries
  `counterAnalysisBySeat`, `bettingAnalysisBySeat`,
  `playingDeviationAnalysisBySeat`, `insuranceAnalysisBySeat`,
  `observationConfidenceBySeat`, and `methodology` — see
  `docs/EYEONPIT_1_7_COUNTER_DETECTION.md` §10. `REPORT_SCHEMA_VERSION`
  was bumped to 2 for this addition. Every one of these fields is
  populated **only** via the explicit `attachPlayerAnalytics` helper
  (`lib/player-analytics/reportIntegration.ts`) — never automatically by
  `buildReportFromInvestigation` — and is always accompanied by
  `methodology.validationStatus: "EXPERIMENTAL_NOT_VALIDATED"`, enforced
  structurally, not just by convention. The earlier caution below (not
  reserving a placeholder field ahead of a real engine) was honored right
  up until the engine actually existed and was tested — at which point
  adding the real, populated field became the correct move, not a
  violation of the original rule.
- `simulationMethodologyRef` remains omitted entirely until a real
  `SimulationResult` is explicitly linked to an investigation's
  methodology — not populated by any patch through 1.7.
- The Report Preview and both export paths render "not available" for
  `betCountCorrelationBySeat` when empty, but OMIT the newer 1.7 sections
  entirely when absent (rather than showing "not available" for a
  capability most reports will never invoke) — see
  `docs/EYEONPIT_1_7_COUNTER_DETECTION.md` §10 for the reasoning.

## 10. Deferred / not yet built

- Operator UI for editing/reviewing an AI-drafted narrative before export
  (the data model — `reviewedByOperator`, `draftText` — already supports
  it).
- A dedicated Property Metadata management screen (CRUD repository
  functions exist in `lib/db/repositories/reporting.ts`; no UI yet).
- A real `.docx` (OOXML) writer, if RTF's Word-compatibility is ever judged
  insufficient.
- Any 1.6-analytics-backed report section (see §9) — architecturally ready,
  not yet populated, because the underlying 1.6 analytics don't exist yet
  either.

Settings' "Reset all local data" (`resetAllData()` in
`lib/db/repositories/investigations.ts`) now also clears every 1.5/1.6
table — `properties`, `reports`, `countMethods`, `gameDefinitions`,
`simulationScenarios`, `simulationResults`, `researchEntries` — alongside
`investigations`, proven by `resetAllData.test.ts`. It deliberately still
does not clear `cardEvents`, which is pre-existing behavior unrelated to
the 1.5/1.6 architecture and out of scope for that fix.

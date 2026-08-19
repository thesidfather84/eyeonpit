/**
 * Shared versioning primitives for EyeOnPit 1.5 (Advanced Reporting) and 1.6
 * (Blackjack Gold Standard / Simulation Lab) — see docs/EYEONPIT_ROADMAP.md's
 * "Sequence" section and docs/EYEONPIT_1_6_ARCHITECTURE.md's "Version
 * Everything" principle. Every new versioned entity in either track (game
 * rules, count methods, betting/playing strategies, simulation scenarios,
 * the simulator itself, report schemas) uses these same shapes, so a report
 * or a simulation result can always name EXACTLY which version of EXACTLY
 * which definition produced it — never a silent "current" reference that
 * would quietly change meaning if the definition is edited later.
 *
 * Deliberately NOT semver parsing/comparison logic — every versioned entity
 * here is either author-edited (a count method, a game definition) or
 * generated once and frozen (a simulation result), never auto-bumped by a
 * build tool. `version` is a plain integer, incremented by whoever edits the
 * definition; `VersionedRecord` below is what makes "increment, don't
 * overwrite" structurally easy to do correctly.
 */

/** ISO-8601 timestamp string — used everywhere a version needs a "when," matching every other timestamp field already in this codebase (see types/investigation.ts). */
export type IsoTimestamp = string;

/**
 * The minimum shape every versioned definition (GameDefinition, CountMethod,
 * BettingStrategy, PlayingStrategy, SimulationScenario, Report, ...) carries.
 * `id` is the STABLE identity of "this definition, across all its versions"
 * — editing a method and bumping `version` keeps the same `id`; `id`
 * together with `version` is what a SimulationResult/Report actually
 * references, never `id` alone, so historical results stay meaningful even
 * after the live definition is edited again.
 */
export interface VersionedRecord {
  /** Stable identity across versions — never regenerated when `version` bumps. */
  id: string;
  /** Starts at 1. Incremented on every edit that changes computed output — see `nextVersion`. */
  version: number;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

/** A reference to one SPECIFIC version of a versioned definition — what SimulationResult/Report fields actually store, never a bare `id`. */
export interface VersionRef {
  id: string;
  version: number;
}

export function versionRef(record: VersionedRecord): VersionRef {
  return { id: record.id, version: record.version };
}

export function formatVersionRef(ref: VersionRef): string {
  return `${ref.id}@v${ref.version}`;
}

/**
 * Produces the next version number for an edit — never mutates the input.
 * Callers are responsible for actually persisting a NEW record (or a new
 * row in a version history) rather than overwriting the old one in place;
 * see each repository module's own doc comment for its specific policy
 * (some definitions are edit-in-place with a bumped `version` + unchanged
 * `id` since only the LATEST version of a mutable definition like a
 * CountMethod is ever simulated against; others, like SimulationResult, are
 * write-once and never versioned at all — they simply reference the
 * versions of everything ELSE that produced them).
 */
export function nextVersion(current: number): number {
  return current + 1;
}

/** Every app/engine component whose identity matters for traceability (voice reliability spec's Toku Voice Event ID work, and now report/simulation provenance) gets a short, stable version tag here — see docs/EYEONPIT_1_6_ARCHITECTURE.md and docs/EYEONPIT_1_5_REPORTING.md's "Report Version Traceability" sections. Bumped by hand when the corresponding engine's OUTPUT-AFFECTING behavior changes — never on every commit. */
export const ENGINE_VERSIONS = {
  /** src/lib/counting-engine — bump only if COUNT_TAGS, initialRunningCount, or true-count math changes. Untouched by 1.5/1.6 foundation work. */
  countingEngine: "1.0.0",
  /** src/lib/reporting/reportSchema.ts's Report shape itself — kept in sync with REPORT_SCHEMA_VERSION there by hand. */
  reportSchema: 2,
  /** src/lib/gold-standard's deterministic simulation engine (src/lib/gold-standard/simulation/engine.ts). */
  simulator: "0.1.0",
  /** src/lib/player-analytics — PlayerObservation extraction + analytics + Confidence Engine (EXPERIMENTAL / NOT VALIDATED, see docs/EYEONPIT_1_7_COUNTER_DETECTION.md). */
  playerAnalytics: "0.1.0",
} as const;

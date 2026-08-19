import type { VersionedRecord } from "@/lib/versioning/types";
import { generateCanonicalId } from "@/lib/versioning/id";
import type { Rank } from "@/lib/counting-engine/types";
import type { GameFamily } from "./game/gameFamily";

/**
 * PRIORITY B2/B12 — the versioned Count Method Registry. This file defines
 * the SHAPE only (types + pure validation/lookup helpers) — the four
 * currently-trusted systems (Hi-Lo/KO/Zen/Omega II) are wired in as
 * read-only adapters in countMethodAdapters.ts, which WRAPS
 * lib/counting-engine rather than reimplementing it (Priority B3 — see
 * that file's own doc comment). This file never imports from
 * lib/counting-engine directly, keeping the registry's own type surface
 * independent of the engine's internals.
 *
 * "Simple systems must eventually be addable without changing core engine
 * code" (Priority B2) is satisfied by `tags`: any single-level or
 * multi-level POINT-COUNT system (Hi-Lo, KO, Zen, Omega II, Red Seven,
 * Hi-Opt I/II, Wong Halves, KISS variants, ...) is fully describable as a
 * flat `Record<Rank, number>` — adding one is authoring a new
 * CountMethodDefinition row, never touching countMethodRegistry.ts,
 * countMethodAdapters.ts, or lib/counting-engine. A method whose logic
 * genuinely cannot be expressed as a flat tag table (a device-based
 * composition method, an advanced side-count-driven system) stays
 * RESEARCH_ONLY with `tags: null` until a real, reviewed implementation
 * exists — see Priority B4/B10's "do not invent any formulas."
 */

export type CountMethodVerificationStatus = "VERIFIED" | "RECONSTRUCTED" | "EXPERIMENTAL" | "RESEARCH_ONLY";

export const VERIFICATION_STATUS_DESCRIPTIONS: Record<CountMethodVerificationStatus, string> = {
  VERIFIED: "Matches a trusted, independently-checked implementation or published reference exactly.",
  RECONSTRUCTED: "Rebuilt from a published source without independent cross-verification yet — never labeled VERIFIED.",
  EXPERIMENTAL: "A working implementation whose correctness is still under review.",
  RESEARCH_ONLY: "Documented for reference only — no working implementation exists yet; never simulatable.",
};

export type TrueCountMethod = "level-division" | "unbalanced-running-only" | "none" | "custom";
export type AceHandling = "primary-tag" | "side-count" | "excluded" | "custom";

/** PRIORITY 1.8-7 — what KIND of calculation a method performs, not just which game it's for. "Do not assume every method belongs to blackjack forever." */
export type MethodKind = "running-count" | "side-count" | "exact-composition" | "side-bet-count" | "effect-of-removal" | "custom-research";

export interface CountMethodDefinition extends VersionedRecord {
  /** Stable, human-chosen slug ("hi-lo", "wong-halves") — distinct from `id` (the opaque canonical uuid): this is what a user/report/scenario names the method BY, `id` is only the DB primary key. */
  canonicalId: string;
  displayName: string;
  authorSource?: string;
  verificationStatus: CountMethodVerificationStatus;
  balanced: boolean;
  /** Flat rank->tag lookup — see this file's own doc comment. `null` only for RESEARCH_ONLY methods with no working implementation. */
  tags: Partial<Record<Rank, number>> | null;
  startingCountNote?: string;
  trueCountMethod: TrueCountMethod;
  aceHandling: AceHandling;
  sideCounts: string[];
  insuranceLogicNote?: string;
  /** Published metrics where a real source states them — never computed/invented by this registry. Omitted when unknown. */
  bettingCorrelation?: number;
  playingEfficiency?: number;
  insuranceCorrelation?: number;
  notes?: string;
  sourceReferences: string[];
  /** True ONLY for the four built-in adapters (see countMethodAdapters.ts) — never settable by user-added methods, and never persisted to the `countMethods` Dexie table (built-ins are code constants, not DB rows). */
  isBuiltInAdapter: boolean;

  // ---- PRIORITY 1.8-7/8 — generic method framework (all optional, purely additive) ----
  /** Which GameFamily/families this method is valid for — undeclared (undefined) is NOT the same as "blackjack assumed"; see gameMethodCompatibility.ts's own doc comment on why an undeclared method is treated as NOT verified-compatible with anything. */
  supportedGameFamilies?: GameFamily[];
  /** What kind of calculation this is — running counts aren't the only thing a "count method" can mean; see MethodKind's own doc comment. */
  methodKind?: MethodKind;
}

export type CreateCountMethodInput = Omit<CountMethodDefinition, keyof VersionedRecord | "isBuiltInAdapter">;

export type CountMethodValidation = { valid: true } | { valid: false; errors: string[] };

const CANONICAL_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Pure validation — Priority B12's safety rule ("never label a reconstructed system as verified") is enforced structurally here: RECONSTRUCTED/EXPERIMENTAL/RESEARCH_ONLY methods without a source reference are flagged, since an unverifiable claim of correctness is exactly the risk that status exists to prevent. */
export function validateCountMethodInput(input: CreateCountMethodInput): CountMethodValidation {
  const errors: string[] = [];
  if (!CANONICAL_ID_RE.test(input.canonicalId)) {
    errors.push("canonicalId must be lowercase kebab-case (e.g. 'wong-halves').");
  }
  if (!input.displayName.trim()) errors.push("Display name is required.");
  if (input.verificationStatus === "RESEARCH_ONLY" && input.tags != null) {
    errors.push("RESEARCH_ONLY methods must not have a tags table — that would imply a working implementation exists.");
  }
  if (input.verificationStatus !== "RESEARCH_ONLY" && input.tags == null) {
    errors.push("A method must have a tags table unless it is RESEARCH_ONLY.");
  }
  if (input.verificationStatus !== "VERIFIED" && input.sourceReferences.length === 0) {
    errors.push("Non-VERIFIED methods must cite at least one source reference — see Priority B12.");
  }
  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}

export function buildCountMethodDefinition(input: CreateCountMethodInput): CountMethodDefinition {
  const validation = validateCountMethodInput(input);
  if (!validation.valid) throw new Error(`Invalid count method: ${validation.errors.join(" ")}`);
  const now = new Date().toISOString();
  return { ...input, id: generateCanonicalId(), version: 1, createdAt: now, updatedAt: now, isBuiltInAdapter: false };
}

/**
 * Computes a running count for ANY tag-table-based method (built-in or
 * custom) over an ordered rank sequence — the one generic calculation the
 * registry provides so "addable without changing core engine code" is
 * actually true. Returns `null` for a method with no `tags` table
 * (RESEARCH_ONLY) rather than guessing. Deliberately separate from, and
 * NEVER used in place of, lib/counting-engine's own
 * `calculateCountSnapshot` for the four trusted built-in systems — see
 * countMethodAdapters.ts's own doc comment for why those four always route
 * through the real engine instead of this generic path.
 */
export function computeRunningCountForMethod(method: CountMethodDefinition, ranks: Rank[]): number | null {
  if (!method.tags) return null;
  let running = 0;
  for (const rank of ranks) {
    running += method.tags[rank] ?? 0;
  }
  return running;
}

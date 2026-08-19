import { COUNT_TAGS, isBalancedSystem } from "@/lib/counting-engine/countTags";
import type { CountingSystem, Rank } from "@/lib/counting-engine/types";
import type { CountMethodDefinition } from "./countMethodRegistry";

/**
 * PRIORITY B3 — adapters wrapping the four EXISTING, trusted counting
 * systems into the Count Method Registry shape. This file WRAPS
 * lib/counting-engine — it never reimplements, recomputes, or hand-copies
 * its tag values: every adapter's `tags` field is built by iterating the
 * real, live `COUNT_TAGS` export and copying its values through
 * (`{ ...COUNT_TAGS[system] }`), so if the engine's own table ever
 * legitimately changes, these adapters automatically reflect the SAME
 * values rather than silently drifting out of sync with a second hardcoded
 * copy. lib/counting-engine itself is completely untouched by this file —
 * see countMethodAdapters.test.ts for the regression proof that these
 * adapters' tag tables are byte-identical to the engine's own, for every
 * rank, for all four systems.
 *
 * These four are the ONLY entries with `isBuiltInAdapter: true` and are
 * never persisted to the `countMethods` Dexie table — they're exported here
 * as plain constants and merged into the registry's lookup at read time
 * (see countMethodRegistryLookup.ts), so there is no "edit Hi-Lo" UI path
 * and no risk of a user-editable copy silently diverging from the engine.
 */

const now = "2026-01-01T00:00:00.000Z"; // stable, deterministic — these are code constants, not user-created records with a meaningful creation time.

function adapterFor(
  canonicalId: string,
  displayName: string,
  system: CountingSystem,
  extra: Partial<Pick<CountMethodDefinition, "authorSource" | "aceHandling" | "bettingCorrelation" | "playingEfficiency" | "insuranceCorrelation" | "notes" | "sourceReferences">>
): CountMethodDefinition {
  return {
    id: `builtin-${canonicalId}`,
    version: 1,
    createdAt: now,
    updatedAt: now,
    canonicalId,
    displayName,
    verificationStatus: "VERIFIED",
    balanced: isBalancedSystem(system),
    tags: { ...COUNT_TAGS[system] } as Partial<Record<Rank, number>>,
    startingCountNote:
      system === "KO" ? "Unbalanced — see initialRunningCount() in lib/counting-engine/countTags.ts (-4 x (decks - 1))." : "Balanced — starts at 0.",
    trueCountMethod: isBalancedSystem(system) ? "level-division" : "unbalanced-running-only",
    sideCounts: [],
    isBuiltInAdapter: true,
    supportedGameFamilies: ["blackjack"],
    methodKind: "running-count",
    sourceReferences: extra.sourceReferences ?? [],
    authorSource: extra.authorSource,
    aceHandling: extra.aceHandling ?? "primary-tag",
    bettingCorrelation: extra.bettingCorrelation,
    playingEfficiency: extra.playingEfficiency,
    insuranceCorrelation: extra.insuranceCorrelation,
    notes: extra.notes,
  };
}

export const BUILT_IN_COUNT_METHODS: Record<string, CountMethodDefinition> = {
  "hi-lo": adapterFor("hi-lo", "Hi-Lo", "Hi-Lo", {
    authorSource: "Harvey Dubner",
    aceHandling: "primary-tag",
    bettingCorrelation: 0.97,
    playingEfficiency: 0.51,
    insuranceCorrelation: 0.76,
    sourceReferences: ["docs/counting-systems.md"],
  }),
  ko: adapterFor("ko", "Knock-Out (KO)", "KO", {
    authorSource: "Olaf Vancura & Ken Fuchs",
    aceHandling: "primary-tag",
    bettingCorrelation: 0.98,
    playingEfficiency: 0.55,
    insuranceCorrelation: 0.78,
    notes: "Unbalanced — running count only, no true-count division. See initialRunningCount().",
    sourceReferences: ["docs/counting-systems.md"],
  }),
  zen: adapterFor("zen", "Zen Count", "Zen", {
    authorSource: "Arnold Snyder",
    aceHandling: "primary-tag",
    bettingCorrelation: 0.96,
    playingEfficiency: 0.63,
    insuranceCorrelation: 0.85,
    sourceReferences: ["docs/counting-systems.md"],
  }),
  "omega-ii": adapterFor("omega-ii", "Omega II", "Omega II", {
    authorSource: "Bryce Carlson",
    aceHandling: "excluded",
    bettingCorrelation: 0.92,
    playingEfficiency: 0.67,
    insuranceCorrelation: 0.85,
    notes: "Ace carries tag 0 — excluded from the primary running count; a serious player pairs this with a separate ace side count.",
    sourceReferences: ["docs/counting-systems.md"],
  }),
};

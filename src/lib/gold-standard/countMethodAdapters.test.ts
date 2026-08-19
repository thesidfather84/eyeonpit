import { describe, expect, it } from "vitest";
import { COUNT_TAGS, isBalancedSystem } from "@/lib/counting-engine/countTags";
import { calculateCountSnapshot } from "@/lib/counting-engine/calculateCounts";
import { createCardEvent } from "@/lib/counting-engine/ledger";
import type { CountingSystem, Rank } from "@/lib/counting-engine/types";
import { BUILT_IN_COUNT_METHODS } from "./countMethodAdapters";
import { computeRunningCountForMethod, validateCountMethodInput } from "./countMethodRegistry";

const SYSTEM_BY_CANONICAL_ID: Record<string, CountingSystem> = {
  "hi-lo": "Hi-Lo",
  ko: "KO",
  zen: "Zen",
  "omega-ii": "Omega II",
};

const ALL_RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

describe("PRIORITY B3 — built-in adapters are byte-identical to the trusted engine, never a second hand-copied table", () => {
  it.each(Object.entries(SYSTEM_BY_CANONICAL_ID))("adapter '%s' tag table matches COUNT_TAGS['%s'] for every rank", (canonicalId, system) => {
    const adapter = BUILT_IN_COUNT_METHODS[canonicalId];
    for (const rank of ALL_RANKS) {
      expect(adapter.tags?.[rank]).toBe(COUNT_TAGS[system][rank]);
    }
  });

  it.each(Object.entries(SYSTEM_BY_CANONICAL_ID))("adapter '%s' balanced flag matches isBalancedSystem('%s')", (canonicalId, system) => {
    expect(BUILT_IN_COUNT_METHODS[canonicalId].balanced).toBe(isBalancedSystem(system));
  });

  it("every built-in adapter is marked VERIFIED and isBuiltInAdapter", () => {
    for (const method of Object.values(BUILT_IN_COUNT_METHODS)) {
      expect(method.verificationStatus).toBe("VERIFIED");
      expect(method.isBuiltInAdapter).toBe(true);
    }
  });

  it.each(Object.entries(SYSTEM_BY_CANONICAL_ID))(
    "computeRunningCountForMethod('%s', ranks) matches calculateCountSnapshot's running count for the SAME card sequence",
    (canonicalId, system) => {
      const ranks: Rank[] = ["K", "5", "A", "6", "10", "3", "7", "Q"];
      const events: ReturnType<typeof createCardEvent>[] = [];
      for (const rank of ranks) {
        events.push(createCardEvent({ investigationId: "inv-1", shoeNumber: 1, roundId: "round-1", targetType: "dealer", targetId: "dealer", rank }, events));
      }
      const engineSnapshot = calculateCountSnapshot(events, 6);
      const adapter = BUILT_IN_COUNT_METHODS[canonicalId];
      const registryRunning = computeRunningCountForMethod(adapter, ranks);

      // For a balanced system the engine seeds at 0, so the two running
      // counts must match exactly. KO seeds at a non-zero initial value
      // (initialRunningCount) that the generic registry helper —
      // deliberately — knows nothing about (see computeRunningCountForMethod's
      // own doc comment: it's a GENERIC per-card summation, not a
      // system-specific starting-value engine), so KO's comparison accounts
      // for that documented, expected offset instead of asserting a false
      // equality.
      if (system === "KO") {
        const koSeed = -4 * (6 - 1);
        expect(registryRunning).toBe(engineSnapshot.KO.running - koSeed);
      } else {
        expect(registryRunning).toBe(engineSnapshot[system].running);
      }
    }
  );
});

describe("validateCountMethodInput — Priority B12 safety rules", () => {
  it("rejects a RESEARCH_ONLY method that has a tags table (would imply a working implementation)", () => {
    const result = validateCountMethodInput({
      canonicalId: "future-system",
      displayName: "Future System",
      verificationStatus: "RESEARCH_ONLY",
      balanced: true,
      tags: { A: -1 },
      trueCountMethod: "custom",
      aceHandling: "custom",
      sideCounts: [],
      sourceReferences: ["some paper"],
    });
    expect(result.valid).toBe(false);
  });

  it("rejects a non-RESEARCH_ONLY method with no tags table", () => {
    const result = validateCountMethodInput({
      canonicalId: "half-baked",
      displayName: "Half Baked",
      verificationStatus: "EXPERIMENTAL",
      balanced: true,
      tags: null,
      trueCountMethod: "level-division",
      aceHandling: "primary-tag",
      sideCounts: [],
      sourceReferences: ["a forum post"],
    });
    expect(result.valid).toBe(false);
  });

  it("rejects a RECONSTRUCTED/EXPERIMENTAL/RESEARCH_ONLY method with no source reference — never labeled trustworthy without a citation", () => {
    const result = validateCountMethodInput({
      canonicalId: "unsourced",
      displayName: "Unsourced",
      verificationStatus: "RECONSTRUCTED",
      balanced: true,
      tags: { A: -1 },
      trueCountMethod: "level-division",
      aceHandling: "primary-tag",
      sideCounts: [],
      sourceReferences: [],
    });
    expect(result.valid).toBe(false);
  });

  it("accepts a well-formed EXPERIMENTAL method with a source and tags", () => {
    const result = validateCountMethodInput({
      canonicalId: "red-seven",
      displayName: "Red Seven",
      verificationStatus: "EXPERIMENTAL",
      balanced: false,
      tags: { A: -1, "2": 1, "3": 1, "4": 1, "5": 1, "6": 1, "7": 1, "8": 0, "9": 0, "10": -1, J: -1, Q: -1, K: -1 },
      trueCountMethod: "unbalanced-running-only",
      aceHandling: "primary-tag",
      sideCounts: [],
      sourceReferences: ["Snyder, Blackbelt in Blackjack"],
    });
    expect(result.valid).toBe(true);
  });

  it("rejects a non-kebab-case canonicalId", () => {
    const result = validateCountMethodInput({
      canonicalId: "Hi Lo!",
      displayName: "Hi-Lo",
      verificationStatus: "VERIFIED",
      balanced: true,
      tags: { A: -1 },
      trueCountMethod: "level-division",
      aceHandling: "primary-tag",
      sideCounts: [],
      sourceReferences: [],
    });
    expect(result.valid).toBe(false);
  });
});

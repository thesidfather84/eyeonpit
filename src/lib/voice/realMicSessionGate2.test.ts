// @vitest-environment node
//
// PC VOICE FIELD TEST #2 — REAL MIC GATE #2 findings, captured 2026-08-19
// during a second live Chrome verification round. Six items were verified
// as PASSING (Taylor multi-card recovery, "Spot 3 hits gets a 4", "play or
// sat down at spot 6", "Next hand", "3:55" rejection, "Spotify is dead"
// rejection) — those are already covered by fieldTest2Regression.test.ts
// and realMicSession20260819.test.ts and are re-asserted in the "preserve"
// block below. Two NEW parser-safety bugs were found in this round; every
// other block pins the fix for one of them.
import { describe, expect, it } from "vitest";
import { parseNarration } from "./parseNarration";
import { parseTableChangeCommand } from "./parseTableChangeCommand";
import { classifyVoiceTranscript } from "./classifyVoiceTranscript";
import { resolveAlternatives } from "./nBestResolver";

describe("Real mic Gate #2 — item 1: unscoped multi-card must never hijack the leading-shorthand rule", () => {
  it('the exact captured bug — "has a 5 and a 3" with DEALER active must REJECT (no player target was ever spoken)', () => {
    // DEALER active -> VoiceControl now passes allowUnscopedContinuation:
    // false, exactly mirrored here.
    const result = parseNarration("has a 5 and a 3", { allowUnscopedContinuation: false });
    expect(result.kind).toBe("reject");
    const classification = classifyVoiceTranscript("has a 5 and a 3");
    expect(classification.valid).toBe(false);
  });

  it('the SAME transcript with a Spot already active commits BOTH cards to that spot, unscoped (hasExplicitTarget must be FALSE)', () => {
    const result = parseNarration("has a 5 and a 3", { allowUnscopedContinuation: true });
    expect(result.kind).toBe("ops");
    expect(result.kind === "ops" && result.ops).toEqual([
      { kind: "card", rank: "5" },
      { kind: "card", rank: "3" },
    ]);
    // The real captured bug reported hasExplicitTarget: true and
    // activeTargetAfter: SEAT5 — neither "5" was ever a target, both are
    // unscoped cards resolving against whatever's live-active.
    const classification = classifyVoiceTranscript("has a 5 and a 3", false, true);
    expect(classification.valid).toBe(true);
    expect(classification.valid && classification.hasExplicitTarget).toBe(false);
  });

  it('the ORIGINAL leading-shorthand case ("three has a ten," truly at the start of the utterance) is completely unaffected', () => {
    const result = parseNarration("three has a ten");
    expect(result.kind).toBe("ops");
    expect(result.kind === "ops" && result.ops).toEqual([
      { kind: "selectTarget", target: { kind: "seat", seat: 3 } },
      { kind: "card", target: { kind: "seat", seat: 3 }, rank: "10" },
    ]);
  });

  it('a shorthand number appearing after a workflow boundary ("done three has a ten") still opens Seat 3 — a workflow reset is ALSO a legitimate clause start', () => {
    const result = parseNarration("done three has a ten");
    expect(result.kind).toBe("ops");
    expect(result.kind === "ops" && result.ops).toEqual([
      { kind: "workflow", action: "done" },
      { kind: "selectTarget", target: { kind: "seat", seat: 3 } },
      { kind: "card", target: { kind: "seat", seat: 3 }, rank: "10" },
    ]);
  });
});

describe("Real mic Gate #2 — item 2: dangling-connector narration must reject, never downgrade to bare target-select", () => {
  it('"player five" ALONE remains a valid bare target-selection', () => {
    const result = parseNarration("player five");
    expect(result.kind).toBe("no-opinion"); // trivial — legacy's own "player five" exact phrase handles it
    const classification = classifyVoiceTranscript("player five");
    expect(classification.valid).toBe(true);
    expect(classification.valid && classification.summary).toBe("SEAT5");
  });

  it.each(["player five has a", "spot five has an", "spot five gets a", "spot five hits gets a"])(
    '"%s" -> REJECT (incomplete narration), never a bare target-select, zero CardEvents',
    (transcript) => {
      const result = parseNarration(transcript);
      expect(result.kind).toBe("reject");
      const classification = classifyVoiceTranscript(transcript);
      expect(classification.valid).toBe(false);
    }
  );

  it('the exact captured N-best pattern (garbled "plair"/"playr" variants alongside the incomplete form) never resolves to SPOT 5', () => {
    const result = resolveAlternatives([
      { transcript: "player five has a", confidence: 0.7 },
      { transcript: "plair five has a", confidence: 0.65 },
      { transcript: "playr five has a", confidence: 0.6 },
    ]);
    expect(result.accepted).toBe(false);
  });

  it('"seat two stand" (a genuinely COMPLETE inert-action statement, no connector at all) remains valid — the fix only targets connector words, not inert action words', () => {
    const result = parseNarration("seat two stand");
    expect(result.kind).toBe("ops");
    expect(result.kind === "ops" && result.ops).toEqual([{ kind: "selectTarget", target: { kind: "seat", seat: 2 } }]);
  });

  it('a connector followed later by a real card is still accepted normally ("seat one has a five")', () => {
    const result = parseNarration("seat one has a five");
    expect(result.kind).toBe("no-opinion");
    const classification = classifyVoiceTranscript("seat one has a five");
    expect(classification.valid).toBe(true);
    expect(classification.valid && classification.summary).toBe("SEAT1:5");
  });
});

describe('Real mic Gate #2 — item 3: "___ that down at/on spot N" table-change recovery', () => {
  it.each([
    ["players that down at spot three", 3],
    ["players that down at spot 3", 3],
    ["playerz that down at spot 3", 3],
  ] as const)('the exact captured "%s" -> Spot %i sat down (seat-joins)', (transcript, seat) => {
    expect(parseTableChangeCommand(transcript)).toEqual({ kind: "seat-joins", seat });
  });

  it('a bare "that" NOT immediately before "down" is never globally treated as "sat" — fails closed', () => {
    expect(parseTableChangeCommand("player that spot three")).toBeNull();
    expect(parseTableChangeCommand("i think that spot three is open")).toBeNull();
  });

  it('the existing "player sat down at spot N" form is completely unaffected by adding "that" as an alternative', () => {
    expect(parseTableChangeCommand("player sat down at spot one")).toEqual({ kind: "seat-joins", seat: 1 });
  });
});

describe("Real mic Gate #2 — item 5: previously-verified fixes must not regress", () => {
  it('Taylor multi-card recovery — "Spotify has a five and a king" -> DEALER 5, K', () => {
    const classification = classifyVoiceTranscript("Spotify has a five and a king", true);
    expect(classification.valid).toBe(true);
    expect(classification.valid && classification.source).toBe("dealer-confusion-recovery");
  });

  it('"play or sat down at spot 6" -> Spot 6 sat down', () => {
    expect(parseTableChangeCommand("play or sat down at spot 6")).toEqual({ kind: "seat-joins", seat: 6 });
  });

  it('"spot 3 hits gets a 4" -> commits directly via narration (not legacy)', () => {
    const result = parseNarration("spot 3 hits gets a 4");
    expect(result.kind).toBe("ops");
    expect(result.kind === "ops" && result.ops).toEqual([
      { kind: "selectTarget", target: { kind: "seat", seat: 3 } },
      { kind: "card", target: { kind: "seat", seat: 3 }, rank: "4" },
    ]);
  });

  it('"3:55" and "Spotify is dead" still reject', () => {
    expect(classifyVoiceTranscript("3:55").valid).toBe(false);
    expect(classifyVoiceTranscript("Spotify is dead").valid).toBe(false);
  });

  it('"next hand" still accepts as Done', () => {
    const classification = classifyVoiceTranscript("next hand");
    expect(classification.valid).toBe(true);
    expect(classification.valid && classification.summary).toBe("DONE");
  });
});

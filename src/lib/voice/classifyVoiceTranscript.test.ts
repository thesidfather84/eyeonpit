import { describe, expect, it } from "vitest";
import { classifyVoiceTranscript, diagnoseNormalization, tryDealerConfusionRecovery } from "./classifyVoiceTranscript";

describe("classifyVoiceTranscript — pure per-alternative classification used by nBestResolver.ts", () => {
  it("classifies a blank transcript as EMPTY_TRANSCRIPT", () => {
    const c = classifyVoiceTranscript("   ");
    expect(c.valid).toBe(false);
    if (!c.valid) expect(c.code).toBe("EMPTY_TRANSCRIPT");
  });

  it("classifies unrelated speech as UNKNOWN_COMMAND", () => {
    const c = classifyVoiceTranscript("Spotify is dead");
    expect(c.valid).toBe(false);
    if (!c.valid) expect(c.code).toBe("UNKNOWN_COMMAND");
  });

  it("classifies uncertainty language as UNCERTAIN_LANGUAGE, not INCOMPLETE_NARRATION", () => {
    const c = classifyVoiceTranscript("maybe player one has a three");
    expect(c.valid).toBe(false);
    if (!c.valid) expect(c.code).toBe("UNCERTAIN_LANGUAGE");
  });

  it("classifies a valid dealer+card narration with an explicit target", () => {
    const c = classifyVoiceTranscript("dealer king");
    expect(c.valid).toBe(true);
    if (c.valid) {
      expect(c.hasExplicitTarget).toBe(true);
      expect(c.actionKey).toBe("C:DEALER:10");
    }
  });

  it("classifies a bare card with no target as valid but NOT explicit-target", () => {
    const c = classifyVoiceTranscript("king");
    expect(c.valid).toBe(true);
    if (c.valid) expect(c.hasExplicitTarget).toBe(false);
  });

  it("two different-but-equivalent phrasings of the same action produce the SAME actionKey (agreement detection)", () => {
    const a = classifyVoiceTranscript("dealer king");
    const b = classifyVoiceTranscript("dealer has a king");
    expect(a.valid && b.valid).toBe(true);
    if (a.valid && b.valid) expect(a.actionKey).toBe(b.actionKey);
  });

  it("classifies lifecycle phrases", () => {
    const c = classifyVoiceTranscript("new shoe");
    expect(c.valid).toBe(true);
    if (c.valid) expect(c.source).toBe("lifecycle");
  });

  it("classifies table-change phrases", () => {
    const c = classifyVoiceTranscript("spot six sat down");
    expect(c.valid).toBe(true);
    if (c.valid) expect(c.source).toBe("table-change");
  });

  it("classifies read-only queries", () => {
    const c = classifyVoiceTranscript("what is the count");
    expect(c.valid).toBe(true);
    if (c.valid) expect(c.source).toBe("read-only-query");
  });

  it("classifies note-start phrases", () => {
    const c = classifyVoiceTranscript("start note");
    expect(c.valid).toBe(true);
    if (c.valid) expect(c.source).toBe("note-start");
  });
});

describe("PC field test #1 — canonicalization (§1: the V-000006/V-000018 resolver bug)", () => {
  it('legacy-deferred "seat one has a five" and narration-only "the player in seat one has a five" canonicalize to the IDENTICAL actionKey', () => {
    const legacy = classifyVoiceTranscript("seat one has a five");
    const extended = classifyVoiceTranscript("the player in seat one has a five");
    expect(legacy.valid).toBe(true);
    expect(extended.valid).toBe(true);
    if (legacy.valid && extended.valid) {
      expect(legacy.source).toBe("legacy"); // narration deferred — this is the trivial 2-op shape
      expect(extended.source).toBe("narration"); // narration CANNOT defer this — legacy has no connector-phrase grammar
      expect(extended.actionKey).toBe(legacy.actionKey);
      expect(extended.summary).toBe(legacy.summary);
      expect(legacy.actionKey).toBe("C:SEAT1:5");
    }
  });

  it('"dealer king" (legacy) and "dealer has a king" (narration-deferred-to-legacy) already agreed before this fix, and still do', () => {
    const a = classifyVoiceTranscript("dealer king");
    const b = classifyVoiceTranscript("dealer has a king");
    expect(a.valid && b.valid).toBe(true);
    if (a.valid && b.valid) expect(a.actionKey).toBe(b.actionKey);
  });

  it("a multi-target narration's per-card canonical steps still key identically to the equivalent single-card legacy command for each target", () => {
    const multi = classifyVoiceTranscript("seat one has a seven seat three has a five dealer has a king");
    expect(multi.valid).toBe(true);
    if (multi.valid) {
      expect(multi.actionKey).toBe("C:SEAT1:7|C:SEAT3:5|C:DEALER:10");
    }
  });

  it("a bare target-only narration (no matching card) is NOT collapsed away — it stays its own distinct canonical step", () => {
    const c = classifyVoiceTranscript("seat three active");
    expect(c.valid).toBe(true);
    if (c.valid) expect(c.actionKey).toBe("T:SEAT3");
  });
});

describe("PC field test #1 — normalization rule diagnostics (§5)", () => {
  it("diagnoseNormalization reports the exact rule that fired", () => {
    const rules = diagnoseNormalization("set one has a 3");
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe("ASR_SEAT_PREFIX_VARIANT");
  });

  it("diagnoseNormalization reports nothing for a transcript with no ASR-artifact substitutions", () => {
    expect(diagnoseNormalization("dealer king")).toHaveLength(0);
  });

  it("classifyVoiceTranscript always attaches appliedRules, even for a rejection", () => {
    const c = classifyVoiceTranscript("set one has a 3");
    expect(c.appliedRules).toHaveLength(1);
    const rejected = classifyVoiceTranscript("Spotify is dead");
    expect(rejected.appliedRules).toEqual([]);
  });
});

describe("PC field test #1 — CONTEXTUAL DEALER-CONFUSION RECOVERY (§4 + PC headset ASR pattern finding)", () => {
  it.each([
    ["Taylor has a 10", "10", undefined],
    ["Taylor has an eight", "8", undefined],
    ["Spotify has an ace", "A", undefined],
    ["Spotify as a 3", "3", undefined],
  ])('"%s" recovers to DEALER:%s', (transcript, rank) => {
    const recovered = tryDealerConfusionRecovery(transcript);
    expect(recovered).not.toBeNull();
    expect(recovered?.valid).toBe(true);
    if (recovered?.valid) {
      expect(recovered.actionKey).toBe(`C:DEALER:${rank}`);
      expect(recovered.recoveryRuleId).toMatch(/^DEALER_ASR_(TAYLOR|SPOTIFY)$/);
    }
  });

  it('"Taylor has a king" specifically rescues to DEALER:10 with recoveryRuleId DEALER_ASR_TAYLOR', () => {
    const recovered = tryDealerConfusionRecovery("Taylor has a king");
    expect(recovered?.valid).toBe(true);
    if (recovered?.valid) {
      expect(recovered.actionKey).toBe("C:DEALER:10");
      expect(recovered.recoveryRuleId).toBe("DEALER_ASR_TAYLOR");
    }
  });

  it.each([
    "Spotify is dead",
    "deactivate Spotify",
    "Taylor called me",
    "Spotify five", // no connector — too unconstrained to guess at
  ])('"%s" MUST remain unrecovered', (transcript) => {
    expect(tryDealerConfusionRecovery(transcript)).toBeNull();
  });

  it("refuses to recover when an explicit OTHER target is also present — never guesses between two conflicting targets", () => {
    expect(tryDealerConfusionRecovery("Taylor seat three has a king")).toBeNull();
  });

  it("refuses to recover when two different ranks are present — not unambiguous", () => {
    expect(tryDealerConfusionRecovery("Taylor has a king and an ace")).toBeNull();
  });

  it("refuses to recover uncertainty language, even in an otherwise-recoverable shape", () => {
    expect(tryDealerConfusionRecovery("maybe Taylor has a king")).toBeNull();
  });

  it("recovery is OFF by default in classifyVoiceTranscript — ordinary classification never silently rescues", () => {
    const c = classifyVoiceTranscript("Taylor has a 10");
    expect(c.valid).toBe(false);
  });

  it("recovery is available via classifyVoiceTranscript's explicit opt-in flag", () => {
    const c = classifyVoiceTranscript("Taylor has a 10", true);
    expect(c.valid).toBe(true);
    if (c.valid) expect(c.source).toBe("dealer-confusion-recovery");
  });

  it("a genuine 'dealer' alternative is never displaced by recovery — recovery only ever applies to the confusion-token transcript itself", () => {
    const genuine = classifyVoiceTranscript("dealer has a king", true);
    expect(genuine.valid).toBe(true);
    if (genuine.valid) expect(genuine.source).not.toBe("dealer-confusion-recovery");
  });
});

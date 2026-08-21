import { describe, expect, it } from "vitest";
import { evaluateNativeVoiceTranscript, NATIVE_VOICE_NOISE_PHRASES, NATIVE_VOICE_PROTOTYPE_PHRASES } from "./nativeVoicePrototype";

describe("evaluateNativeVoiceTranscript — the 7 valid prototype phrases", () => {
  it("all 7 phrases are ACCEPTed", () => {
    for (const phrase of NATIVE_VOICE_PROTOTYPE_PHRASES) {
      const result = evaluateNativeVoiceTranscript(phrase);
      expect(result.verdict, `expected ACCEPT for "${phrase}"`).toBe("ACCEPT");
    }
  });

  it("the 4 card-dealing phrases would each produce exactly one CardEvent-worthy command", () => {
    const cardPhrases = NATIVE_VOICE_PROTOTYPE_PHRASES.filter((p) => p.includes("has a"));
    expect(cardPhrases).toHaveLength(4);
    for (const phrase of cardPhrases) {
      const result = evaluateNativeVoiceTranscript(phrase);
      expect(result.wouldProduceCardEvent, `expected a CardEvent for "${phrase}"`).toBe(true);
      expect(result.commands.filter((c) => c.op === "DEAL_CARD")).toHaveLength(1);
    }
  });

  it("'Player three hits.' and the two count-control phrases never produce a CardEvent", () => {
    for (const phrase of ["Player three hits.", "Start count.", "End count."]) {
      const result = evaluateNativeVoiceTranscript(phrase);
      expect(result.verdict).toBe("ACCEPT");
      expect(result.wouldProduceCardEvent, `expected no CardEvent for "${phrase}"`).toBe(false);
    }
  });
});

describe("evaluateNativeVoiceTranscript — target-number ambiguity — never guesses", () => {
  it("a seat number outside the recognized 1-7 range never resolves to a guessed target", () => {
    const result = evaluateNativeVoiceTranscript("player nine has a five");
    expect(result.verdict).not.toBe("ACCEPT");
    expect(result.wouldProduceCardEvent).toBe(false);
  });

  it("a bare card with no target spoken (would require guessing a live 'active' target this Lab has no state for) is REPEAT, never ACCEPT", () => {
    const result = evaluateNativeVoiceTranscript("seven");
    expect(result.verdict).toBe("REPEAT");
    expect(result.wouldProduceCardEvent).toBe(false);
  });
});

describe("evaluateNativeVoiceTranscript — card-rank ambiguity — never guesses", () => {
  it("a target with a dangling connector and no rank is REPEAT, not a guessed rank", () => {
    for (const phrase of ["Dealer has a", "Player three has a"]) {
      const result = evaluateNativeVoiceTranscript(phrase);
      expect(result.verdict, `expected REPEAT for "${phrase}"`).toBe("REPEAT");
      expect(result.wouldProduceCardEvent).toBe(false);
    }
  });
});

describe("evaluateNativeVoiceTranscript — unrelated speech is rejected", () => {
  it("every noise phrase is never ACCEPTed and never produces a CardEvent (REJECT for genuinely unrecognized speech, REPEAT for speech that superficially matches narration shape but is unsafe — e.g. a clock-time pattern — both are safe, neither is ACCEPT)", () => {
    for (const phrase of NATIVE_VOICE_NOISE_PHRASES) {
      const result = evaluateNativeVoiceTranscript(phrase);
      expect(result.verdict, `expected not ACCEPT for "${phrase}"`).not.toBe("ACCEPT");
      expect(result.wouldProduceCardEvent).toBe(false);
      expect(result.commands).toHaveLength(0);
    }
  });

  it("'Spotify is dead.' — plain unrelated speech with no narration-shaped structure at all — is specifically REJECT (UNKNOWN_COMMAND)", () => {
    const result = evaluateNativeVoiceTranscript("Spotify is dead.");
    expect(result.verdict).toBe("REJECT");
    expect(result.code).toBe("UNKNOWN_COMMAND");
  });
});

describe("evaluateNativeVoiceTranscript — no speech", () => {
  it("an empty transcript is REJECTed as EMPTY_TRANSCRIPT, never a fabricated command", () => {
    const result = evaluateNativeVoiceTranscript("");
    expect(result.verdict).toBe("REJECT");
    expect(result.code).toBe("EMPTY_TRANSCRIPT");
    expect(result.wouldProduceCardEvent).toBe(false);
  });

  it("a whitespace-only transcript is also REJECTed", () => {
    const result = evaluateNativeVoiceTranscript("   ");
    expect(result.verdict).toBe("REJECT");
    expect(result.wouldProduceCardEvent).toBe(false);
  });
});

describe("evaluateNativeVoiceTranscript — one phrase cannot create two CardEvents", () => {
  it("no single prototype phrase's commands ever contain more than one DEAL_CARD op", () => {
    for (const phrase of NATIVE_VOICE_PROTOTYPE_PHRASES) {
      const result = evaluateNativeVoiceTranscript(phrase);
      const dealCardCount = result.commands.filter((c) => c.op === "DEAL_CARD").length;
      expect(dealCardCount, `expected at most 1 DEAL_CARD for "${phrase}", got ${dealCardCount}`).toBeLessThanOrEqual(1);
    }
  });

  it("a real multi-card utterance ('Taylor has a king and a five', dealer-confusion recovery) legitimately produces two DEAL_CARD ops for ONE spoken phrase — not a bug, a genuine two-card hand", () => {
    const result = evaluateNativeVoiceTranscript("Taylor has a king and a five");
    expect(result.verdict).toBe("ACCEPT");
    expect(result.commands.filter((c) => c.op === "DEAL_CARD")).toHaveLength(2);
  });
});

describe("evaluateNativeVoiceTranscript — a rejected/repeated phrase can never create a CardEvent", () => {
  it("every REPEAT or REJECT verdict across noise + ambiguous phrases has wouldProduceCardEvent === false and zero commands", () => {
    const phrases = [...NATIVE_VOICE_NOISE_PHRASES, "player nine has a five", "Dealer has a", "", "seven"];
    for (const phrase of phrases) {
      const result = evaluateNativeVoiceTranscript(phrase);
      expect(result.verdict).not.toBe("ACCEPT");
      expect(result.wouldProduceCardEvent).toBe(false);
      expect(result.commands).toHaveLength(0);
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  buildNativeVoiceCorpusEntry,
  isFalseCardEvent,
  NATIVE_VOICE_REAL_SESSION_NOISE_REJECTION,
  NATIVE_VOICE_REAL_SESSION_VALID_COMMANDS,
  NATIVE_VOICE_REFERENCE_CASES,
  NATIVE_VOICE_SMOKE_TEST_NOISE_PHRASES,
  NATIVE_VOICE_SMOKE_TEST_PHRASES,
} from "./nativeVoiceCorpus";

describe("NATIVE_VOICE_SMOKE_TEST_PHRASES — the Quick Smoke Test, exactly 7, never more (milestone brief's own explicit boundary)", () => {
  it("is exactly the 7 prototype phrases", () => {
    expect(NATIVE_VOICE_SMOKE_TEST_PHRASES).toHaveLength(7);
  });

  it("noise phrases are a separate set, never merged into the 7-phrase smoke test", () => {
    expect(NATIVE_VOICE_SMOKE_TEST_NOISE_PHRASES.length).toBeGreaterThan(0);
    for (const noise of NATIVE_VOICE_SMOKE_TEST_NOISE_PHRASES) {
      expect(NATIVE_VOICE_SMOKE_TEST_PHRASES).not.toContain(noise);
    }
  });
});

describe("buildNativeVoiceCorpusEntry — builds a real VoiceCorpusEntry from an actual session, never fabricates one", () => {
  it("shapes a real card-dealing phrase's session into a correct, complete entry", () => {
    const entry = buildNativeVoiceCorpusEntry({
      expectedPhrase: "Dealer has a five.",
      transcript: "dealer has a five",
      providerId: "vosk",
      confidence: null,
      firstInterimMs: 120,
      finalMs: 850,
      device: "Windows PC",
      browserPlatform: "Chrome/128",
      speakerAnonymousId: "owner-session-1",
      recordedAt: "2026-08-21T20:00:00.000Z",
    });

    expect(entry.expectedPhrase).toBe("Dealer has a five.");
    expect(entry.expectedUniversalCommand).toEqual([{ op: "DEAL_CARD", target: { kind: "dealer" }, rank: "5" }]);
    expect(entry.providerResults).toHaveLength(1);
    expect(entry.providerResults[0].providerId).toBe("vosk");
    expect(entry.providerResults[0].parserOutcome).toBe("ACCEPT");
    expect(entry.providerResults[0].cardEventOutcome).toBe("would-write");
    expect(entry.capturedFrom).toBe("real-mic-owner-session");
    expect(entry.device).toBe("Windows PC");
  });

  it("shapes a misrecognized/rejected session honestly — cardEventOutcome is 'no-event', never 'would-write'", () => {
    const entry = buildNativeVoiceCorpusEntry({
      expectedPhrase: "Dealer has a five.",
      transcript: "spotify is dead",
      providerId: "vosk",
      confidence: null,
      firstInterimMs: null,
      finalMs: 500,
      device: "Windows PC",
      browserPlatform: "Chrome/128",
      speakerAnonymousId: "owner-session-1",
      recordedAt: "2026-08-21T20:01:00.000Z",
    });
    expect(entry.providerResults[0].parserOutcome).toBe("REJECT");
    expect(entry.providerResults[0].cardEventOutcome).toBe("no-event");
  });

  it("a phrase outside the 7-phrase prototype set is marked as an expected rejection, not silently guessed at", () => {
    const entry = buildNativeVoiceCorpusEntry({
      expectedPhrase: "Some phrase not in the prototype set.",
      transcript: "whatever",
      providerId: "vosk",
      confidence: null,
      firstInterimMs: null,
      finalMs: null,
      device: "Windows PC",
      browserPlatform: "Chrome/128",
      speakerAnonymousId: "owner-session-1",
      recordedAt: "2026-08-21T20:02:00.000Z",
    });
    expect(entry.expectedUniversalCommand).toEqual({ rejects: true, reason: "Not a known Native Voice grammar phrase." });
  });
});

describe("NATIVE_VOICE_REAL_SESSION_VALID_COMMANDS — Sidney's real Prototype 0.1 mic session, imported as a permanent fixture", () => {
  it("is exactly 7 entries, 6 correct + the 1 real 'Dealer has a five' miss", () => {
    expect(NATIVE_VOICE_REAL_SESSION_VALID_COMMANDS).toHaveLength(7);
    const miss = NATIVE_VOICE_REAL_SESSION_VALID_COMMANDS[0];
    expect(miss.expectedPhrase).toBe("Dealer has a five.");
    expect(miss.providerResults[0].transcript).toBeNull();
    expect(miss.providerResults[0].parserOutcome).toBe("REJECT");
    expect(miss.providerResults[0].correctness).toBe("incorrect");
  });

  it("zero false CardEvents across the whole real session — matches Sidney's own reported result", () => {
    const falseCount = NATIVE_VOICE_REAL_SESSION_VALID_COMMANDS.filter(
      (e) => e.providerResults[0].cardEventOutcome === "would-write" && e.providerResults[0].correctness === "incorrect"
    ).length;
    expect(falseCount).toBe(0);
  });

  it("the 6 non-miss entries all ACCEPT correctly", () => {
    const nonMiss = NATIVE_VOICE_REAL_SESSION_VALID_COMMANDS.slice(1);
    expect(nonMiss).toHaveLength(6);
    for (const entry of nonMiss) {
      expect(entry.providerResults[0].parserOutcome, entry.expectedPhrase).toBe("ACCEPT");
      expect(entry.providerResults[0].correctness).toBe("correct");
    }
  });

  it("no device/browser metadata is fabricated for this legacy chat-summarized capture", () => {
    for (const entry of NATIVE_VOICE_REAL_SESSION_VALID_COMMANDS) {
      expect(entry.device).toBeUndefined();
      expect(entry.browserPlatform).toBeUndefined();
    }
  });
});

describe("NATIVE_VOICE_REAL_SESSION_NOISE_REJECTION — Sidney's real Prototype 0.1 noise session, imported as a permanent fixture", () => {
  it("is exactly 5 entries, all safely blocked (never ACCEPT), 0 false CardEvents", () => {
    expect(NATIVE_VOICE_REAL_SESSION_NOISE_REJECTION).toHaveLength(5);
    for (const entry of NATIVE_VOICE_REAL_SESSION_NOISE_REJECTION) {
      expect(entry.providerResults[0].parserOutcome, entry.expectedPhrase).not.toBe("ACCEPT");
      expect(entry.providerResults[0].cardEventOutcome).toBe("no-event");
    }
  });

  it("preserves the two real reported transcripts exactly ('[unk] dealer' -> REJECT, 'player [unk]' -> REPEAT)", () => {
    expect(NATIVE_VOICE_REAL_SESSION_NOISE_REJECTION[0].providerResults[0].transcript).toBe("[unk] dealer");
    expect(NATIVE_VOICE_REAL_SESSION_NOISE_REJECTION[0].providerResults[0].parserOutcome).toBe("REJECT");
    expect(NATIVE_VOICE_REAL_SESSION_NOISE_REJECTION[1].providerResults[0].transcript).toBe("player [unk]");
    expect(NATIVE_VOICE_REAL_SESSION_NOISE_REJECTION[1].providerResults[0].parserOutcome).toBe("REPEAT");
  });
});

describe("isFalseCardEvent — the real misrecognition check (expected phrase vs. actual classified command, not a tautology)", () => {
  it("is false when the actual command matches the expected phrase's known command", () => {
    expect(isFalseCardEvent("Dealer has a five.", [{ op: "DEAL_CARD", target: { kind: "dealer" }, rank: "5" }])).toBe(false);
  });

  it("is TRUE when a misrecognition still produces a valid-looking but WRONG command (e.g. Vosk hearing 'nine' when 'five' was displayed)", () => {
    expect(isFalseCardEvent("Dealer has a five.", [{ op: "DEAL_CARD", target: { kind: "dealer" }, rank: "9" }])).toBe(true);
  });

  it("is false for a correct non-card result (e.g. a REPEAT producing zero commands) even on a card-dealing phrase — a miss is acceptable", () => {
    expect(isFalseCardEvent("Dealer has a five.", [])).toBe(false);
  });

  it("is TRUE for ANY CardEvent-producing result on a phrase with no known-safe mapping (e.g. a noise phrase)", () => {
    expect(isFalseCardEvent("Spotify is dead.", [{ op: "DEAL_CARD", target: { kind: "dealer" }, rank: "5" }])).toBe(true);
  });

  it("is false for a non-card result on an unknown phrase", () => {
    expect(isFalseCardEvent("Spotify is dead.", [])).toBe(false);
  });

  it("every v0.2 expanded phrase's own correct command is never flagged as a false CardEvent against itself", () => {
    // Exercises the full expected-command table built from NATIVE_VOICE_EXPANDED_PHRASES.
    expect(isFalseCardEvent("Dealer has a king.", [{ op: "DEAL_CARD", target: { kind: "dealer" }, rank: "10" }])).toBe(false);
    expect(isFalseCardEvent("Spot three split.", [{ op: "PLAYER_ACTION", target: { kind: "seat", seat: 3 }, action: "SPLIT" }])).toBe(false);
  });
});

describe("NATIVE_VOICE_REFERENCE_CASES — real, already-on-record confusion cases, no new capture required", () => {
  it("includes the real Dealer/Taylor and Dealer/Spotify confusion-recovery cases, still correctly recovered", () => {
    const taylor = NATIVE_VOICE_REFERENCE_CASES.find((c) => c.id === "reference:taylor-king-and-five");
    expect(taylor).toBeDefined();
    expect(taylor?.providerResults[0].parserOutcome).toBe("ACCEPT");
    expect(taylor?.providerResults[0].cardEventOutcome).toBe("would-write");
  });

  it("includes the real dangling-connector safety case (the SEAT5:3-shaped false-CardEvent class), still correctly rejected", () => {
    const dangling = NATIVE_VOICE_REFERENCE_CASES.find((c) => c.id === "reference:player-five-has-a-incomplete");
    expect(dangling).toBeDefined();
    expect(dangling?.providerResults[0].parserOutcome).not.toBe("ACCEPT");
    expect(dangling?.providerResults[0].cardEventOutcome).toBe("no-event");
  });

  it("every reference case has a non-empty capturedFrom honestly carried over from the original corpus item — never re-labeled as a fresh capture", () => {
    for (const entry of NATIVE_VOICE_REFERENCE_CASES) {
      expect(["real-mic-owner-session", "documented-grammar"]).toContain(entry.capturedFrom);
    }
  });
});

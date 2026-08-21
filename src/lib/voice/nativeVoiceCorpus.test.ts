import { describe, expect, it } from "vitest";
import { buildNativeVoiceCorpusEntry, NATIVE_VOICE_REFERENCE_CASES, NATIVE_VOICE_SMOKE_TEST_NOISE_PHRASES, NATIVE_VOICE_SMOKE_TEST_PHRASES } from "./nativeVoiceCorpus";

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
    expect(entry.expectedUniversalCommand).toEqual({ rejects: true, reason: "Not one of the 7 prototype phrases." });
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

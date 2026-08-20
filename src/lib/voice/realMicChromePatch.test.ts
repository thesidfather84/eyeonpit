// @vitest-environment node
//
// FINAL CHROME PATCH — the last four real-mic failures captured before
// switching strategy to a SpeechProvider architecture (see
// docs/EYEONPIT_VOICE_ARCHITECTURE.md). Every transcript below is an exact
// real captured phrase.
import { describe, expect, it } from "vitest";
import { parseNarration } from "./parseNarration";
import { parseTableChangeCommand } from "./parseTableChangeCommand";
import { classifyVoiceTranscript, tryDealerConfusionRecovery } from "./classifyVoiceTranscript";

describe('Chrome Patch — item 1: "play the N" recognized as "player N", only with valid blackjack narration following', () => {
  it('the exact captured "play the 3 hits gets a 4" -> Spot 3: 4', () => {
    const result = parseNarration("play the 3 hits gets a 4");
    expect(result.kind).toBe("ops");
    expect(result.kind === "ops" && result.ops).toEqual([
      { kind: "selectTarget", target: { kind: "seat", seat: 3 } },
      { kind: "card", target: { kind: "seat", seat: 3 }, rank: "4" },
    ]);
  });

  it('"play the game"/"play the odds" (no seat number follows "the") remain completely untouched', () => {
    expect(classifyVoiceTranscript("play the game").valid).toBe(false);
    expect(classifyVoiceTranscript("play the odds").valid).toBe(false);
  });
});

describe('Chrome Patch — item 2: "player 3 hits of 4" — general parser-handoff fix, not a special case for "of"', () => {
  it('the exact captured "player 3 hits of 4" -> Spot 3: 4', () => {
    const result = parseNarration("player 3 hits of 4");
    expect(result.kind).toBe("ops");
    expect(result.kind === "ops" && result.ops).toEqual([
      { kind: "selectTarget", target: { kind: "seat", seat: 3 } },
      { kind: "card", target: { kind: "seat", seat: 3 }, rank: "4" },
    ]);
  });

  it('"seat one has a five" (single connector, zero extra noise) still safely defers to legacy — unaffected', () => {
    const result = parseNarration("seat one has a five");
    expect(result.kind).toBe("no-opinion");
    const classification = classifyVoiceTranscript("seat one has a five");
    expect(classification.valid).toBe(true);
    expect(classification.valid && classification.summary).toBe("SEAT1:5");
  });

  it('genuine noise around a valid command still rejects — two unrelated stray words remain over budget', () => {
    expect(parseNarration("seat three raised his bet after the five").kind).toBe("reject");
  });
});

describe('Chrome Patch — item 3: "players that ARE down at spot N" table-change recovery', () => {
  it('the exact captured "players that are down at spot 3" -> Spot 3 sat down', () => {
    expect(parseTableChangeCommand("players that are down at spot 3")).toEqual({ kind: "seat-joins", seat: 3 });
  });

  it('"players that is down at spot 3" (the "is" variant) also recovers', () => {
    expect(parseTableChangeCommand("players that is down at spot 3")).toEqual({ kind: "seat-joins", seat: 3 });
  });

  it('"sat are down" is never recognized — the "are"/"is" tolerance is scoped to "that" specifically, not "sat"', () => {
    expect(parseTableChangeCommand("player sat are down at spot 3")).toBeNull();
  });

  it('the previously-fixed "players that down at spot 3" (no "are") remains unaffected', () => {
    expect(parseTableChangeCommand("players that down at spot 3")).toEqual({ kind: "seat-joins", seat: 3 });
  });
});

describe('Chrome Patch — item 4: dealer multi-card recovery tolerates "in" as "and" ("Taylor has a king in a five")', () => {
  it('the exact captured "Taylor has a king in a five" -> DEALER K, 5', () => {
    const recovered = tryDealerConfusionRecovery("Taylor has a king in a five");
    expect(recovered?.valid).toBe(true);
    expect(recovered?.valid && recovered.narrationOps).toEqual([
      { kind: "selectTarget", target: { kind: "dealer" } },
      { kind: "card", target: { kind: "dealer" }, rank: "10", displayRank: "K" },
      { kind: "card", target: { kind: "dealer" }, rank: "5" },
    ]);
  });

  it('"Taylor has a king and a five" (the original "and" form) is unaffected', () => {
    const recovered = tryDealerConfusionRecovery("Taylor has a king and a five");
    expect(recovered?.valid).toBe(true);
  });
});

describe("Chrome Patch — preserve existing safety (spot-check)", () => {
  it('"3:55" and "Spotify is dead" still reject', () => {
    expect(classifyVoiceTranscript("3:55").valid).toBe(false);
    expect(classifyVoiceTranscript("Spotify is dead").valid).toBe(false);
  });

  it('"player five has a" (incomplete narration) still rejects', () => {
    expect(parseNarration("player five has a").kind).toBe("reject");
  });

  it('"has a 5 and a 3" with no active player target still rejects', () => {
    expect(parseNarration("has a 5 and a 3", { allowUnscopedContinuation: false }).kind).toBe("reject");
  });
});

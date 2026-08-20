// @vitest-environment node
//
// PC VOICE FIELD TEST #2 — real Chrome/PC microphone session captured
// 2026-08-19, Debug panel JSON export. Every alternatives array below is
// copied verbatim (including exact confidence values) from that export —
// not paraphrased or simplified — per the explicit instruction to add the
// EXACT real microphone alternatives as permanent regression fixtures.
// This session exposed three real bugs (see the fixes each describe block
// references); every test here pins the CORRECTED behavior.
import { describe, expect, it } from "vitest";
import { resolveAlternatives } from "./nBestResolver";
import { parseNarration } from "./parseNarration";
import { parseTableChangeCommand } from "./parseTableChangeCommand";
import { classifyVoiceTranscript } from "./classifyVoiceTranscript";

describe("Real mic session 2026-08-19 — item 1: Taylor/dealer N-best conflict fix", () => {
  it('the exact captured V-000007 alternatives ("Taylor has a king and a five" vs "dealer has a king and a five") resolve to DEALER: K, 5, not CONFLICTING_ALTERNATIVES', () => {
    const result = resolveAlternatives([
      { transcript: "Taylor has a king and a five", confidence: 0.8026173710823059 },
      { transcript: "dealer has a king and a five", confidence: 0.8122981786727905 },
      { transcript: "Taylor has a king in a five", confidence: 0.7925761342048645 },
      { transcript: "Taylor has a Qing in a five", confidence: 0.7925761342048645 },
      { transcript: "Taylor has a king Inn a five", confidence: 0.7925761342048645 },
    ]);
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.winnerIndex).toBe(1);
    const winner = result.alternatives[1].classification;
    expect(winner.valid).toBe(true);
    expect(winner.valid && winner.summary).toBe("DEALER:K DEALER:5");
    expect(winner.valid && winner.hasExplicitTarget).toBe(true);
  });

  it('each rejected alternative individually fails ordinary classification (root cause verification)', () => {
    // "Taylor" riding as one tolerated noise word alongside two
    // connector-joined cards used to slip through as a valid, UNSCOPED
    // two-card action — see parseNarration.ts's `noiseTokens === 0`
    // requirement on the continuation relaxation.
    expect(classifyVoiceTranscript("Taylor has a king and a five").valid).toBe(false);
    expect(classifyVoiceTranscript("Taylor has a king in a five").valid).toBe(false);
    // Two noise words each ("Qing"/"Inn" are not recognized rank/connector words) — always correctly rejected.
    expect(classifyVoiceTranscript("Taylor has a Qing in a five").valid).toBe(false);
    expect(classifyVoiceTranscript("Taylor has a king Inn a five").valid).toBe(false);
  });
});

describe("Real mic session 2026-08-19 — item 2: play-filler-before-sat table-change recovery", () => {
  it('the exact captured V-000009/V-000010 alternatives all recover to Spot 3 sat down (seat-joins)', () => {
    const realCapturedTranscripts = [
      "play or sat down at spot 3",
      "play Oar sat down at spot 3",
      "play your sat down at spot 3",
      "play a sat down at", // V-000010 alt #1 — incomplete (no target), must stay null
      "play sat down at", // V-000010 alt #3 — incomplete (no target), must stay null
    ];
    expect(parseTableChangeCommand(realCapturedTranscripts[0])).toEqual({ kind: "seat-joins", seat: 3 });
    expect(parseTableChangeCommand(realCapturedTranscripts[1])).toEqual({ kind: "seat-joins", seat: 3 });
    expect(parseTableChangeCommand(realCapturedTranscripts[2])).toEqual({ kind: "seat-joins", seat: 3 });
    // The genuinely incomplete real captures (Chrome's own segmentation cut
    // the utterance off before "spot 3" was ever heard) must still reject —
    // never guessed at, per the module's own safety rules.
    expect(parseTableChangeCommand(realCapturedTranscripts[3])).toBeNull();
    expect(parseTableChangeCommand(realCapturedTranscripts[4])).toBeNull();
  });

  it('"play or die"/"play your cards right" (an "or"/"your" NOT followed by "sat") remain completely untouched', () => {
    expect(parseTableChangeCommand("play or die")).toBeNull();
    expect(parseTableChangeCommand("play your cards right")).toBeNull();
  });
});

describe("Real mic session 2026-08-19 — item 3: parser-handoff rule fixed generally, not word-specific", () => {
  it('the exact captured V-000012 alternatives ("spot 3 hits gets a four" / "spot 3 hits gets a 4") now commit directly via narration, not legacy', () => {
    for (const transcript of ["spot 3 hits gets a four", "spot 3 hits gets a 4"]) {
      const result = parseNarration(transcript);
      expect(result.kind).toBe("ops");
      expect(result.kind === "ops" && result.ops).toEqual([
        { kind: "selectTarget", target: { kind: "seat", seat: 3 } },
        { kind: "card", target: { kind: "seat", seat: 3 }, rank: "4" },
      ]);
    }
  });

  it('"spot 3 gets a 4" (ONE connector word only) still safely defers to legacy — unaffected, preserved', () => {
    const result = parseNarration("spot 3 gets a 4");
    expect(result.kind).toBe("no-opinion");
    // Confirms legacy actually accepts it once deferred — the full pipeline, not just the defer decision.
    const classification = classifyVoiceTranscript("spot 3 gets a 4");
    expect(classification.valid).toBe(true);
    expect(classification.valid && classification.summary).toBe("SEAT3:4");
  });

  it('"spot 3 has a 4" (ONE connector word only) still safely defers to legacy — unaffected, preserved', () => {
    const result = parseNarration("spot 3 has a 4");
    expect(result.kind).toBe("no-opinion");
    const classification = classifyVoiceTranscript("spot 3 has a 4");
    expect(classification.valid).toBe(true);
    expect(classification.valid && classification.summary).toBe("SEAT3:4");
  });

  it('a genuinely legacy-shaped command ("seat one" alone) still defers to legacy — the general fix never forces narration to own everything', () => {
    const result = parseNarration("seat one");
    expect(result.kind).toBe("no-opinion");
    const classification = classifyVoiceTranscript("seat one");
    expect(classification.valid).toBe(true);
    expect(classification.valid && classification.source).toBe("legacy");
  });

  it('noise around a valid target/card must still reject — the general fix does not loosen the ordinary noise cap', () => {
    expect(parseNarration("seat three raised his bet after the five").kind).toBe("reject");
    expect(classifyVoiceTranscript("seat three raised his bet after the five").valid).toBe(false);
  });
});

describe("Real mic session 2026-08-19 — item 8: safety cases must not regress", () => {
  it('the exact captured "3:55" alternatives -> rejected, zero cards', () => {
    const result = resolveAlternatives([
      { transcript: "3:55", confidence: 0.6789668798446655 },
      { transcript: "3 555", confidence: 0.09939628094434738 },
    ]);
    expect(result.accepted).toBe(false);
  });

  it('the exact captured "Spotify is dead" alternatives -> rejected, zero cards', () => {
    const result = resolveAlternatives([
      { transcript: "Spotify is dead", confidence: 0.9257850646972656 },
      { transcript: "Spotify is DED", confidence: 0.9257850646972656 },
    ]);
    expect(result.accepted).toBe(false);
  });

  it('the exact captured "next hand" alternatives -> accepted as Done', () => {
    const result = resolveAlternatives([
      { transcript: "next hand", confidence: 0.9436971545219421 },
      { transcript: "next hande", confidence: 0.9436971545219421 },
      { transcript: "nexxthursday hand", confidence: 0.9436971545219421 },
      { transcript: "next handh", confidence: 0.9436971545219421 },
    ]);
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    const winner = result.alternatives[result.winnerIndex].classification;
    expect(winner.valid && winner.summary).toBe("DONE");
  });
});

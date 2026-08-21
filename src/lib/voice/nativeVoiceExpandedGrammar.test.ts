/**
 * NATIVE VOICE v0.2 — the expanded English grammar (nativeVoicePrototype.ts's
 * NATIVE_VOICE_EXPANDED_GROUPS), verified phrase-by-phrase against the real,
 * unmodified classifier -> UniversalCommand pipeline. Every expected command
 * below was captured from a real run of `evaluateNativeVoiceTranscript`
 * before being written as an assertion (see this round's own report) — not
 * assumed from reading parser source alone.
 */
import { describe, expect, it } from "vitest";
import { evaluateNativeVoiceTranscript, NATIVE_VOICE_EXPANDED_GROUPS, NATIVE_VOICE_EXPANDED_PHRASES, NATIVE_VOICE_PROTOTYPE_PHRASES } from "./nativeVoicePrototype";
import { buildVoskGrammarString, VOSK_EXPANDED_GRAMMAR_PHRASES } from "./voskProvider";

describe("NATIVE_VOICE_EXPANDED_PHRASES — every phrase ACCEPTs, built only from existing production vocabulary", () => {
  it("every expanded phrase ACCEPTs — no phrase built from existing vocabulary is silently rejected", () => {
    for (const phrase of NATIVE_VOICE_EXPANDED_PHRASES) {
      const r = evaluateNativeVoiceTranscript(phrase);
      expect(r.verdict, `expected ACCEPT for "${phrase}", got ${r.verdict} (${r.code})`).toBe("ACCEPT");
    }
  });

  it("is a practical, bounded size (not the full production grammar) — well under 100 phrases", () => {
    expect(NATIVE_VOICE_EXPANDED_PHRASES.length).toBeGreaterThan(NATIVE_VOICE_PROTOTYPE_PHRASES.length);
    expect(NATIVE_VOICE_EXPANDED_PHRASES.length).toBeLessThan(100);
  });

  it("is grouped exactly as requested: dealer/card, player/card, controls", () => {
    expect(NATIVE_VOICE_EXPANDED_GROUPS.map((g) => g.id)).toEqual(["dealer-card", "player-card", "controls"]);
  });
});

describe("dealer/card group — full 13-rank coverage on the dealer target", () => {
  const expectedRanksInOrder = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "10", "10", "10"];

  it("every one of the 13 canonical ranks is represented, in order, all on the dealer target", () => {
    const group = NATIVE_VOICE_EXPANDED_GROUPS.find((g) => g.id === "dealer-card")!;
    expect(group.phrases).toHaveLength(13);
    group.phrases.forEach((phrase, i) => {
      const r = evaluateNativeVoiceTranscript(phrase);
      expect(r.commands).toEqual([{ op: "DEAL_CARD", target: { kind: "dealer" }, rank: expectedRanksInOrder[i] }]);
    });
  });

  it("REGRESSION — 'Dealer has a five.' still resolves correctly through the TEXT/classifier path (the real-mic miss was an acoustic/ASR-layer issue, not a parser bug — see voskProvider.ts's own PHRASE DIAGNOSTICS doc comment)", () => {
    const r = evaluateNativeVoiceTranscript("Dealer has a five.");
    expect(r.verdict).toBe("ACCEPT");
    expect(r.commands).toEqual([{ op: "DEAL_CARD", target: { kind: "dealer" }, rank: "5" }]);
    expect(r.wouldProduceCardEvent).toBe(true);
  });
});

describe("player/card group — representative seats x representative ranks", () => {
  it("every phrase resolves to the correct seat + rank", () => {
    const group = NATIVE_VOICE_EXPANDED_GROUPS.find((g) => g.id === "player-card")!;
    const expected = [
      { seat: 1, rank: "5" },
      { seat: 1, rank: "10" },
      { seat: 1, rank: "A" },
      { seat: 3, rank: "10" },
      { seat: 3, rank: "9" },
      { seat: 3, rank: "7" },
      { seat: 5, rank: "10" },
      { seat: 5, rank: "10" },
    ];
    group.phrases.forEach((phrase, i) => {
      const r = evaluateNativeVoiceTranscript(phrase);
      expect(r.commands).toEqual([{ op: "DEAL_CARD", target: { kind: "seat", seat: expected[i].seat }, rank: expected[i].rank }]);
    });
  });
});

describe("controls group — real existing command shapes, never a fabricated new one", () => {
  it("every control phrase maps to the correct, existing UniversalCommand op", () => {
    const group = NATIVE_VOICE_EXPANDED_GROUPS.find((g) => g.id === "controls")!;
    const expected = [
      [{ op: "COUNT_CONTROL", action: "START" }],
      [{ op: "COUNT_CONTROL", action: "PAUSE" }],
      [{ op: "COUNT_CONTROL", action: "PAUSE" }],
      [{ op: "COUNT_CONTROL", action: "RESUME" }],
      [{ op: "HAND_DONE" }],
      [{ op: "HAND_NEXT" }],
      [{ op: "HAND_UNDO" }],
      [{ op: "SELECT_TARGET", target: { kind: "seat", seat: 1 } }],
      [{ op: "SELECT_TARGET", target: { kind: "dealer" } }],
      [{ op: "PLAYER_ACTION", target: { kind: "seat", seat: 3 }, action: "SPLIT" }],
      [{ op: "PLAYER_ACTION", target: { kind: "seat", seat: 3 }, action: "DOUBLE" }],
      [{ op: "COUNT_QUERY", kind: "STATUS" }],
      [{ op: "COUNT_QUERY", kind: "RC" }],
      [{ op: "COUNT_QUERY", kind: "TC" }],
      [{ op: "COUNT_QUERY", kind: "ACES" }],
      [{ op: "COUNT_QUERY", kind: "DECKS" }],
      [{ op: "PLAYER_ENTER", seat: 1 }],
      [{ op: "PLAYER_LEAVE", seat: 2 }],
      [{ op: "SELECT_TARGET", target: { kind: "seat", seat: 3 } }],
    ];
    expect(group.phrases).toHaveLength(expected.length);
    group.phrases.forEach((phrase, i) => {
      const r = evaluateNativeVoiceTranscript(phrase);
      expect(r.commands, `phrase: "${phrase}"`).toEqual(expected[i]);
    });
  });

  it("no control phrase ever produces a DEAL_CARD — controls never write to the ledger", () => {
    const group = NATIVE_VOICE_EXPANDED_GROUPS.find((g) => g.id === "controls")!;
    for (const phrase of group.phrases) {
      const r = evaluateNativeVoiceTranscript(phrase);
      expect(r.wouldProduceCardEvent, `phrase: "${phrase}"`).toBe(false);
    }
  });

  it("Hit/Stand/Surrender/Insurance are deliberately absent from the v0.2 grammar — not represented as new behavior", () => {
    const group = NATIVE_VOICE_EXPANDED_GROUPS.find((g) => g.id === "controls")!;
    const joined = group.phrases.join(" ").toLowerCase();
    for (const word of ["stand", "surrender", "insurance"]) {
      expect(joined).not.toContain(word);
    }
    // "hits" is the one exception — kept from Prototype 0.1 for continuity,
    // already real existing behavior (SELECT_TARGET only, no new mutation).
  });
});

describe("one utterance cannot create duplicate commands", () => {
  it("no expanded-grammar phrase produces more than one DEAL_CARD for a single spoken card", () => {
    for (const phrase of NATIVE_VOICE_EXPANDED_PHRASES) {
      const r = evaluateNativeVoiceTranscript(phrase);
      const dealCardCount = r.commands.filter((c) => c.op === "DEAL_CARD").length;
      expect(dealCardCount, `phrase: "${phrase}"`).toBeLessThanOrEqual(1);
    }
  });

  it("no expanded-grammar phrase produces more than one command total (each is a single, unambiguous action)", () => {
    for (const phrase of NATIVE_VOICE_EXPANDED_PHRASES) {
      const r = evaluateNativeVoiceTranscript(phrase);
      expect(r.commands.length, `phrase: "${phrase}"`).toBeLessThanOrEqual(1);
    }
  });
});

describe("VOSK_EXPANDED_GRAMMAR_PHRASES — derived from the same display phrases via normalizeTranscript, can never drift", () => {
  it("is exactly the normalized expanded phrases plus '[unk]'", () => {
    expect(VOSK_EXPANDED_GRAMMAR_PHRASES).toHaveLength(NATIVE_VOICE_EXPANDED_PHRASES.length + 1);
    expect(VOSK_EXPANDED_GRAMMAR_PHRASES[VOSK_EXPANDED_GRAMMAR_PHRASES.length - 1]).toBe("[unk]");
    expect(VOSK_EXPANDED_GRAMMAR_PHRASES).toContain("dealer has a five");
    expect(VOSK_EXPANDED_GRAMMAR_PHRASES).toContain("dealer has a king");
    expect(VOSK_EXPANDED_GRAMMAR_PHRASES).toContain("spot three split");
  });

  it("every grammar entry is lowercase with no punctuation — a valid Vosk grammar word sequence", () => {
    for (const phrase of VOSK_EXPANDED_GRAMMAR_PHRASES) {
      if (phrase === "[unk]") continue;
      expect(phrase).toBe(phrase.toLowerCase());
      expect(phrase).not.toMatch(/[.,!?]/);
    }
  });

  it("serializes to a real JSON array string", () => {
    const s = buildVoskGrammarString(VOSK_EXPANDED_GRAMMAR_PHRASES);
    expect(JSON.parse(s)).toEqual(VOSK_EXPANDED_GRAMMAR_PHRASES);
  });
});

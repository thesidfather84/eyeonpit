/**
 * NATIVE VOICE v0.2 — ADVERSARIAL SAFETY TESTS. Per explicit instruction:
 * "Add adversarial grammar tests for close-sounding phrases... A missed
 * phrase is acceptable. A wrong target/card is not." Every case here is a
 * TEXT-level simulation of what a close-sounding ASR misrecognition might
 * produce (this app has no audio in CI — see voiceBenchmarkCorpus.ts's own
 * doc comment on that same boundary) — the hard gate under test is that
 * `evaluateNativeVoiceTranscript` NEVER turns a close-sounding confusion
 * into a wrong ACCEPTed CardEvent. Every expected outcome below was
 * verified against the REAL, unmodified classifier before being written as
 * an assertion (not assumed from reading parser source) — see this round's
 * own report for the verification trail.
 */
import { describe, expect, it } from "vitest";
import { evaluateNativeVoiceTranscript } from "./nativeVoicePrototype";

function expectNoFalseCardEvent(phrase: string) {
  const r = evaluateNativeVoiceTranscript(phrase);
  if (r.verdict === "ACCEPT") {
    expect(r.commands.some((c) => c.op === "DEAL_CARD")).toBe(false);
  }
  return r;
}

describe("adversarial — dealer vs. unrelated/confused words", () => {
  it("'Taylor is dead' (dealer-confusion token + connector, but no rank) never becomes a dealer card", () => {
    const r = expectNoFalseCardEvent("Taylor is dead");
    expect(r.verdict).toBe("REJECT");
  });

  it("bare 'dealer' selects the target only — never a guessed card", () => {
    const r = evaluateNativeVoiceTranscript("dealer");
    expect(r.verdict).toBe("ACCEPT");
    expect(r.commands).toEqual([{ op: "SELECT_TARGET", target: { kind: "dealer" } }]);
    expect(r.wouldProduceCardEvent).toBe(false);
  });

  it("'dealer showing ten' (natural phrasing variant) correctly extracts DEAL_CARD(dealer, 10), not silently dropped or misrouted", () => {
    const r = evaluateNativeVoiceTranscript("dealer showing ten");
    expect(r.verdict).toBe("ACCEPT");
    expect(r.commands).toEqual([{ op: "DEAL_CARD", target: { kind: "dealer" }, rank: "10" }]);
  });
});

describe("adversarial — 'player' vs. 'play'", () => {
  it("'play three has a five' — real existing ASR_PLAY_TO_PLAYER recovery — correctly recognized as 'player three has a five', not dropped or misrouted", () => {
    const r = evaluateNativeVoiceTranscript("play three has a five");
    expect(r.verdict).toBe("ACCEPT");
    expect(r.commands).toEqual([{ op: "DEAL_CARD", target: { kind: "seat", seat: 3 }, rank: "5" }]);
  });

  it("'play music' (no seat number follows 'play') is never mistaken for a player command", () => {
    const r = expectNoFalseCardEvent("play music");
    expect(r.verdict).toBe("REJECT");
  });

  it("'the player raised his bet' — ordinary sentence containing 'player' — never produces a CardEvent", () => {
    expectNoFalseCardEvent("the player raised his bet");
  });

  it("'player three raised his bet' — a real seat number followed by ordinary unrelated speech — never produces a CardEvent", () => {
    expectNoFalseCardEvent("player three raised his bet");
  });
});

describe("adversarial — seat-number confusion ('one' vs. other numbers, out-of-range numbers)", () => {
  it("'player won has a five' (homophone of 'one') never resolves to seat 1 — 'won' is not a recognized seat-number word", () => {
    const r = expectNoFalseCardEvent("player won has a five");
    expect(r.verdict).not.toBe("ACCEPT");
  });

  it("digit form 'player 1 has a five' resolves identically to the word form", () => {
    const r = evaluateNativeVoiceTranscript("player 1 has a five");
    expect(r.commands).toEqual([{ op: "DEAL_CARD", target: { kind: "seat", seat: 1 }, rank: "5" }]);
  });

  it("'seat nine' — outside the valid 1-7 range — is never silently clamped or misassigned to any real seat", () => {
    const r = expectNoFalseCardEvent("seat nine has a five");
    expect(r.verdict).not.toBe("ACCEPT");
  });

  it("'s1 has a five' — the documented seat-letter-token ASR artifact — correctly resolves to seat 1, not dropped", () => {
    const r = evaluateNativeVoiceTranscript("s1 has a five");
    expect(r.commands).toEqual([{ op: "DEAL_CARD", target: { kind: "seat", seat: 1 }, rank: "5" }]);
  });
});

describe("adversarial — rank confusion (five vs. nine, king vs. ten, near-miss rank words)", () => {
  it("'dealer has a fine' (near-miss for 'five') never silently becomes rank 5", () => {
    const r = expectNoFalseCardEvent("dealer has a fine");
    expect(r.verdict).not.toBe("ACCEPT");
  });

  it("'dealer has a tin' (near-miss for 'ten') never silently becomes rank 10", () => {
    const r = expectNoFalseCardEvent("dealer has a tin");
    expect(r.verdict).not.toBe("ACCEPT");
  });

  it("'five' and 'nine' resolve to distinct, correct ranks for the identical target/sentence shape — never confused with each other", () => {
    const five = evaluateNativeVoiceTranscript("dealer has a five");
    const nine = evaluateNativeVoiceTranscript("dealer has a nine");
    expect(five.commands).toEqual([{ op: "DEAL_CARD", target: { kind: "dealer" }, rank: "5" }]);
    expect(nine.commands).toEqual([{ op: "DEAL_CARD", target: { kind: "dealer" }, rank: "9" }]);
  });

  it("'king' and 'ten' both correctly resolve to the same mathematical rank value (10) — by design, not a confusion", () => {
    const king = evaluateNativeVoiceTranscript("dealer has a king");
    const ten = evaluateNativeVoiceTranscript("dealer has a ten");
    expect(king.commands).toEqual([{ op: "DEAL_CARD", target: { kind: "dealer" }, rank: "10" }]);
    expect(ten.commands).toEqual([{ op: "DEAL_CARD", target: { kind: "dealer" }, rank: "10" }]);
  });
});

describe("adversarial — unrelated phrases that merely contain 'player'/'dealer'/number words", () => {
  it("'I have five dollars' (a bare rank word buried in an unrelated sentence) never produces a CardEvent", () => {
    expectNoFalseCardEvent("I have five dollars");
  });

  it("'nine has a five' (a bare out-of-vocabulary number as if it were a target) never produces a CardEvent", () => {
    const r = expectNoFalseCardEvent("nine has a five");
    expect(r.verdict).not.toBe("ACCEPT");
  });
});

describe("adversarial — multi-card narration never silently duplicates or drops a card", () => {
  it("'player three has a five and a nine' correctly produces exactly two distinct DEAL_CARD commands, in order", () => {
    const r = evaluateNativeVoiceTranscript("player three has a five and a nine");
    expect(r.commands).toEqual([
      { op: "DEAL_CARD", target: { kind: "seat", seat: 3 }, rank: "5" },
      { op: "DEAL_CARD", target: { kind: "seat", seat: 3 }, rank: "9" },
    ]);
  });
});

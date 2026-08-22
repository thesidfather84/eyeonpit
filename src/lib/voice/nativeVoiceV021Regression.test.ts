/**
 * NATIVE VOICE v0.2.1 — regression tests F/G/H/I from Sidney's real iPhone
 * Quick Test round (BUG #2, trailing word loss). F/G are TEXT-level
 * classifier invariants (voskProvider.ts only ever supplies whatever
 * transcript the ASR produced — it has no say in how that text is
 * classified), so they belong here, not in voskProvider.test.ts. H/I
 * re-confirm existing round-2 safety guarantees still hold, explicitly
 * tied to this round's own investigation for traceability.
 */
import { describe, expect, it } from "vitest";
import { evaluateNativeVoiceTranscript, NATIVE_VOICE_NOISE_PHRASES } from "./nativeVoicePrototype";

describe("REGRESSION F — 'Player three hits' retains its full, correct (safe) classification when acoustically recognized in full", () => {
  it("the complete phrase resolves to SELECT_TARGET(seat 3), never a fabricated HIT action, never a CardEvent", () => {
    const r = evaluateNativeVoiceTranscript("player three hits");
    expect(r.verdict).toBe("ACCEPT");
    expect(r.commands).toEqual([{ op: "SELECT_TARGET", target: { kind: "seat", seat: 3 } }]);
    expect(r.wouldProduceCardEvent).toBe(false);
  });
});

describe("REGRESSION G — 'Player three' alone (the real iPhone transcript with 'hits' dropped) remains SELECT_TARGET — never manufactured into a hit", () => {
  it("the truncated transcript classifies identically to the full phrase — safe, not upgraded, not downgraded", () => {
    const truncated = evaluateNativeVoiceTranscript("player three");
    const full = evaluateNativeVoiceTranscript("player three hits");
    expect(truncated.verdict).toBe("ACCEPT");
    expect(truncated.commands).toEqual([{ op: "SELECT_TARGET", target: { kind: "seat", seat: 3 } }]);
    expect(truncated.wouldProduceCardEvent).toBe(false);
    // Identical resulting command either way — "hits" was always inert
    // filler by design (see parseNarration.ts's INERT_ACTION_WORDS), so
    // losing it changes nothing about what gets committed. This is the
    // hard safety invariant from this round's own instruction: recognition
    // uncertainty/incomplete speech must fail safe, never invent an action
    // word the recognizer didn't actually supply.
    expect(truncated.commands).toEqual(full.commands);
  });

  it("no UniversalCommand op named HIT/PLAYER_THREE_HIT or similar exists anywhere this transcript could resolve to", () => {
    const r = evaluateNativeVoiceTranscript("player three");
    for (const command of r.commands) {
      expect(command.op).not.toMatch(/hit/i);
    }
  });
});

describe("REGRESSION H — ambient/unrelated speech still produces zero CardEvents (re-confirmed this round)", () => {
  it("every existing noise phrase remains safe", () => {
    for (const phrase of NATIVE_VOICE_NOISE_PHRASES) {
      const r = evaluateNativeVoiceTranscript(phrase);
      expect(r.wouldProduceCardEvent, phrase).toBe(false);
    }
  });
});

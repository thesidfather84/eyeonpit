import { describe, expect, it } from "vitest";
import { resolveAlternatives } from "./nBestResolver";

function alt(transcript: string, confidence: number | null) {
  return { transcript, confidence };
}

describe("resolveAlternatives — field-captured N-best conflicts", () => {
  it("ALT1 'killer king' (invalid, unscoped noise+card) loses to ALT2 'dealer King' (explicit target)", () => {
    const result = resolveAlternatives([alt("killer king", 0.86), alt("dealer King", 0.82), alt("Taylor King", 0.6)]);
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.winnerIndex).toBe(1);
      expect(result.alternatives[1].classification.valid).toBe(true);
    }
  });

  it("ALT1 'Taylor has a king' (invalid, 2+ noise tokens) loses to ALT2 'dealer has a king'", () => {
    const result = resolveAlternatives([alt("Taylor has a king", 0.92), alt("dealer has a king", 0.85)]);
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.winnerIndex).toBe(1);
    }
  });

  it("rejects unrelated speech ('Spotify is dead') even alongside no other alternatives", () => {
    const result = resolveAlternatives([alt("Spotify is dead", 0.7)]);
    expect(result.accepted).toBe(false);
  });

  it("accepts the only valid alternative regardless of ASR rank position", () => {
    const result = resolveAlternatives([alt("banana", 0.9), alt("dealer king", 0.4), alt("nonsense words here", 0.3)]);
    expect(result.accepted).toBe(true);
    if (result.accepted) expect(result.winnerIndex).toBe(1);
  });

  it("accepts when multiple alternatives agree on the identical action", () => {
    const result = resolveAlternatives([alt("dealer king", 0.6), alt("dealer king", 0.5)]);
    expect(result.accepted).toBe(true);
  });

  it("refuses to guess between two genuinely conflicting valid alternatives with similar confidence", () => {
    // Two DIFFERENT explicit-target cards, close confidence — no decisive margin.
    const result = resolveAlternatives([alt("dealer king", 0.7), alt("seat three king", 0.68)]);
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(["CONFLICTING_ALTERNATIVES", "MULTIPLE_VALID_CONFLICTS"]).toContain(result.code);
    }
  });

  it("hard-rejects uncertainty language even if another alternative would otherwise parse", () => {
    const result = resolveAlternatives([alt("maybe player one has a three", 0.7), alt("maybe player one has a three", 0.65)]);
    expect(result.accepted).toBe(false);
    if (!result.accepted) expect(result.code).toBe("UNCERTAIN_LANGUAGE");
  });

  it("a bare card with no target still wins when it is the only valid alternative", () => {
    const result = resolveAlternatives([alt("king", 0.4), alt("thing", 0.3)]);
    expect(result.accepted).toBe(true);
    if (result.accepted) expect(result.winnerIndex).toBe(0);
  });

  it("dealer misrecognition: 'killer' never wins over 'dealer' when both target words are offered as alternatives for the same card", () => {
    const result = resolveAlternatives([alt("killer five", 0.7), alt("dealer five", 0.65)]);
    expect(result.accepted).toBe(true);
    if (result.accepted) expect(result.winnerIndex).toBe(1);
  });

  it("a command alias ('next hand' -> done) is resolved via N-best exactly like a card command", () => {
    const result = resolveAlternatives([alt("next land", 0.5), alt("next hand", 0.75)]);
    expect(result.accepted).toBe(true);
    if (result.accepted) expect(result.winnerIndex).toBe(1);
  });

  it("malformed/garbled speech across every alternative is rejected, never guessed", () => {
    const result = resolveAlternatives([alt("mmhm yeah", 0.3), alt("uh whatever that was", 0.2)]);
    expect(result.accepted).toBe(false);
    if (!result.accepted) expect(result.code).toBe("NO_VALID_ALTERNATIVE");
  });

  it("active-target follow-up: a bare rank word alone (no target in ANY alternative) still resolves — active-target resolution itself happens later, at commit time, not in the classifier", () => {
    const result = resolveAlternatives([alt("king", 0.5), alt("king", 0.4)]);
    expect(result.accepted).toBe(true);
  });

  it("out-of-range seat numbers never win, even as the only alternative offered", () => {
    const result = resolveAlternatives([alt("seat eight", 0.9)]);
    expect(result.accepted).toBe(false);
  });
});

describe("PC field test #1 — V-000006/V-000018 resolver bug: canonicalized agreement, not a false conflict", () => {
  it('ALT1 "seat one has a five" (legacy) and ALT2 "the player in seat one has a five" (narration) now AGREE — accepted, not CONFLICTING_ALTERNATIVES', () => {
    const result = resolveAlternatives([alt("seat one has a five", 0.9), alt("the player in seat one has a five", 0.85)]);
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.reason).toMatch(/agreed/);
      const winnerClassification = result.alternatives[result.winnerIndex].classification;
      expect(winnerClassification.valid && winnerClassification.actionKey).toBe("C:SEAT1:5");
    }
  });

  it("the exact field-reported shape also holds with the extended form ranked FIRST", () => {
    const result = resolveAlternatives([alt("the player in seat one has a five", 0.85), alt("seat one has a five", 0.9)]);
    expect(result.accepted).toBe(true);
  });
});

describe("PC field test #1 — contextual dealer-confusion recovery via the resolver's last-resort fallback", () => {
  it('a single "Taylor has a 10" alternative (no genuine dealer alternative offered) is rescued to DEALER:10', () => {
    const result = resolveAlternatives([alt("Taylor has a 10", 0.8)]);
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.reason).toMatch(/DEALER_ASR_TAYLOR/);
      const c = result.alternatives[result.winnerIndex].classification;
      expect(c.valid && c.actionKey).toBe("C:DEALER:10");
    }
  });

  it('"Spotify has an ace" alone is rescued to DEALER:A', () => {
    const result = resolveAlternatives([alt("Spotify has an ace", 0.75)]);
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      const c = result.alternatives[result.winnerIndex].classification;
      expect(c.valid && c.actionKey).toBe("C:DEALER:A");
    }
  });

  it("recovery is never even attempted when a normal valid alternative already exists — 'dealer has a king' alongside 'Taylor has a king' wins on the genuine alternative, not recovery", () => {
    const result = resolveAlternatives([alt("Taylor has a king", 0.92), alt("dealer has a king", 0.85)]);
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.reason).not.toMatch(/DEALER_ASR/);
      const winner = result.alternatives[result.winnerIndex];
      expect(winner.transcript).toBe("dealer has a king");
    }
  });

  it("multiple alternatives recovering to DIFFERENT dealer ranks refuse to guess", () => {
    const result = resolveAlternatives([alt("Taylor has a king", 0.7), alt("Spotify has an ace", 0.68)]);
    expect(result.accepted).toBe(false);
  });

  it("'Spotify is dead' remains rejected even though 'Spotify' is a recognized confusion token — the recovery grammar never matches it", () => {
    const result = resolveAlternatives([alt("Spotify is dead", 0.7)]);
    expect(result.accepted).toBe(false);
    if (!result.accepted) expect(result.code).toBe("NO_VALID_ALTERNATIVE");
  });

  it("random/non-blackjack phrases remain rejected with no recovery applicable", () => {
    const result = resolveAlternatives([alt("can you turn up the music", 0.6), alt("what time is it", 0.5)]);
    expect(result.accepted).toBe(false);
  });

  it('ALT1 "dealer has an eight" / ALT2 "dealer has an eighth" — both genuinely valid and in agreement (same rank), accepted as DEALER:8', () => {
    const result = resolveAlternatives([alt("dealer has an eight", 0.88), alt("dealer has an eighth", 0.7)]);
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      const c = result.alternatives[result.winnerIndex].classification;
      expect(c.valid && c.actionKey).toBe("C:DEALER:8");
    }
  });
});

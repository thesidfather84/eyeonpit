import { describe, expect, it } from "vitest";
import { parseVoiceCommand } from "./parseVoiceCommand";

describe("parseVoiceCommand — seat selection", () => {
  it.each([
    ["seat one", 1],
    ["seat two", 2],
    ["seat three", 3],
    ["seat four", 4],
    ["seat five", 5],
    ["seat six", 6],
    ["seat seven", 7],
  ] as const)("%s -> seat %d", (phrase, seat) => {
    const result = parseVoiceCommand(phrase);
    expect(result.command).toEqual({ kind: "select-seat", seat });
  });

  it("accepts digit form (\"seat 3\") as well as word form", () => {
    expect(parseVoiceCommand("seat 3").command).toEqual({ kind: "select-seat", seat: 3 });
  });

  it("is case-insensitive and tolerates trailing punctuation", () => {
    expect(parseVoiceCommand("Seat One.").command).toEqual({ kind: "select-seat", seat: 1 });
    expect(parseVoiceCommand("SEAT SEVEN!").command).toEqual({ kind: "select-seat", seat: 7 });
  });

  it("does not recognize a seat number outside 1-7", () => {
    expect(parseVoiceCommand("seat eight").command).toBeNull();
    expect(parseVoiceCommand("seat zero").command).toBeNull();
  });
});

describe("parseVoiceCommand — dealer selection", () => {
  it('"dealer" selects the dealer', () => {
    expect(parseVoiceCommand("dealer").command).toEqual({ kind: "select-dealer" });
  });

  it("is case-insensitive", () => {
    expect(parseVoiceCommand("Dealer").command).toEqual({ kind: "select-dealer" });
  });
});

describe("parseVoiceCommand — card ranks", () => {
  it.each([
    ["ace", "A"],
    ["two", "2"],
    ["three", "3"],
    ["four", "4"],
    ["five", "5"],
    ["six", "6"],
    ["seven", "7"],
    ["eight", "8"],
    ["nine", "9"],
    ["ten", "10"],
  ] as const)("%s -> rank %s", (word, rank) => {
    expect(parseVoiceCommand(word).command).toEqual({ kind: "card", rank });
  });

  it.each([
    ["2", "2"],
    ["3", "3"],
    ["4", "4"],
    ["5", "5"],
    ["6", "6"],
    ["7", "7"],
    ["8", "8"],
    ["9", "9"],
    ["10", "10"],
  ] as const)(
    "bare digit %s enters card %s — regression for a real recognizer returning a final transcript of a plain digit (\"2.\", \"5.\") instead of the word form",
    (digit, rank) => {
      expect(parseVoiceCommand(digit).command).toEqual({ kind: "card", rank });
      // Exactly as reported: a trailing period, stripped by normalizeTranscript.
      expect(parseVoiceCommand(`${digit}.`).command).toEqual({ kind: "card", rank });
    }
  );

  it('a bare "1" is NOT recognized as a card — only the word "one" aliases to Ace; broadening to the digit isn\'t justified by the evidence that motivated "2"/"5"', () => {
    expect(parseVoiceCommand("1").command).toBeNull();
    expect(parseVoiceCommand("one").command).toEqual({ kind: "card", rank: "A" });
  });

  it('"seat 2" (digit form) still selects Seat 2 — never confused with the bare digit-card fix, since it matches the whole-phrase fast path first', () => {
    expect(parseVoiceCommand("seat 2").command).toEqual({ kind: "select-seat", seat: 2 });
  });

  it.each([
    ["jack", "J"],
    ["queen", "Q"],
    ["king", "K"],
  ] as const)(
    "%s normalizes to rank 10, the same value CardEntryPad's own keypad produces, but keeps %s as a display-only echo of what was spoken",
    (word, displayRank) => {
      expect(parseVoiceCommand(word).command).toEqual({ kind: "card", rank: "10", displayRank });
    }
  );

  it('"one" is a bare-word alias for Ace, distinct from "seat one"', () => {
    expect(parseVoiceCommand("one").command).toEqual({ kind: "card", rank: "A" });
    expect(parseVoiceCommand("seat one").command).toEqual({ kind: "select-seat", seat: 1 });
  });
});

describe("parseVoiceCommand — observed Safari filler-word variants (card words only)", () => {
  it.each([
    ["an ace", "A", undefined],
    ["a king", "10", "K"],
    ["card ace", "A", undefined],
    ["card king", "10", "K"],
    ["a ten", "10", undefined],
    ["the ace", "A", undefined],
  ] as const)("%s -> rank %s", (phrase, rank, displayRank) => {
    expect(parseVoiceCommand(phrase).command).toEqual({
      kind: "card",
      rank,
      ...(displayRank ? { displayRank } : {}),
    });
  });

  it("is still case-insensitive and tolerates trailing punctuation with a filler prefix", () => {
    expect(parseVoiceCommand("An Ace.").command).toEqual({ kind: "card", rank: "A" });
    expect(parseVoiceCommand("A KING!").command).toEqual({ kind: "card", rank: "10", displayRank: "K" });
  });

  it("does not strip a filler prefix in front of a seat, dealer, or workflow word", () => {
    expect(parseVoiceCommand("a dealer").command).toBeNull();
    expect(parseVoiceCommand("a done").command).toBeNull();
    expect(parseVoiceCommand("a seat one").command).toBeNull();
  });

  it("the exact-prefix mechanism itself never strips more than one prefix, but the noisy-token fallback (below) still safely recovers a single clear card from the leftover words", () => {
    // "a a king": exact-match filler stripping only ever removes one literal
    // prefix ("a a king" -> "a king", which isn't a lexicon word, so that
    // mechanism gives up) — but it now falls through to the noisy-token
    // extractor, which treats both stray "a"s as ordinary noise and still
    // finds the one unambiguous card. This is the intended broadening from
    // the noisy-transcript hardening work, not a regression.
    expect(parseVoiceCommand("a a king").command).toEqual({ kind: "card", rank: "10", displayRank: "K" });
  });
});

describe("parseVoiceCommand — workflow", () => {
  it.each([
    ["done", "done"],
    ["next", "next"],
    ["undo", "undo"],
  ] as const)("%s", (word, kind) => {
    expect(parseVoiceCommand(word).command).toEqual({ kind });
  });
});

describe("parseVoiceCommand — unsupported and ambiguous input never resolves to an action", () => {
  it("an unrelated phrase parses to command: null", () => {
    expect(parseVoiceCommand("banana").command).toBeNull();
    expect(parseVoiceCommand("what's the count").command).toBeNull();
  });

  it("a target mixed with a workflow word parses to command: null rather than guessing — workflow words are deliberately excluded from noisy extraction", () => {
    // "dealer ace" is deliberately NOT covered by this test anymore — a
    // target word plus exactly one card word ("dealer king", "seat three
    // ace") is now a supported combined select+enter command; see the
    // "target + card in one utterance" describe block below.
    expect(parseVoiceCommand("seat two next").command).toBeNull();
  });

  it("an empty or whitespace-only transcript parses to command: null", () => {
    expect(parseVoiceCommand("").command).toBeNull();
    expect(parseVoiceCommand("   ").command).toBeNull();
  });

  it("this beta's explicitly out-of-scope words (wager/pause/double/etc.) parse to command: null", () => {
    for (const word of ["pause", "resume", "double", "split", "insurance", "surrender", "new shoe", "wager up"]) {
      expect(parseVoiceCommand(word).command).toBeNull();
    }
  });
});

describe("parseVoiceCommand — target + card in one utterance ('dealer king', 'seat three ace')", () => {
  it('"dealer king" selects the dealer and enters King (rank 10) in one command', () => {
    expect(parseVoiceCommand("dealer king").command).toEqual({
      kind: "card",
      rank: "10",
      displayRank: "K",
      target: { kind: "dealer" },
    });
  });

  it('"seat three ace" selects Seat 3 and enters Ace in one command', () => {
    expect(parseVoiceCommand("seat three ace").command).toEqual({
      kind: "card",
      rank: "A",
      target: { kind: "seat", seat: 3 },
    });
  });

  it('"player three five" — "player" is a recognized synonym for "seat" (see lib/terminology.ts) — selects Seat 3 and enters a 5', () => {
    expect(parseVoiceCommand("player three five").command).toEqual({
      kind: "card",
      rank: "5",
      target: { kind: "seat", seat: 3 },
    });
  });

  it('a target word with no extractable card ("dealer taylor", "seat three") is rejected rather than treated as a bare selection', () => {
    expect(parseVoiceCommand("dealer taylor").command).toBeNull();
    // "seat three" alone already matches the exact-phrase fast path as a
    // plain select-seat command — that's unchanged, pre-existing behavior,
    // not part of the noisy-token fallback this file is hardening.
    expect(parseVoiceCommand("seat three").command).toEqual({ kind: "select-seat", seat: 3 });
  });
});

describe("parseVoiceCommand — noisy real-world transcripts (captured from live diagnostics)", () => {
  it('"dealer King King": repeated words collapse to exactly one King for the dealer', () => {
    expect(parseVoiceCommand("dealer King King").command).toEqual({
      kind: "card",
      rank: "10",
      displayRank: "K",
      target: { kind: "dealer" },
    });
  });

  it('"dealer King King King": three repeats still collapse to exactly one King', () => {
    expect(parseVoiceCommand("dealer King King King").command).toEqual({
      kind: "card",
      rank: "10",
      displayRank: "K",
      target: { kind: "dealer" },
    });
  });

  it('"C1 King Ace": two genuinely DIFFERENT card values in one transcript is rejected as ambiguous, never guessed — the most important safety rule (one spoken card, never two silently-guessed CardEvents)', () => {
    expect(parseVoiceCommand("C1 King Ace").command).toBeNull();
  });

  it('"Taylor King King": leading garbage (a misheard name) is ignored; the one distinct repeated card is still extracted, applied to whatever target is already active (none was spoken)', () => {
    expect(parseVoiceCommand("Taylor King King").command).toEqual({
      kind: "card",
      rank: "10",
      displayRank: "K",
    });
  });

  it('"dealer Qing King": a garbled near-miss ("Qing") in the middle of the phrase is ignored as noise, not confused with a second distinct card', () => {
    expect(parseVoiceCommand("dealer Qing King").command).toEqual({
      kind: "card",
      rank: "10",
      displayRank: "K",
      target: { kind: "dealer" },
    });
  });

  it("an out-of-range seat number is rejected outright — it is never reinterpreted as a bare card from the leftover number word", () => {
    // Regression guard for a bug caught during hardening: "seat eight"
    // must not silently fall back to "enter card 8" just because 8 isn't a
    // valid seat number.
    expect(parseVoiceCommand("seat eight").command).toBeNull();
  });
});

describe("parseVoiceCommand — a sentence containing a card word is NOT a command (continuous natural-speech safety)", () => {
  // Real captured field transcript: with Seat 3 active, "Player bet Ace."
  // was previously ACCEPTED as a bare Ace on Seat 3 — the fallback found
  // one recognizable card token ("ace") and silently discarded "player
  // bet" as noise. A transcript containing exactly one recognizable card
  // token is not automatically a card command; see MAX_NOISE_TOKENS.
  it.each([
    "Player bet Ace.",
    "I saw an ace earlier.",
    "Seat 3 raised his bet after the five.",
    "Player raised after the ace.",
    "That guy looks like a king.",
    "I'll take five pizzas.",
  ])("%s -> command: null (zero CardEvents)", (transcript) => {
    expect(parseVoiceCommand(transcript).command).toBeNull();
  });

  it('"King Ace." (two distinct cards, no target) is rejected as ambiguous, same as any other two-different-card transcript', () => {
    expect(parseVoiceCommand("King Ace.").command).toBeNull();
  });

  it.each([
    ["King.", { kind: "card", rank: "10", displayRank: "K" }],
    ["5.", { kind: "card", rank: "5" }],
    ["Dealer King.", { kind: "card", rank: "10", displayRank: "K", target: { kind: "dealer" } }],
    ["Seat 3 Ace.", { kind: "card", rank: "A", target: { kind: "seat", seat: 3 } }],
  ] as const)("%s is still accepted — the hardening only rejects sentence structure, not legitimate structured input", (transcript, expected) => {
    expect(parseVoiceCommand(transcript).command).toEqual(expected);
  });

  it('an empty/whitespace-only transcript is command: null, same as before — VoiceControl treats this specific case as a silent no-op rather than a visible rejection', () => {
    expect(parseVoiceCommand("").command).toBeNull();
  });
});

describe('parseVoiceCommand — "spot" as a seat-prefix synonym (real casino-floor vocabulary)', () => {
  it('"spot 3" selects Seat 3, same as "seat 3"/"player 3"', () => {
    expect(parseVoiceCommand("spot 3").command).toEqual({ kind: "select-seat", seat: 3 });
  });

  it('"spot 3 ace" selects Seat 3 and enters Ace in one command', () => {
    expect(parseVoiceCommand("spot 3 ace").command).toEqual({
      kind: "card",
      rank: "A",
      target: { kind: "seat", seat: 3 },
    });
  });

  it('an out-of-range "spot" number is rejected outright, exactly like "seat eight"', () => {
    expect(parseVoiceCommand("spot eight").command).toBeNull();
  });
});

describe('parseVoiceCommand — "next seat" (deterministic alias for the existing "next" workflow command)', () => {
  it('"next seat" parses identically to bare "next" — no new seat-order behavior, just an additional trigger phrase for the existing one', () => {
    expect(parseVoiceCommand("next seat").command).toEqual({ kind: "next" });
    expect(parseVoiceCommand("Next Seat.").command).toEqual({ kind: "next" });
  });
});

describe('parseVoiceCommand — "count"/"status" (read-only spoken feedback)', () => {
  it('"count" and "status" parse to their own read-only command kinds', () => {
    expect(parseVoiceCommand("count").command).toEqual({ kind: "count" });
    expect(parseVoiceCommand("status").command).toEqual({ kind: "status" });
    expect(parseVoiceCommand("Count.").command).toEqual({ kind: "count" });
  });

  it("exact-phrase only, like every other workflow word — never extracted from a noisy sentence", () => {
    expect(parseVoiceCommand("what's the count").command).toBeNull();
    expect(parseVoiceCommand("give me a status").command).toBeNull();
  });
});

describe('parseVoiceCommand — "C<n>" normalization (a recurring Web Speech artifact for "seat n")', () => {
  it('the exact captured phrase "C1 Ace King" is rejected — C1 is correctly read as Seat 1, but Ace and King are two DIFFERENT cards, so this is the ambiguity rule, not a normalization failure', () => {
    expect(parseVoiceCommand("C1 Ace King").command).toBeNull();
  });

  it('"C1 Ace" (one card, not two) proves C1 actually resolves to Seat 1 — isolates the normalization from the separate ambiguity rule above', () => {
    expect(parseVoiceCommand("C1 Ace").command).toEqual({
      kind: "card",
      rank: "A",
      target: { kind: "seat", seat: 1 },
    });
  });

  it('a bare "C1" transcript (the alternate recognizer candidate for "seat one") selects Seat 1 via the exact-match fast path, exactly like "seat one" does', () => {
    expect(parseVoiceCommand("C1").command).toEqual({ kind: "select-seat", seat: 1 });
  });

  it('"C1" is a target token only — it can never itself become a card, in a bare transcript or alongside one', () => {
    const bare = parseVoiceCommand("C1").command;
    expect(bare?.kind).not.toBe("card");
    // "C1 five": one card ("five"), C1 as its target — not two things
    // extracted from the single "C1" token.
    expect(parseVoiceCommand("C1 five").command).toEqual({
      kind: "card",
      rank: "5",
      target: { kind: "seat", seat: 1 },
    });
  });

  it.each([2, 3, 7] as const)(
    "generalizes to other seat numbers (C%i), the same mechanical substitution as C1 — not a one-off special case",
    (seat) => {
      expect(parseVoiceCommand(`c${seat}`).command).toEqual({ kind: "select-seat", seat });
      expect(parseVoiceCommand(`c${seat} king`).command).toEqual({
        kind: "card",
        rank: "10",
        displayRank: "K",
        target: { kind: "seat", seat },
      });
    }
  );

  it("preserves the existing invalid-target safeguard: C8/C9 (outside the real 1-7 seat range) are never treated as a target, and never leak through as a card either", () => {
    // Bare "C9": no valid target, no card -> nothing to act on.
    expect(parseVoiceCommand("C9").command).toBeNull();
    // "C9 king": C9 is discarded as ordinary noise (not a recognized
    // target — unlike "seat eight", "C9" alone doesn't unambiguously
    // signal a seat-selection attempt the way the word "seat" does), so
    // the one real card still enters, just with no target attached.
    expect(parseVoiceCommand("C9 king").command).toEqual({ kind: "card", rank: "10", displayRank: "K" });
  });
});

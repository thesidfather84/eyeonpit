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

describe('EyeOnPit 1.3 — ASR normalization: "play" recognized as "player" (narrow, deterministic, never broadened)', () => {
  it('"play three has 10" -> Seat 3: 10 — the legacy-layer resolution for the single-card case (parseNarration.test.ts covers the same fix at the narration layer for multi-card utterances)', () => {
    expect(parseVoiceCommand("play three has 10").command).toEqual({
      kind: "card",
      rank: "10",
      target: { kind: "seat", seat: 3 },
    });
  });

  it('"play r2 has 5" -> Seat 2: 5 — the "play R2" compound ASR artifact for "player two"', () => {
    expect(parseVoiceCommand("play r2 has 5").command).toEqual({
      kind: "card",
      rank: "5",
      target: { kind: "seat", seat: 2 },
    });
  });

  it('a bare "play three" (no card) still resolves to plain seat selection, exactly like "player three" — the substitution applies before the exact-phrase fast path, not just the noisy fallback', () => {
    expect(parseVoiceCommand("play three").command).toEqual({ kind: "select-seat", seat: 3 });
  });

  it('"play" NOT immediately followed by a seat number is left completely untouched, never guessed as "player"', () => {
    expect(parseVoiceCommand("play").command).toBeNull();
    // "play" followed by an out-of-range r-token (r9) is also left alone.
    expect(parseVoiceCommand("play r9 has 5").command).toBeNull();
  });

  it('a bare "r2" NOT preceded by "play" is never treated as a target on its own — too ambiguous to guess', () => {
    expect(parseVoiceCommand("r2").command).toBeNull();
  });
});

describe("EyeOnPit 1.3 — SAFETY: uncertainty language rejects even a single-stray-word transcript the ordinary noise tolerance would otherwise salvage", () => {
  it.each(["maybe five", "probably king", "possibly ace", "i think five"])(
    '"%s" -> null (never entered as a card, even though it is structurally identical to the tolerated "Taylor king" misheard-name case)',
    (transcript) => {
      expect(parseVoiceCommand(transcript).command).toBeNull();
    }
  );
});

describe('EyeOnPit 1.3 — "next hand" is a natural alias for "done" (a DIFFERENT phrase and a DIFFERENT command from the existing "new hand" -> "next" alias)', () => {
  it('"next hand" -> done', () => {
    expect(parseVoiceCommand("next hand").command).toEqual({ kind: "done" });
  });

  it('"new hand" still maps to "next", proving the two phrases are not confused with each other', () => {
    expect(parseVoiceCommand("new hand").command).toEqual({ kind: "next" });
  });
});

describe('voice reliability spec §7/§16 — "start" ASR artifact for "spot", under the exact same seat-number-lookahead guard as "play"->"player"', () => {
  it('"start 3 as a 7" -> SEAT 3: 7', () => {
    expect(parseVoiceCommand("start 3 as a 7").command).toEqual({ kind: "card", rank: "7", target: { kind: "seat", seat: 3 } });
  });

  it('"start" NOT immediately followed by a seat number is left completely untouched — "start count"/"start note" (real, unrelated phrases handled separately in VoiceControl/lifecyclePhrases.ts) are never touched by this substitution', () => {
    expect(parseVoiceCommand("start").command).toBeNull();
    expect(parseVoiceCommand("start count").command).toBeNull();
    expect(parseVoiceCommand("start note").command).toBeNull();
  });
});

describe("voice reliability spec §16 — additional field-realistic regression variants", () => {
  it.each([
    ["seat one", { kind: "select-seat", seat: 1 }],
    ["spot one", { kind: "select-seat", seat: 1 }],
    ["player one", { kind: "select-seat", seat: 1 }],
    ["c1", { kind: "select-seat", seat: 1 }],
  ])('every seat-prefix synonym for seat 1 parses identically: "%s"', (transcript, expected) => {
    expect(parseVoiceCommand(transcript as string).command).toEqual(expected);
  });

  it.each([
    ["jack", "10"],
    ["queen", "10"],
    ["king", "10"],
    ["ten", "10"],
    ["10", "10"],
    ["ace", "A"],
    ["one", "A"],
  ])('card word/digit variant "%s" -> rank %s', (word, rank) => {
    const command = parseVoiceCommand(word as string).command;
    expect(command).not.toBeNull();
    expect(command).toMatchObject({ kind: "card", rank });
  });

  it.each(["qing", "kyng", "kinh"])(
    'garbled face-card near-miss "%s" alone (no target) is NOT in the lexicon and is correctly rejected — near-miss spelling only resolves inside an established card-rank slot elsewhere in the grammar, never invented wholesale',
    (word) => {
      expect(parseVoiceCommand(word).command).toBeNull();
    }
  );

  it('a genuine sentence merely containing a card word is never entered as a card: "I saw an ace earlier"', () => {
    expect(parseVoiceCommand("I saw an ace earlier").command).toBeNull();
  });

  it('a genuine sentence merely containing a card word is never entered as a card: "player bet ace"', () => {
    expect(parseVoiceCommand("player bet ace").command).toBeNull();
  });

  it('unrelated background speech never becomes a command: "Spotify is dead"', () => {
    expect(parseVoiceCommand("Spotify is dead").command).toBeNull();
  });

  it('unrelated background speech never becomes a command: "can you turn up the music"', () => {
    expect(parseVoiceCommand("can you turn up the music").command).toBeNull();
  });

  it("out-of-range seat numbers are rejected, never reinterpreted as a bare card", () => {
    expect(parseVoiceCommand("seat eight").command).toBeNull();
    expect(parseVoiceCommand("seat zero").command).toBeNull();
  });
});

describe("PC field test #1 — blackjack-specific ASR normalization (voice reliability spec §2/§16)", () => {
  it.each(["set", "seet", "ceit", "see", "cheap"])('"%s one has a 3" — recognized artifact for "seat"', (word) => {
    expect(parseVoiceCommand(`${word} one has a 3`).command).toEqual({
      kind: "card",
      rank: "3",
      target: { kind: "seat", seat: 1 },
    });
  });

  it.each(["set", "seet", "ceit", "see", "cheap"])('"%s" NOT immediately before a seat number is left untouched', (word) => {
    expect(parseVoiceCommand(word).command).toBeNull();
  });

  it('"dealer has an eighth" -> DEALER: 8 (real captured PC ASR misreading of "eight")', () => {
    expect(parseVoiceCommand("dealer has an eighth").command).toEqual({
      kind: "card",
      rank: "8",
      target: { kind: "dealer" },
    });
    expect(parseVoiceCommand("eighth").command).toEqual({ kind: "card", rank: "8" });
  });

  it('"S1"/"T5" compact letter-prefix seat tokens, symmetric with the existing "C1" artifact', () => {
    expect(parseVoiceCommand("s1").command).toEqual({ kind: "select-seat", seat: 1 });
    expect(parseVoiceCommand("t5").command).toEqual({ kind: "select-seat", seat: 5 });
    expect(parseVoiceCommand("c3").command).toEqual({ kind: "select-seat", seat: 3 });
  });

  it('"S1 9" / "T5 9" compact target+card forms', () => {
    expect(parseVoiceCommand("s1 9").command).toEqual({ kind: "card", rank: "9", target: { kind: "seat", seat: 1 } });
    expect(parseVoiceCommand("t5 9").command).toEqual({ kind: "card", rank: "9", target: { kind: "seat", seat: 5 } });
  });

  it('"seat 1:9" / "seat 1/9" — colon/slash punctuation between seat and card', () => {
    expect(parseVoiceCommand("seat 1:9").command).toEqual({ kind: "card", rank: "9", target: { kind: "seat", seat: 1 } });
    expect(parseVoiceCommand("seat 1/9").command).toEqual({ kind: "card", rank: "9", target: { kind: "seat", seat: 1 } });
  });

  it('"seat one as a king" — "as" tolerated as the existing 1-noise-token budget already allowed, unaffected by the new "as" HAND_CONNECTOR addition (that addition is narration-layer only)', () => {
    expect(parseVoiceCommand("seat one as a king").command).toEqual({
      kind: "card",
      rank: "10",
      displayRank: "K",
      target: { kind: "seat", seat: 1 },
    });
  });
});

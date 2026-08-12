import { describe, expect, it } from "vitest";
import { decomposeNumericStream, parseNarration, type NarrationOp } from "./parseNarration";
import { parseVoiceCommand } from "./parseVoiceCommand";

function cardOps(result: ReturnType<typeof parseNarration>): NarrationOp[] {
  if (result.kind !== "ops") throw new Error(`expected ops, got ${result.kind}`);
  return result.ops.filter((op) => op.kind === "card");
}

/**
 * Models exactly what VoiceControl actually does: try narration first, and
 * only when it has NO opinion (a trivial shape legacy already owns and can
 * correctly reparse on its own — e.g. "seat one five", identical to
 * "dealer king") fall through to parseVoiceCommand. Used for "every natural
 * phrasing resolves to the same target" assertions where SOME phrasings are
 * genuinely new narration capability (an extended connector/second-prefix
 * form) and others are the ordinary trivial shape that correctly defers —
 * the end-to-end guarantee is what matters, not which layer resolved it.
 */
function resolvedCard(transcript: string): { rank: string; seat: number } {
  const narration = parseNarration(transcript);
  if (narration.kind === "ops") {
    const cards = narration.ops.filter((op) => op.kind === "card");
    if (cards.length !== 1) throw new Error(`expected exactly 1 card op, got ${cards.length}`);
    const [card] = cards;
    if (card.kind !== "card" || card.target?.kind !== "seat") throw new Error("expected a seat-scoped card");
    return { rank: card.rank, seat: card.target.seat };
  }
  if (narration.kind !== "no-opinion") throw new Error(`expected no-opinion, got ${narration.kind}`);
  const legacy = parseVoiceCommand(transcript).command;
  if (legacy?.kind !== "card" || legacy.target?.kind !== "seat") throw new Error(`expected a legacy seat card, got ${JSON.stringify(legacy)}`);
  return { rank: legacy.rank, seat: legacy.target.seat };
}

describe("decomposeNumericStream — compact digit-run decomposition", () => {
  it("splits ordinary multi-digit runs into individual ranks", () => {
    expect(decomposeNumericStream("537")).toEqual(["5", "3", "7"]);
    expect(decomposeNumericStream("85")).toEqual(["8", "5"]);
  });

  it("keeps '10' as one rank, never splitting it into '1' + '0'", () => {
    expect(decomposeNumericStream("108")).toEqual(["10", "8"]);
    expect(decomposeNumericStream("810")).toEqual(["8", "10"]);
    expect(decomposeNumericStream("1010")).toEqual(["10", "10"]);
  });

  it("rejects a lone '1' not immediately followed by '0' — never guesses it means Ace", () => {
    expect(decomposeNumericStream("18")).toBeNull();
    expect(decomposeNumericStream("1")).toBeNull();
  });

  it("rejects an orphaned '0' (a '10' can never leave a trailing zero unpaired)", () => {
    expect(decomposeNumericStream("100")).toBeNull();
    expect(decomposeNumericStream("0")).toBeNull();
  });
});

describe("parseNarration — target example from the milestone brief", () => {
  it('"new hand dealer ace king seat one five three seven seat three eight five seat one hit four done" — full multi-clause narration', () => {
    const result = parseNarration(
      "new hand dealer ace king seat one five three seven seat three eight five seat one hit four done"
    );
    expect(result.kind).toBe("ops");
    if (result.kind !== "ops") return;

    expect(result.ops).toEqual([
      { kind: "workflow", action: "next" }, // "new hand"
      { kind: "selectTarget", target: { kind: "dealer" } },
      { kind: "card", target: { kind: "dealer" }, rank: "A" },
      { kind: "card", target: { kind: "dealer" }, rank: "10", displayRank: "K" },
      { kind: "selectTarget", target: { kind: "seat", seat: 1 } },
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "5" },
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "3" },
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "7" },
      { kind: "selectTarget", target: { kind: "seat", seat: 3 } },
      { kind: "card", target: { kind: "seat", seat: 3 }, rank: "8" },
      { kind: "card", target: { kind: "seat", seat: 3 }, rank: "5" },
      { kind: "selectTarget", target: { kind: "seat", seat: 1 } },
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "4" },
      { kind: "workflow", action: "done" },
    ]);
  });
});

describe("parseNarration — required test A: dealer king ace", () => {
  it("exactly 2 dealer card ops, in order", () => {
    const cards = cardOps(parseNarration("dealer king ace"));
    expect(cards).toEqual([
      { kind: "card", target: { kind: "dealer" }, rank: "10", displayRank: "K" },
      { kind: "card", target: { kind: "dealer" }, rank: "A" },
    ]);
  });
});

describe("parseNarration — required test B: seat one five three seven", () => {
  it("exactly 3 seat-1 card ops, in order", () => {
    const cards = cardOps(parseNarration("seat one five three seven"));
    expect(cards).toEqual([
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "5" },
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "3" },
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "7" },
    ]);
  });
});

describe("parseNarration — required test C: C3 85", () => {
  it("Seat 3: 8, 5 — the C<n> recognizer artifact as a narration target, and a compact digit run decomposed", () => {
    const cards = cardOps(parseNarration("C3 85"));
    expect(cards).toEqual([
      { kind: "card", target: { kind: "seat", seat: 3 }, rank: "8" },
      { kind: "card", target: { kind: "seat", seat: 3 }, rank: "5" },
    ]);
  });
});

describe("parseNarration — required test D: multi-target ordered narration", () => {
  it('"dealer king ace seat one five three seven seat two eight five" produces correct ordered CardEvents across all targets', () => {
    const cards = cardOps(parseNarration("dealer king ace seat one five three seven seat two eight five"));
    expect(cards).toEqual([
      { kind: "card", target: { kind: "dealer" }, rank: "10", displayRank: "K" },
      { kind: "card", target: { kind: "dealer" }, rank: "A" },
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "5" },
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "3" },
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "7" },
      { kind: "card", target: { kind: "seat", seat: 2 }, rank: "8" },
      { kind: "card", target: { kind: "seat", seat: 2 }, rank: "5" },
    ]);
  });
});

describe("parseNarration — required test E: new hand ... done", () => {
  it('"new hand dealer ace king seat one four five seat two three five nine done" — complete narration with workflow boundaries', () => {
    const result = parseNarration(
      "new hand dealer ace king seat one four five seat two three five nine done"
    );
    expect(result.kind).toBe("ops");
    if (result.kind !== "ops") return;
    const cards = result.ops.filter((op) => op.kind === "card");
    const workflow = result.ops.filter((op) => op.kind === "workflow");

    expect(workflow).toEqual([
      { kind: "workflow", action: "next" },
      { kind: "workflow", action: "done" },
    ]);
    expect(cards).toEqual([
      { kind: "card", target: { kind: "dealer" }, rank: "A" },
      { kind: "card", target: { kind: "dealer" }, rank: "10", displayRank: "K" },
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "4" },
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "5" },
      { kind: "card", target: { kind: "seat", seat: 2 }, rank: "3" },
      { kind: "card", target: { kind: "seat", seat: 2 }, rank: "5" },
      { kind: "card", target: { kind: "seat", seat: 2 }, rank: "9" },
    ]);
  });
});

describe("parseNarration — required test F/G: casino observations and ordinary conversation never become cards", () => {
  it.each([
    "seat three raised his bet after the five",
    "player looks like he is counting",
    "seat five lowered his bet",
    "that guy looks like a king",
    "I ordered five pizzas",
  ])("%s -> reject, zero card ops", (transcript) => {
    const result = parseNarration(transcript);
    expect(result.kind).toBe("reject");
  });
});

describe("parseNarration — SAFETY: a bare unscoped card with ANY surrounding unrecognized word is never salvaged (regression for the 'Team 5' fallthrough)", () => {
  // Real captured transcript, previously identified as dangerous: exactly
  // one non-filler stray word ("team") plus one rank word ("5") sat right at
  // the boundary the old design tolerated (MAX_NOISE_TOKENS = 1), and
  // narration was deferring it to legacy's own equally-tolerant noisy-token
  // fallback — which independently salvaged it as a Seat/no-target card.
  // "team" is not a target, not filler, not a rank; the fact that it merely
  // fits the tolerance built for a misheard proper noun ("Taylor king") is
  // exactly the ambiguity that must resolve to reject, never a guess.
  it.each(["Team 5", "team five", "I said five", "I saw an ace earlier", "player bet ace"])(
    "%s -> reject, ZERO CardEvents",
    (transcript) => {
      const result = parseNarration(transcript);
      expect(result.kind).toBe("reject");
    }
  );

  // The other half of the same boundary: a genuinely CLEAN bare card — zero
  // surrounding noise, not even one stray word — is exactly what the legacy
  // single-command parser already owns, and must keep working exactly as
  // before. This is what distinguishes "5" (valid) from "Team 5" (rejected):
  // the presence of a surrounding word, not the rank itself.
  it.each(["5", "five", "king", "ace"])("%s -> no-opinion (clean bare card, defers to legacy unchanged)", (transcript) => {
    expect(parseNarration(transcript).kind).toBe("no-opinion");
  });
});

describe("parseNarration — required test H: malformed narration commits zero, never a valid prefix", () => {
  it('"dealer king ace seat nine five" rejects the WHOLE utterance — the valid "dealer king ace" prefix is not partially committed', () => {
    const result = parseNarration("dealer king ace seat nine five");
    expect(result.kind).toBe("reject");
  });

  it('"dealer king ace seat one 18" rejects the whole utterance — an undecomposable digit run anywhere invalidates the entire narration', () => {
    const result = parseNarration("dealer king ace seat one 18");
    expect(result.kind).toBe("reject");
  });
});

describe("parseNarration — real captured transcripts (§10), explicitly defined results", () => {
  it('"dealer King Ace" -> Dealer K, A (two cards — an explicit target makes sequential distinct ranks unambiguous)', () => {
    expect(cardOps(parseNarration("dealer King Ace"))).toEqual([
      { kind: "card", target: { kind: "dealer" }, rank: "10", displayRank: "K" },
      { kind: "card", target: { kind: "dealer" }, rank: "A" },
    ]);
  });

  it('"C1 Ace King" -> Seat 1 A, K (two cards) — redefined from the old single-command parser\'s "reject as ambiguous" behavior now that an explicit target is present', () => {
    expect(cardOps(parseNarration("C1 Ace King"))).toEqual([
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "A" },
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "10", displayRank: "K" },
    ]);
  });

  it('"Seat one ace king" -> Seat 1 A, K (two cards)', () => {
    expect(cardOps(parseNarration("Seat one ace king"))).toEqual([
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "A" },
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "10", displayRank: "K" },
    ]);
  });

  it('"C3 85" -> Seat 3: 8, 5', () => {
    expect(cardOps(parseNarration("C3 85"))).toEqual([
      { kind: "card", target: { kind: "seat", seat: 3 }, rank: "8" },
      { kind: "card", target: { kind: "seat", seat: 3 }, rank: "5" },
    ]);
  });

  it('"seat 135" -> reject — genuinely ambiguous (135 is not a valid seat number, and nothing proves a safe segmentation), never guessed as seat 1 + card 35 or any other reading', () => {
    expect(parseNarration("seat 135").kind).toBe("reject");
  });

  it('"Player bet Ace" -> reject, zero cards (preserved from the single-command parser\'s existing behavior)', () => {
    expect(parseNarration("Player bet Ace").kind).toBe("reject");
  });

  it('"Team 5" -> reject, ZERO CardEvents (real captured transcript, previously identified as dangerous) — a bare unscoped card with ANY surrounding unrecognized word must never be salvaged, whether by narration itself or by deferring to legacy\'s own noise-tolerant fallback (which independently would have extracted "5" as a card). Narration only defers a bare card to legacy when the whole utterance is clean; "team" is not filler, not a target, not a rank — the fact that it merely fits within the old tolerance built for a misheard proper noun ("Taylor king") is exactly the unsafe fallthrough this closes', () => {
    expect(parseNarration("Team 5").kind).toBe("reject");
  });

  it('"I said seat 5 not" -> reject — multiple stray words ("I", "said", "not") exceed the noise tolerance regardless of the seemingly-valid "seat 5" in the middle', () => {
    expect(parseNarration("I said seat 5 not").kind).toBe("reject");
  });

  it("a blank/whitespace-only transcript -> no-opinion, not a rejection (VoiceControl treats this as a silent no-op upstream; the parser itself must never show it as a wrong guess)", () => {
    expect(parseNarration("").kind).toBe("no-opinion");
    expect(parseNarration("   ").kind).toBe("no-opinion");
  });
});

describe('parseNarration — SAFETY: a card spoken BEFORE any target is established must never resolve against whatever happens to be currently active, once the same utterance goes on to name a real target ("Three active seat five" must never become DEALER: 3)', () => {
  it.each([
    "three active seat five",
    "three active spot five",
    "three active player five",
    "five active seat two",
  ])("%s -> reject, never a guessed target for the earlier card", (transcript) => {
    expect(parseNarration(transcript).kind).toBe("reject");
  });

  it('a target established FIRST, with cards after it, is completely unaffected ("dealer king ace" still works)', () => {
    expect(cardOps(parseNarration("dealer king ace"))).toEqual([
      { kind: "card", target: { kind: "dealer" }, rank: "10", displayRank: "K" },
      { kind: "card", target: { kind: "dealer" }, rank: "A" },
    ]);
  });

  it('a bare card with no target ANYWHERE in the utterance still defers to legacy unchanged ("five" alone)', () => {
    expect(parseNarration("five").kind).toBe("no-opinion");
  });
});

describe("parseNarration — no-opinion defers to the legacy single-command parser", () => {
  it.each(["count", "status", "banana"])(
    "%s -> no-opinion (none of narration's vocabulary appears at all)",
    (transcript) => {
      expect(parseNarration(transcript).kind).toBe("no-opinion");
    }
  );

  it('"next seat" is itself valid narration vocabulary ("next" is a recognized workflow word, "seat" trailing with nothing after it is tolerated stray noise) — a bare single workflow op is exactly the legacy exact-phrase alias\'s own job (it already maps this exact phrase to "next"), so narration defers to it rather than duplicating the result via a second path', () => {
    expect(parseNarration("next seat").kind).toBe("no-opinion");
  });
});

describe("parseNarration — unscoped ambiguity (§4): no target anywhere in the utterance", () => {
  it('"king ace" with no target at all -> reject (still conservative, exactly like the old single-command parser)', () => {
    expect(parseNarration("king ace").kind).toBe("reject");
  });

  it('a single unscoped rank ("king") is never ambiguous — only 2+ DISTINCT unscoped ranks are — but a bare single card is exactly what the legacy single-command grammar already handles, so narration defers to it (no-opinion) rather than duplicating that path', () => {
    expect(parseNarration("king").kind).toBe("no-opinion");
  });

  it("an unscoped compact digit run (2+ digits, no target) is rejected outright — it inherently proposes multiple cards with nowhere established to put them", () => {
    expect(parseNarration("85").kind).toBe("reject");
  });
});

describe("parseNarration — ASR stutter protection (adjacent-repeat collapse)", () => {
  it('"dealer king king king" collapses to exactly one king, scoped or not — one target plus one resulting card is exactly the legacy grammar\'s own combined-command shape (which independently proves the identical collapse — see parseVoiceCommand.test.ts), so narration defers to it here', () => {
    expect(parseNarration("dealer king king king").kind).toBe("no-opinion");
  });

  it('"king king" with no target collapses to one king (not an ambiguous two-distinct-rank rejection) — and, being a single bare card once collapsed, defers to the legacy parser exactly like a single "king" does', () => {
    expect(parseNarration("king king").kind).toBe("no-opinion");
  });

  it("non-adjacent repeats of the same rank for the same target are NOT collapsed — real hands can have duplicate ranks", () => {
    expect(cardOps(parseNarration("seat one five three five"))).toEqual([
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "5" },
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "3" },
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "5" },
    ]);
  });
});

describe("parseNarration — hit is a recognized filler; production has no discrete Hit action", () => {
  it('"seat one hit four" -> target Seat 1, then card 4 (hit itself produces no separate op) — this exact one-target-one-card shape is also exactly what the legacy grammar already handles (tolerating "hit" as its one stray word), so narration defers to it rather than duplicating the same result via a second path', () => {
    expect(parseNarration("seat one hit four").kind).toBe("no-opinion");
  });

  it('"seat one hit four five" -> target Seat 1, cards 4 and 5 — TWO cards after "hit" is genuinely new capability the legacy grammar cannot represent (it would reject two distinct ranks as ambiguous), so narration handles this one directly', () => {
    const result = parseNarration("seat one hit four five");
    expect(result.kind).toBe("ops");
    if (result.kind !== "ops") return;
    expect(result.ops).toEqual([
      { kind: "selectTarget", target: { kind: "seat", seat: 1 } },
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "4" },
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "5" },
    ]);
  });
});

describe("parseNarration — inert-but-recognized action vocabulary never trips noise rejection", () => {
  it.each(["stand", "double", "split", "surrender", "insurance"])(
    "seat two %s does not reject the narration, but produces no mutation from the action word itself",
    (action) => {
      const result = parseNarration(`seat two ${action}`);
      expect(result.kind).toBe("ops");
      if (result.kind !== "ops") return;
      expect(result.ops).toEqual([{ kind: "selectTarget", target: { kind: "seat", seat: 2 } }]);
    }
  );
});

describe("parseNarration — REAL DEVICE FIX: natural hand connectors inside an established target/card-entry context", () => {
  it('"dealer has a king and an ace" -> Dealer K, A', () => {
    expect(cardOps(parseNarration("dealer has a king and an ace"))).toEqual([
      { kind: "card", target: { kind: "dealer" }, rank: "10", displayRank: "K" },
      { kind: "card", target: { kind: "dealer" }, rank: "A" },
    ]);
  });

  it('"spot 3 has a 5 and a 7" -> Seat 3: 5, 7 (real captured transcript that was previously rejected)', () => {
    const result = parseNarration("spot 3 has a 5 and a 7");
    expect(result.kind).toBe("ops");
    expect(cardOps(result)).toEqual([
      { kind: "card", target: { kind: "seat", seat: 3 }, rank: "5" },
      { kind: "card", target: { kind: "seat", seat: 3 }, rank: "7" },
    ]);
  });

  it('"player 2 has 4 8 6" -> Seat 2: 4, 8, 6', () => {
    expect(cardOps(parseNarration("player 2 has 4 8 6"))).toEqual([
      { kind: "card", target: { kind: "seat", seat: 2 }, rank: "4" },
      { kind: "card", target: { kind: "seat", seat: 2 }, rank: "8" },
      { kind: "card", target: { kind: "seat", seat: 2 }, rank: "6" },
    ]);
  });

  it('"C5 has an ace C5 has a three" -> Seat 5: A, 3 (repeated same-target mention mid-utterance does not end its scope, and the trailing safety check above does not misfire on a target established BEFORE every card)', () => {
    expect(cardOps(parseNarration("C5 has an ace C5 has a three"))).toEqual([
      { kind: "card", target: { kind: "seat", seat: 5 }, rank: "A" },
      { kind: "card", target: { kind: "seat", seat: 5 }, rank: "3" },
    ]);
  });

  it('"player 2 has 4 8" -> Seat 2: 4, 8', () => {
    expect(cardOps(parseNarration("player 2 has 4 8"))).toEqual([
      { kind: "card", target: { kind: "seat", seat: 2 }, rank: "4" },
      { kind: "card", target: { kind: "seat", seat: 2 }, rank: "8" },
    ]);
  });

  it('"seat one has king ace" -> Seat 1: K, A', () => {
    expect(cardOps(parseNarration("seat one has king ace"))).toEqual([
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "10", displayRank: "K" },
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "A" },
    ]);
  });

  it("connector words are gated on an established target — plain unscoped conversation is unaffected", () => {
    // Same safety examples as the F/G describe block above, re-verified
    // specifically against the new connector vocabulary: none of these
    // ever establish a target, so "has"/"and"/etc. inside them still count
    // as ordinary noise exactly as before, not free connector grammar.
    expect(parseNarration("I ordered five pizzas").kind).toBe("reject");
    expect(parseNarration("seat three raised his bet after the five").kind).toBe("reject");
    expect(parseNarration("that guy has a king tattoo").kind).toBe("reject");
  });
});

describe("parseNarration — REAL DEVICE FIX: natural leading-seat shorthand (number + connector at clause start)", () => {
  it('"one has king ace" -> Seat 1: K, A', () => {
    expect(cardOps(parseNarration("one has king ace"))).toEqual([
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "10", displayRank: "K" },
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "A" },
    ]);
  });

  it('"one has a king and an ace" -> Seat 1: K, A (real captured transcript that was previously rejected)', () => {
    const result = parseNarration("one has a king and an ace");
    expect(result.kind).toBe("ops");
    expect(cardOps(result)).toEqual([
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "10", displayRank: "K" },
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "A" },
    ]);
  });

  it('"2 has 5 7" -> Seat 2: 5, 7 (digit form)', () => {
    expect(cardOps(parseNarration("2 has 5 7"))).toEqual([
      { kind: "card", target: { kind: "seat", seat: 2 }, rank: "5" },
      { kind: "card", target: { kind: "seat", seat: 2 }, rank: "7" },
    ]);
  });

  it('"three has a 4 and an 8" -> Seat 3: 4, 8', () => {
    expect(cardOps(parseNarration("three has a 4 and an 8"))).toEqual([
      { kind: "card", target: { kind: "seat", seat: 3 }, rank: "4" },
      { kind: "card", target: { kind: "seat", seat: 3 }, rank: "8" },
    ]);
  });

  it("a bare number NOT followed by a connector is still just a card, never a seat guess", () => {
    // "I have one five three seven" -> "one" is followed by "five", not a
    // connector, so it stays the Ace it always was; multiple distinct
    // unscoped ranks plus several stray words rejects exactly as before.
    expect(parseNarration("I have one five three seven").kind).toBe("reject");
  });

  it("the shorthand never fires mid-hand — a number arriving after a target is already established is an ordinary scoped card, not a new seat", () => {
    // "dealer king ace one" — "one" here is Ace for the DEALER (a third
    // card), not a switch to Seat 1, because currentTarget is already set
    // when "one" is reached; the shorthand is gated on `!currentTarget`.
    expect(cardOps(parseNarration("dealer king ace one"))).toEqual([
      { kind: "card", target: { kind: "dealer" }, rank: "10", displayRank: "K" },
      { kind: "card", target: { kind: "dealer" }, rank: "A" },
      { kind: "card", target: { kind: "dealer" }, rank: "A" },
    ]);
  });
});

describe("EyeOnPit 1.3 — natural seat/player/spot phrasing, including a natural connector between the prefix and the number", () => {
  it.each([
    ["player one has a seven", 1, "7"],
    ["spot one has a seven", 1, "7"],
    ["seat one has a seven", 1, "7"],
    ["the player in seat one has a seven", 1, "7"],
    ["the player at seat one has a seven", 1, "7"],
    ["player at spot one has a seven", 1, "7"],
    ["player seat one has a seven", 1, "7"],
  ] as const)('"%s" -> Seat %i: %s — every natural phrasing resolves to the identical target (some via narration directly, the plain forms via legacy deferral — see resolvedCard)', (transcript, seat, rank) => {
    expect(resolvedCard(transcript)).toEqual({ seat, rank });
  });

  it('the base "seat one"/"spot one"/"player one" forms defer to legacy (no-opinion) exactly like before; only the CONNECTOR/second-prefix forms are genuinely new narration capability', () => {
    expect(parseNarration("player one has a seven").kind).toBe("no-opinion");
    expect(parseNarration("the player in seat one has a seven").kind).toBe("ops");
  });

  it('"the player in seat one" ALONE (no card) is a bare target-selection op, exactly like "seat one" — never deferred to legacy (which has no grammar for the extended form)', () => {
    const result = parseNarration("the player in seat one");
    expect(result.kind).toBe("ops");
    if (result.kind !== "ops") return;
    expect(result.ops).toEqual([{ kind: "selectTarget", target: { kind: "seat", seat: 1 } }]);
  });
});

describe("EyeOnPit 1.3 — multi-target narration: multiple explicit players (and the dealer) in ONE utterance, spoken order preserved", () => {
  it('"Player one has a seven, player three has a five." -> S1: 7, S3: 5 — every card lands on its OWN clause\'s target, never inherited across the comma boundary', () => {
    const result = parseNarration("Player one has a seven, player three has a five.");
    expect(result.kind).toBe("ops");
    if (result.kind !== "ops") return;
    expect(result.ops).toEqual([
      { kind: "selectTarget", target: { kind: "seat", seat: 1 } },
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "7" },
      { kind: "selectTarget", target: { kind: "seat", seat: 3 } },
      { kind: "card", target: { kind: "seat", seat: 3 }, rank: "5" },
    ]);
  });

  it('"Spot one has a seven, spot three has a five, dealer has an ace." -> S1: 7, S3: 5, DEALER: A — three distinct targets, dealer mixed in, all in spoken order', () => {
    const result = parseNarration("Spot one has a seven, spot three has a five, dealer has an ace.");
    expect(result.kind).toBe("ops");
    if (result.kind !== "ops") return;
    expect(result.ops).toEqual([
      { kind: "selectTarget", target: { kind: "seat", seat: 1 } },
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "7" },
      { kind: "selectTarget", target: { kind: "seat", seat: 3 } },
      { kind: "card", target: { kind: "seat", seat: 3 }, rank: "5" },
      { kind: "selectTarget", target: { kind: "dealer" } },
      { kind: "card", target: { kind: "dealer" }, rank: "A" },
    ]);
  });
});

describe("EyeOnPit 1.3 — repeated same-target narration: two clauses naming the SAME player must merge, not reject", () => {
  it('"Player three has a five, player three has a king." -> S3: 5 K', () => {
    expect(cardOps(parseNarration("Player three has a five, player three has a king."))).toEqual([
      { kind: "card", target: { kind: "seat", seat: 3 }, rank: "5" },
      { kind: "card", target: { kind: "seat", seat: 3 }, rank: "10", displayRank: "K" },
    ]);
  });

  it('"Seat four has a five, seat four has a king." -> S4: 5 K', () => {
    expect(cardOps(parseNarration("Seat four has a five, seat four has a king."))).toEqual([
      { kind: "card", target: { kind: "seat", seat: 4 }, rank: "5" },
      { kind: "card", target: { kind: "seat", seat: 4 }, rank: "10", displayRank: "K" },
    ]);
  });

  it('"S3 has a 5 S3 has a king" (the equivalent already-working C-token form) still works — proves the comma-tokenization fix, not the C-token path, is what closes this gap', () => {
    expect(cardOps(parseNarration("C3 has a 5 C3 has a king"))).toEqual([
      { kind: "card", target: { kind: "seat", seat: 3 }, rank: "5" },
      { kind: "card", target: { kind: "seat", seat: 3 }, rank: "10", displayRank: "K" },
    ]);
  });
});

describe("EyeOnPit 1.3 — SAFETY: uncertainty language is an immediate hard rejection, never merely traded off against the noise-token cap", () => {
  it.each([
    "maybe player one has a three",
    "maybe player one has a three and a five",
    "dealer should have busted",
    "for ten minutes dealer has a ten",
    "he probably has a five",
    "possibly seat one has a king",
    "perhaps dealer has an ace",
    "i think player one has a five",
  ])('"%s" -> reject, zero CardEvents', (transcript) => {
    expect(parseNarration(transcript).kind).toBe("reject");
  });

  it("uncertainty language is rejected even when it would otherwise fit the ordinary 1-stray-word noise tolerance", () => {
    // "maybe five" is structurally identical, at the token level, to the
    // tolerated "Taylor king" misheard-name case (exactly one stray word
    // alongside a real card word) — the explicit uncertainty check is what
    // keeps this from silently entering a card.
    expect(parseNarration("maybe five").kind).toBe("reject");
  });
});

describe("EyeOnPit 1.3 — leading-seat-shorthand + exactly ONE card (a form legacy cannot reparse) is handled directly, never lost to a bad deferral", () => {
  it('"three has a ten" -> Seat 3: 10 — previously lost (narration deferred to legacy as if it were the plain "seat three ten" shape, but legacy has no shorthand grammar at all and rejected it)', () => {
    expect(cardOps(parseNarration("three has a ten"))).toEqual([{ kind: "card", target: { kind: "seat", seat: 3 }, rank: "10" }]);
  });

  it('"one has a king" -> Seat 1: K', () => {
    expect(cardOps(parseNarration("one has a king"))).toEqual([
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "10", displayRank: "K" },
    ]);
  });
});

describe('EyeOnPit 1.3 — ASR normalization: "play" recognized in place of "player" immediately before a valid seat number', () => {
  it('"play three has a five and a king" -> Seat 3: 5, K — two distinct cards force narration to handle it directly (not deferred to legacy), proving the "play"->"player" substitution is visible to narration\'s own grammar, not just legacy\'s', () => {
    expect(cardOps(parseNarration("play three has a five and a king"))).toEqual([
      { kind: "card", target: { kind: "seat", seat: 3 }, rank: "5" },
      { kind: "card", target: { kind: "seat", seat: 3 }, rank: "10", displayRank: "K" },
    ]);
  });

  it('"play three has 10" (a single card) resolves to the same 2-op shape "player three has 10" always has, so narration correctly defers — see parseVoiceCommand.test.ts for the legacy-layer assertion that actually enters the card', () => {
    expect(parseNarration("play three has 10").kind).toBe("no-opinion");
    expect(parseNarration("player three has 10").kind).toBe("no-opinion");
  });

  it('"play" NOT immediately followed by a seat number is left completely untouched — never guessed as "player"', () => {
    // "play" here isn't adjacent to a seat number at all, so it stays
    // ordinary unrecognized noise, same as before this normalization existed.
    expect(parseNarration("let's play a hand dealer has a five").kind).toBe("reject");
  });
});

describe('EyeOnPit 1.3 — natural target-activation wording: "active seat one" / "seat one active"', () => {
  it('"active seat one" -> a bare target-selection op for Seat 1 (the stray "active" word is recognized vocabulary, never counted as noise)', () => {
    const result = parseNarration("active seat one");
    expect(result.kind).toBe("ops");
    if (result.kind !== "ops") return;
    expect(result.ops).toEqual([{ kind: "selectTarget", target: { kind: "seat", seat: 1 } }]);
  });

  it('"seat one active" -> the same bare target-selection op for Seat 1', () => {
    const result = parseNarration("seat one active");
    expect(result.kind).toBe("ops");
    if (result.kind !== "ops") return;
    expect(result.ops).toEqual([{ kind: "selectTarget", target: { kind: "seat", seat: 1 } }]);
  });
});

describe('EyeOnPit 1.3 — "next hand" is a natural alias for "done" (NOT "next") — see parseVoiceCommand.ts\'s WORKFLOW_WORDS doc comment for the product rationale', () => {
  it('"dealer king ace next hand" -> a "done" workflow op after the dealer\'s cards, not "next"', () => {
    const result = parseNarration("dealer king ace next hand");
    expect(result.kind).toBe("ops");
    if (result.kind !== "ops") return;
    expect(result.ops).toEqual([
      { kind: "selectTarget", target: { kind: "dealer" } },
      { kind: "card", target: { kind: "dealer" }, rank: "10", displayRank: "K" },
      { kind: "card", target: { kind: "dealer" }, rank: "A" },
      { kind: "workflow", action: "done" },
    ]);
  });
});

describe("EyeOnPit 1.3 — unrelated conversation and ordinary observation still reject, unaffected by the extended grammar", () => {
  it.each([
    "seat three raised his bet after the five",
    "player looks like he is counting",
    "the player in the corner is annoyed",
    "player bet the ace",
    "I saw the player at the bar",
  ])('"%s" -> reject, zero card ops', (transcript) => {
    expect(parseNarration(transcript).kind).toBe("reject");
  });
});

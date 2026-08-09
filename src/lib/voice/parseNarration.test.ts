import { describe, expect, it } from "vitest";
import { decomposeNumericStream, parseNarration, type NarrationOp } from "./parseNarration";

function cardOps(result: ReturnType<typeof parseNarration>): NarrationOp[] {
  if (result.kind !== "ops") throw new Error(`expected ops, got ${result.kind}`);
  return result.ops.filter((op) => op.kind === "card");
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

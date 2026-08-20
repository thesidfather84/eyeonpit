// @vitest-environment node
//
// PC VOICE FIELD TEST #2 — permanent regression corpus (PRIORITY 13). Every
// real transcript listed in the Field Test #2 remediation brief, both the
// ACCEPT/RECOVER cases the new grammar must now handle and the REJECT/
// SAFETY cases that must remain refused exactly as before. Tests the pure
// classification/parsing layer directly (classifyVoiceTranscript,
// parseNarration, tryDealerConfusionRecovery, parseTableChangeCommand,
// parseSetActiveTargetIntent, resolveAlternatives) — the same layer
// VoiceControl.tsx's own handleFinalResult dispatches from, and the same
// style already established by classifyVoiceTranscript.test.ts/
// parseNarration.test.ts. No React rendering needed for these; the full
// end-to-end wiring (commitNarration, dispatch, CardEvent writes) is
// already covered by VoiceControl.test.tsx and OperatorLoop.e2e.test.tsx.
import { describe, expect, it } from "vitest";
import { classifyVoiceTranscript, tryDealerConfusionRecovery } from "./classifyVoiceTranscript";
import { parseNarration } from "./parseNarration";
import { parseTableChangeCommand } from "./parseTableChangeCommand";
import { parseSetActiveTargetIntent } from "./parseSetActiveTargetIntent";
import { resolveAlternatives } from "./nBestResolver";

describe("Field Test #2 — ACCEPT/RECOVER", () => {
  it('"Taylor has a 10" -> Dealer 10', () => {
    const recovered = tryDealerConfusionRecovery("Taylor has a 10");
    expect(recovered?.valid).toBe(true);
    expect(recovered?.valid && recovered.narrationOps).toEqual([
      { kind: "selectTarget", target: { kind: "dealer" } },
      { kind: "card", target: { kind: "dealer" }, rank: "10" },
    ]);
  });

  it('"Taylor has an eight" with a genuine "dealer has an eight" N-best alternative resolves to Dealer 8 via ordinary agreement, no recovery grammar needed', () => {
    const result = resolveAlternatives([
      { transcript: "Taylor has an eight", confidence: 0.6 },
      { transcript: "dealer has an eight", confidence: 0.4 },
    ]);
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    const winner = result.alternatives[result.winnerIndex];
    expect(winner.transcript).toBe("dealer has an eight");
    expect(winner.classification.valid && winner.classification.summary).toBe("DEALER:8");
  });

  it('"Spotify has a five and a king" -> Dealer 5, K — the multi-card dealer-confusion recovery extension', () => {
    const recovered = tryDealerConfusionRecovery("Spotify has a five and a king");
    expect(recovered?.valid).toBe(true);
    expect(recovered?.valid && recovered.recoveryRuleId).toBe("DEALER_ASR_SPOTIFY");
    expect(recovered?.valid && recovered.narrationOps).toEqual([
      { kind: "selectTarget", target: { kind: "dealer" } },
      { kind: "card", target: { kind: "dealer" }, rank: "5" },
      { kind: "card", target: { kind: "dealer" }, rank: "10", displayRank: "K" },
    ]);
  });

  it('"spot one has a 10 and a 6" -> Spot 1: 10, 6', () => {
    const result = parseNarration("spot one has a 10 and a 6");
    expect(result.kind).toBe("ops");
    expect(result.kind === "ops" && result.ops).toEqual([
      { kind: "selectTarget", target: { kind: "seat", seat: 1 } },
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "10" },
      { kind: "card", target: { kind: "seat", seat: 1 }, rank: "6" },
    ]);
  });

  it('"play sat down on spot one" -> table-change recovery (Spot 1 sat down)', () => {
    expect(parseTableChangeCommand("play sat down on spot one")).toEqual({ kind: "seat-joins", seat: 1 });
  });

  it('"play your spot one left" -> table-change recovery (Spot 1 left)', () => {
    expect(parseTableChangeCommand("play your spot one left")).toEqual({ kind: "seat-leaves", seat: 1 });
  });

  it('"new player at spot six" -> table-change recovery (Spot 6 sat down)', () => {
    expect(parseTableChangeCommand("new player at spot six")).toEqual({ kind: "seat-joins", seat: 6 });
  });

  it('"player sat down at spot one" -> table-change recovery (Spot 1 sat down)', () => {
    expect(parseTableChangeCommand("player sat down at spot one")).toEqual({ kind: "seat-joins", seat: 1 });
  });

  it('"play your 7 has a four" -> Spot 7: 4', () => {
    const result = classifyVoiceTranscript("play your 7 has a four");
    expect(result.valid).toBe(true);
    expect(result.valid && result.summary).toBe("SEAT7:4");
  });

  it('"current player is spot one" -> sets Active Spot 1, creates NO CardEvent', () => {
    const intent = parseSetActiveTargetIntent("current player is spot one");
    expect(intent).toEqual({ target: { kind: "seat", seat: 1 } });

    const classification = classifyVoiceTranscript("current player is spot one");
    expect(classification.valid).toBe(true);
    expect(classification.valid && classification.source).toBe("set-active-target");
    expect(classification.valid && classification.narrationOps).toEqual([
      { kind: "selectTarget", target: { kind: "seat", seat: 1 } },
    ]);
  });

  it.each(["watching spot one", "i'm on spot one", "player is at spot one", "current spot is spot one"])(
    '"%s" also sets Active Spot 1, no CardEvent',
    (transcript) => {
      expect(parseSetActiveTargetIntent(transcript)).toEqual({ target: { kind: "seat", seat: 1 } });
    }
  );

  it('Active-target continuation: "has a 10 and a 3" with a live active target -> Spot resolves against it, 10 then 3 (allowUnscopedContinuation)', () => {
    const withoutFlag = parseNarration("has a 10 and a 3");
    expect(withoutFlag.kind).toBe("reject"); // never relaxed by default — see the flag's own doc comment

    const withFlag = parseNarration("has a 10 and a 3", { allowUnscopedContinuation: true });
    expect(withFlag.kind).toBe("ops");
    expect(withFlag.kind === "ops" && withFlag.ops).toEqual([
      { kind: "card", rank: "10" },
      { kind: "card", rank: "3" },
    ]);
  });

  it('Active-target continuation: "gets a five" (dealer example) already worked before this priority and still does', () => {
    const result = parseNarration("gets a five", { allowUnscopedContinuation: true });
    expect(result.kind).toBe("no-opinion"); // single bare card — legacy already handles this
  });

  it('Connector ASR variant: "has a 10 in a 3" ("in" recognized as "and") -> two cards, same active-target continuation', () => {
    const result = parseNarration("has a 10 in a 3", { allowUnscopedContinuation: true });
    expect(result.kind).toBe("ops");
    expect(result.kind === "ops" && result.ops).toEqual([
      { kind: "card", rank: "10" },
      { kind: "card", rank: "3" },
    ]);
  });

  it('"spot one stands spot 3 hits gets a 3" -> ordered compound operations: select Spot 1 (stand, inert), select Spot 3 (hit, inert), Spot 3 gets a 3', () => {
    const result = parseNarration("spot one stands spot 3 hits gets a 3");
    expect(result.kind).toBe("ops");
    expect(result.kind === "ops" && result.ops).toEqual([
      { kind: "selectTarget", target: { kind: "seat", seat: 1 } },
      { kind: "selectTarget", target: { kind: "seat", seat: 3 } },
      { kind: "card", target: { kind: "seat", seat: 3 }, rank: "3" },
    ]);
  });

  it('"dealer gets a five next hand" -> Dealer 5, then a Done/"next hand" workflow op', () => {
    const result = parseNarration("dealer gets a five next hand");
    expect(result.kind).toBe("ops");
    expect(result.kind === "ops" && result.ops).toEqual([
      { kind: "selectTarget", target: { kind: "dealer" } },
      { kind: "card", target: { kind: "dealer" }, rank: "5" },
      { kind: "workflow", action: "done" },
    ]);
  });
});

describe("Field Test #2 — REJECT/SAFETY (must remain refused, exactly as before)", () => {
  it.each([
    "Spotify is dead",
    "deactivate Spotify",
    "Taylor called me",
    "play music",
    "play your favorite song",
    "everyone has lunch",
  ])('"%s" -> unrecovered / no command', (transcript) => {
    expect(tryDealerConfusionRecovery(transcript)).toBeNull();
    const classification = classifyVoiceTranscript(transcript);
    expect(classification.valid).toBe(false);
  });

  it('"at 3:55 and spot 6" -> rejected outright, never a card', () => {
    const classification = classifyVoiceTranscript("at 3:55 and spot 6");
    expect(classification.valid).toBe(false);
  });

  it('"3:55" alone -> rejected outright, never a card', () => {
    const classification = classifyVoiceTranscript("3:55");
    expect(classification.valid).toBe(false);
  });

  it.each(["5:00", "1/8", "3/5"])('numeric/time-shaped "%s" alone -> rejected outright, never a card', (transcript) => {
    const classification = classifyVoiceTranscript(transcript);
    expect(classification.valid).toBe(false);
  });

  it('numeric/time safety holds even WITH an active target already established: "spot 6 has a 3:55" never decomposes "55" into two extra cards', () => {
    const result = parseNarration("spot 6 has a 3:55");
    expect(result.kind).toBe("reject");
  });

  it('"king ace" with no target and no connector grammar at all -> still rejected, even with allowUnscopedContinuation on — genuine connector structure is required, not just a live active target', () => {
    const result = parseNarration("king ace", { allowUnscopedContinuation: true });
    expect(result.kind).toBe("reject");
  });

  it('random normal conversation -> rejected, zero commands', () => {
    for (const transcript of ["I ordered five pizzas", "the game was fun tonight", "let's take a break"]) {
      expect(classifyVoiceTranscript(transcript).valid).toBe(false);
    }
  });
});

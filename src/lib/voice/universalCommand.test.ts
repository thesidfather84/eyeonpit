import { describe, expect, it } from "vitest";
import { classifyVoiceTranscript } from "./classifyVoiceTranscript";
import { mapClassificationToUniversalCommand, verdictWouldProduceCardEvent } from "./universalCommand";

function classify(transcript: string) {
  return classifyVoiceTranscript(transcript, true, true);
}

describe("mapClassificationToUniversalCommand — the 7 Native Voice Prototype phrases", () => {
  it("Dealer has a five. -> DEAL_CARD(dealer, 5)", () => {
    const v = mapClassificationToUniversalCommand(classify("Dealer has a five."));
    expect(v).toEqual({ verdict: "ACCEPT", commands: [{ op: "DEAL_CARD", target: { kind: "dealer" }, rank: "5" }] });
  });

  it("Dealer has a king. -> DEAL_CARD(dealer, 10)", () => {
    const v = mapClassificationToUniversalCommand(classify("Dealer has a king."));
    expect(v).toEqual({ verdict: "ACCEPT", commands: [{ op: "DEAL_CARD", target: { kind: "dealer" }, rank: "10" }] });
  });

  it("Player one has a five. -> DEAL_CARD(seat 1, 5)", () => {
    const v = mapClassificationToUniversalCommand(classify("Player one has a five."));
    expect(v).toEqual({ verdict: "ACCEPT", commands: [{ op: "DEAL_CARD", target: { kind: "seat", seat: 1 }, rank: "5" }] });
  });

  it("Player three has a king. -> DEAL_CARD(seat 3, 10)", () => {
    const v = mapClassificationToUniversalCommand(classify("Player three has a king."));
    expect(v).toEqual({ verdict: "ACCEPT", commands: [{ op: "DEAL_CARD", target: { kind: "seat", seat: 3 }, rank: "10" }] });
  });

  it("Player three hits. -> SELECT_TARGET(seat 3) — HIT stays implicit, never fabricated (see universalCommand.ts's own KNOWN DEVIATION doc comment)", () => {
    const v = mapClassificationToUniversalCommand(classify("Player three hits."));
    expect(v).toEqual({ verdict: "ACCEPT", commands: [{ op: "SELECT_TARGET", target: { kind: "seat", seat: 3 } }] });
    expect(verdictWouldProduceCardEvent(v)).toBe(false);
  });

  it("Start count. -> COUNT_CONTROL(START)", () => {
    const v = mapClassificationToUniversalCommand(classify("Start count."));
    expect(v).toEqual({ verdict: "ACCEPT", commands: [{ op: "COUNT_CONTROL", action: "START" }] });
  });

  it("End count. -> COUNT_CONTROL(PAUSE) — real existing production alias, not the brief's literal 'END' (not in the locked spec §3 action union)", () => {
    const v = mapClassificationToUniversalCommand(classify("End count."));
    expect(v).toEqual({ verdict: "ACCEPT", commands: [{ op: "COUNT_CONTROL", action: "PAUSE" }] });
  });

  it("every DEAL_CARD-producing phrase maps to exactly one CardEvent-worthy command", () => {
    for (const phrase of ["Dealer has a five.", "Dealer has a king.", "Player one has a five.", "Player three has a king."]) {
      const v = mapClassificationToUniversalCommand(classify(phrase));
      expect(v.verdict).toBe("ACCEPT");
      expect(verdictWouldProduceCardEvent(v)).toBe(true);
      if (v.verdict === "ACCEPT") {
        expect(v.commands.filter((c) => c.op === "DEAL_CARD")).toHaveLength(1);
      }
    }
  });
});

describe("mapClassificationToUniversalCommand — safety: REPEAT vs REJECT bucketing, never guesses", () => {
  it("an out-of-range/unrecognized seat number (target ambiguity) is REPEAT, never a silent guess — 'nine' isn't a recognized 1-7 seat word (see parseVoiceCommand.ts's SEAT_NUMBER_BY_WORD), so narration correctly can't resolve a target at all", () => {
    const v = mapClassificationToUniversalCommand(classify("player nine has a five"));
    expect(v.verdict).toBe("REPEAT");
    if (v.verdict !== "ACCEPT") expect(v.code).toBe("INCOMPLETE_NARRATION");
    expect(verdictWouldProduceCardEvent(v)).toBe(false);
  });

  it("a dangling connector with no rank is REPEAT, never downgraded to a bare target-select", () => {
    const v = mapClassificationToUniversalCommand(classify("player five has a"));
    expect(v.verdict).toBe("REPEAT");
    expect(verdictWouldProduceCardEvent(v)).toBe(false);
  });

  it("completely unrelated speech is REJECT, not REPEAT", () => {
    const v = mapClassificationToUniversalCommand(classify("Spotify is dead"));
    expect(v.verdict).toBe("REJECT");
    if (v.verdict !== "ACCEPT") expect(v.code).toBe("UNKNOWN_COMMAND");
    expect(verdictWouldProduceCardEvent(v)).toBe(false);
  });

  it("an empty transcript (no speech) is REJECT, never a fabricated command", () => {
    const v = mapClassificationToUniversalCommand(classify(""));
    expect(v.verdict).toBe("REJECT");
    if (v.verdict !== "ACCEPT") expect(v.code).toBe("EMPTY_TRANSCRIPT");
    expect(verdictWouldProduceCardEvent(v)).toBe(false);
  });

  it("a bare card with no explicit target (the 'active' sentinel) is REPEAT, never guessed against unknown live state", () => {
    const v = mapClassificationToUniversalCommand(classify("seven"));
    expect(v.verdict).toBe("REPEAT");
    expect(verdictWouldProduceCardEvent(v)).toBe(false);
  });
});

describe("mapClassificationToUniversalCommand — other real command sources, described not invented", () => {
  it("a workflow word maps to the matching op", () => {
    expect(mapClassificationToUniversalCommand(classify("undo"))).toEqual({ verdict: "ACCEPT", commands: [{ op: "HAND_UNDO" }] });
  });

  it("'next hand' — a documented alias for Done, not Next (see voiceBenchmarkCorpus.ts's own 'next-hand' entry) — maps to HAND_DONE, not HAND_NEXT", () => {
    expect(mapClassificationToUniversalCommand(classify("next hand"))).toEqual({ verdict: "ACCEPT", commands: [{ op: "HAND_DONE" }] });
  });

  it("a read-only count query maps to COUNT_QUERY", () => {
    const v = mapClassificationToUniversalCommand(classify("full status"));
    expect(v).toEqual({ verdict: "ACCEPT", commands: [{ op: "COUNT_QUERY", kind: "STATUS" }] });
  });

  it("a table-change phrase maps to PLAYER_ENTER, never a CardEvent", () => {
    const v = mapClassificationToUniversalCommand(classify("players that down at spot three"));
    expect(v.verdict).toBe("ACCEPT");
    expect(verdictWouldProduceCardEvent(v)).toBe(false);
  });
});

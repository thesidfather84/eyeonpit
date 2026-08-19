import { describe, expect, it } from "vitest";
import { classifyVoiceTranscript } from "./classifyVoiceTranscript";

describe("classifyVoiceTranscript — pure per-alternative classification used by nBestResolver.ts", () => {
  it("classifies a blank transcript as EMPTY_TRANSCRIPT", () => {
    const c = classifyVoiceTranscript("   ");
    expect(c.valid).toBe(false);
    if (!c.valid) expect(c.code).toBe("EMPTY_TRANSCRIPT");
  });

  it("classifies unrelated speech as UNKNOWN_COMMAND", () => {
    const c = classifyVoiceTranscript("Spotify is dead");
    expect(c.valid).toBe(false);
    if (!c.valid) expect(c.code).toBe("UNKNOWN_COMMAND");
  });

  it("classifies uncertainty language as UNCERTAIN_LANGUAGE, not INCOMPLETE_NARRATION", () => {
    const c = classifyVoiceTranscript("maybe player one has a three");
    expect(c.valid).toBe(false);
    if (!c.valid) expect(c.code).toBe("UNCERTAIN_LANGUAGE");
  });

  it("classifies a valid dealer+card narration with an explicit target", () => {
    const c = classifyVoiceTranscript("dealer king");
    expect(c.valid).toBe(true);
    if (c.valid) {
      expect(c.hasExplicitTarget).toBe(true);
      expect(c.actionKey).toBe("C:DEALER:10");
    }
  });

  it("classifies a bare card with no target as valid but NOT explicit-target", () => {
    const c = classifyVoiceTranscript("king");
    expect(c.valid).toBe(true);
    if (c.valid) expect(c.hasExplicitTarget).toBe(false);
  });

  it("two different-but-equivalent phrasings of the same action produce the SAME actionKey (agreement detection)", () => {
    const a = classifyVoiceTranscript("dealer king");
    const b = classifyVoiceTranscript("dealer has a king");
    expect(a.valid && b.valid).toBe(true);
    if (a.valid && b.valid) expect(a.actionKey).toBe(b.actionKey);
  });

  it("classifies lifecycle phrases", () => {
    const c = classifyVoiceTranscript("new shoe");
    expect(c.valid).toBe(true);
    if (c.valid) expect(c.source).toBe("lifecycle");
  });

  it("classifies table-change phrases", () => {
    const c = classifyVoiceTranscript("spot six sat down");
    expect(c.valid).toBe(true);
    if (c.valid) expect(c.source).toBe("table-change");
  });

  it("classifies read-only queries", () => {
    const c = classifyVoiceTranscript("what is the count");
    expect(c.valid).toBe(true);
    if (c.valid) expect(c.source).toBe("read-only-query");
  });

  it("classifies note-start phrases", () => {
    const c = classifyVoiceTranscript("start note");
    expect(c.valid).toBe(true);
    if (c.valid) expect(c.source).toBe("note-start");
  });
});

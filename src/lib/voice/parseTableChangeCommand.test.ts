import { describe, expect, it } from "vitest";
import { parseTableChangeCommand } from "./parseTableChangeCommand";

describe("parseTableChangeCommand — a player sitting down", () => {
  it.each([
    ["spot 6 sat down", 6],
    ["seat 6 sat down", 6],
    ["player 6 sat down", 6],
    ["spot six sat down", 6],
    ["spot 1 sat down", 1],
  ])("%s -> seat-joins seat %i", (transcript, seat) => {
    expect(parseTableChangeCommand(transcript)).toEqual({ kind: "seat-joins", seat });
  });

  it.each([
    ["player at spot 6", 6],
    ["player at seat 6", 6],
    ["player at 6", 6],
    ["player at spot six", 6],
  ])("%s -> seat-joins seat %i", (transcript, seat) => {
    expect(parseTableChangeCommand(transcript)).toEqual({ kind: "seat-joins", seat });
  });
});

describe("parseTableChangeCommand — a player leaving", () => {
  it.each([
    ["spot 1 left", 1],
    ["seat 1 left", 1],
    ["player 1 left", 1],
    ["spot one left", 1],
  ])("%s -> seat-leaves seat %i", (transcript, seat) => {
    expect(parseTableChangeCommand(transcript)).toEqual({ kind: "seat-leaves", seat });
  });
});

describe("parseTableChangeCommand — rejects malformed or out-of-range attempts rather than guessing", () => {
  it.each([
    "spot eight sat down", // out of range (1-7)
    "spot 8 left",
    "spot sat down", // no number at all
    "banana 6 sat down", // not a seat-prefix word
    "player at spot", // no number
    "player at banana",
    "seat two raised his bet after the five", // ordinary conversation
    "",
    "sat down",
    "left",
  ])("%s -> null", (transcript) => {
    expect(parseTableChangeCommand(transcript)).toBeNull();
  });
});

describe("parseTableChangeCommand — never fires on ordinary card/target vocabulary it doesn't own", () => {
  it.each(["seat six", "spot six", "dealer", "king", "seat one five three seven"])(
    "%s -> null (owned by parseVoiceCommand/parseNarration instead)",
    (transcript) => {
      expect(parseTableChangeCommand(transcript)).toBeNull();
    }
  );

  it('a PLAIN "player six" (no "sat down"/"left", no connector) is also owned by select-seat, never intercepted as a join — even though "player at spot six" bare IS a join', () => {
    expect(parseTableChangeCommand("player six")).toBeNull();
  });
});

describe("EyeOnPit 1.3 — natural extended target phrasing", () => {
  it.each([
    ["player seat one left the table", 1],
    ["player seat six left the table", 6],
  ] as const)('"%s" -> seat-leaves seat %i', (transcript, seat) => {
    expect(parseTableChangeCommand(transcript)).toEqual({ kind: "seat-leaves", seat });
  });

  it('"player seat one left" (no trailing "the table") also works', () => {
    expect(parseTableChangeCommand("player seat one left")).toEqual({ kind: "seat-leaves", seat: 1 });
  });

  it('"player seat six sat down" -> seat-joins seat 6 (the second-prefix form, join direction)', () => {
    expect(parseTableChangeCommand("player seat six sat down")).toEqual({ kind: "seat-joins", seat: 6 });
  });

  it('"the player in seat one left the table" is NOT recognized — this module requires the FIRST token to be a seat-prefix word itself (no leading "the"), unlike parseNarration\'s more tolerant grammar; the phrase still resolves correctly through narration/legacy for card entry, just not as a table-change event', () => {
    expect(parseTableChangeCommand("the player in seat one left the table")).toBeNull();
  });

  it("play six sat down -> seat-joins seat 6 (the same ASR play->player normalization applies here too)", () => {
    expect(parseTableChangeCommand("play six sat down")).toEqual({ kind: "seat-joins", seat: 6 });
  });
});

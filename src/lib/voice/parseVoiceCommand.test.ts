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

  it.each(["jack", "queen", "king"])("%s normalizes to rank 10, the same value CardEntryPad's own keypad produces", (word) => {
    expect(parseVoiceCommand(word).command).toEqual({ kind: "card", rank: "10" });
  });

  it('"one" is a bare-word alias for Ace, distinct from "seat one"', () => {
    expect(parseVoiceCommand("one").command).toEqual({ kind: "card", rank: "A" });
    expect(parseVoiceCommand("seat one").command).toEqual({ kind: "select-seat", seat: 1 });
  });
});

describe("parseVoiceCommand — observed Safari filler-word variants (card words only)", () => {
  it.each([
    ["an ace", "A"],
    ["a king", "10"],
    ["card ace", "A"],
    ["card king", "10"],
    ["a ten", "10"],
    ["the ace", "A"],
  ] as const)("%s -> rank %s", (phrase, rank) => {
    expect(parseVoiceCommand(phrase).command).toEqual({ kind: "card", rank });
  });

  it("is still case-insensitive and tolerates trailing punctuation with a filler prefix", () => {
    expect(parseVoiceCommand("An Ace.").command).toEqual({ kind: "card", rank: "A" });
    expect(parseVoiceCommand("A KING!").command).toEqual({ kind: "card", rank: "10" });
  });

  it("does not strip a filler prefix in front of a seat, dealer, or workflow word", () => {
    expect(parseVoiceCommand("a dealer").command).toBeNull();
    expect(parseVoiceCommand("a done").command).toBeNull();
    expect(parseVoiceCommand("a seat one").command).toBeNull();
  });

  it("does not strip more than one filler prefix", () => {
    expect(parseVoiceCommand("a a king").command).toBeNull();
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

  it("a multi-command phrase parses to command: null rather than guessing", () => {
    expect(parseVoiceCommand("seat two next").command).toBeNull();
    expect(parseVoiceCommand("dealer ace").command).toBeNull();
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

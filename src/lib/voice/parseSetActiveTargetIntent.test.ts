// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseSetActiveTargetIntent } from "./parseSetActiveTargetIntent";

describe("parseSetActiveTargetIntent", () => {
  it.each([
    "current player is spot one",
    "current spot is spot one",
    "current seat is spot one",
    "player is at spot one",
    "i am on spot one",
    "i'm on spot one",
    "im on spot one",
    "watching spot one",
  ])('"%s" -> Spot 1, no card', (transcript) => {
    expect(parseSetActiveTargetIntent(transcript)).toEqual({ target: { kind: "seat", seat: 1 } });
  });

  it("recognizes dealer too", () => {
    expect(parseSetActiveTargetIntent("watching dealer")).toEqual({ target: { kind: "dealer" } });
  });

  it("accepts seat/player synonyms after the prefix, not just spot", () => {
    expect(parseSetActiveTargetIntent("watching seat two")).toEqual({ target: { kind: "seat", seat: 2 } });
    expect(parseSetActiveTargetIntent("watching player three")).toEqual({ target: { kind: "seat", seat: 3 } });
  });

  it.each([
    "watching",
    "watching the game",
    "watching spot one closely",
    "current player is",
    "current player is spot eight", // out of range
    "player watching spot one", // not a recognized leading phrase
    "spot one", // a bare target — NOT this intent's grammar, handled elsewhere (parseVoiceCommand's SEAT_PHRASES)
    "I ordered five pizzas",
  ])('"%s" -> null, never guessed', (transcript) => {
    expect(parseSetActiveTargetIntent(transcript)).toBeNull();
  });
});

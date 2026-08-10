import { describe, expect, it } from "vitest";
import { parseReadOnlyQuery } from "./parseReadOnlyQuery";
import { normalizeTranscript } from "./normalizeTranscript";

/** Runs the raw (pre-normalization) transcript through the exact same normalizeTranscript() step VoiceControl.handleFinalResult uses, matching real recognizer casing/trailing punctuation. */
function parse(raw: string) {
  return parseReadOnlyQuery(normalizeTranscript(raw));
}

describe("parseReadOnlyQuery — real captured-log regressions (the phrases that were previously REJECTED on a real iPhone)", () => {
  it.each([
    ["what is the count", { kind: "status" }],
    ["what is the KO", { kind: "system", system: "KO" }],
    ["what is the Zen", { kind: "system", system: "Zen" }],
    ["what is the Omega", { kind: "system", system: "Omega II" }],
    ["Aces", { kind: "aces" }],
    ["repeat", { kind: "repeat" }],
  ] as const)('"%s" is recognized as a read-only query', (phrase, expected) => {
    expect(parse(phrase)).toEqual(expected);
  });

  it('"status" (already working) still resolves to the same status intent as "what is the count"', () => {
    expect(parse("status")).toEqual({ kind: "status" });
    expect(parse("what is the count")).toEqual({ kind: "status" });
  });
});

describe("parseReadOnlyQuery — natural count/status phrasing (section 2)", () => {
  it.each([
    "Status",
    "Count",
    "What is the count?",
    "What's the count?",
    "Whats the count?",
    "Give me the count.",
    "Tell me the count.",
    "Current count.",
    "Where is the count?",
  ])('"%s" -> status intent', (phrase) => {
    expect(parse(phrase)).toEqual({ kind: "status" });
  });
});

describe("parseReadOnlyQuery — specific counting-system questions (section 3)", () => {
  it.each([
    ["What is the Hi-Lo?", "Hi-Lo"],
    ["Hi-Lo?", "Hi-Lo"],
    ["What's Hi-Lo?", "Hi-Lo"],
    ["What is the KO?", "KO"],
    ["KO?", "KO"],
    ["What's KO?", "KO"],
    ["What is the Zen?", "Zen"],
    ["Zen?", "Zen"],
    ["What is the Omega?", "Omega II"],
    ["Omega?", "Omega II"],
    ["Omega two?", "Omega II"],
  ] as const)('"%s" -> %s running count', (phrase, system) => {
    expect(parse(phrase)).toEqual({ kind: "system", system });
  });
});

describe("parseReadOnlyQuery — RC/TC questions (section 4)", () => {
  it.each(["Running count?", "What is the running count?", "RC?"])('"%s" -> rc intent', (phrase) => {
    expect(parse(phrase)).toEqual({ kind: "rc" });
  });

  it.each(["True count?", "What is the true count?", "TC?"])('"%s" -> tc intent', (phrase) => {
    expect(parse(phrase)).toEqual({ kind: "tc" });
  });
});

describe("parseReadOnlyQuery — Aces/Decks questions (section 5)", () => {
  it.each(["Aces?", "How many aces?", "Aces seen?"])('"%s" -> aces intent', (phrase) => {
    expect(parse(phrase)).toEqual({ kind: "aces" });
  });

  it.each(["Decks?", "Decks remaining?", "How many decks left?"])('"%s" -> decks intent', (phrase) => {
    expect(parse(phrase)).toEqual({ kind: "decks" });
  });
});

describe("parseReadOnlyQuery — safety: natural flexibility must never leak into mutation vocabulary (section 9)", () => {
  it.each([
    "What is the five?", // must NOT be read as "enter a 5" — and must not match any read-only query either
    "I ordered five pizzas",
    "Player has a five",
    "dealer king five", // real narration — must defer to the narration parser, not be swallowed here
    "seat one",
    "done",
    "next",
    "undo",
  ])('"%s" is NOT a read-only query (returns null, defers to narration/legacy parsing)', (phrase) => {
    expect(parse(phrase)).toBeNull();
  });
});

describe("parseReadOnlyQuery — unknown general chat stays rejected (section 10)", () => {
  it.each(["information", "hello", "text"])('"%s" is NOT a read-only query', (phrase) => {
    expect(parse(phrase)).toBeNull();
  });
});

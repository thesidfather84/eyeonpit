import { describe, expect, it } from "vitest";
import { formatNarrationConfirmation, type ConfirmationEntry } from "./narrationConfirmation";

describe("formatNarrationConfirmation", () => {
  it('renders the milestone brief\'s own example shape: "DEALER: K A · S1: 5 3 7 · S3: 8 5"', () => {
    const entries: ConfirmationEntry[] = [
      { kind: "card", target: { kind: "dealer" }, displayRank: "K" },
      { kind: "card", target: { kind: "dealer" }, displayRank: "A" },
      { kind: "card", target: { kind: "seat", seat: 1 }, displayRank: "5" },
      { kind: "card", target: { kind: "seat", seat: 1 }, displayRank: "3" },
      { kind: "card", target: { kind: "seat", seat: 1 }, displayRank: "7" },
      { kind: "card", target: { kind: "seat", seat: 3 }, displayRank: "8" },
      { kind: "card", target: { kind: "seat", seat: 3 }, displayRank: "5" },
    ];
    expect(formatNarrationConfirmation(entries)).toBe("DEALER: K A · S1: 5 3 7 · S3: 8 5");
  });

  it("keeps workflow entries in their true sequence position — a leading/trailing boundary, not folded into an adjacent card group", () => {
    const entries: ConfirmationEntry[] = [
      { kind: "workflow", action: "next" },
      { kind: "card", target: { kind: "dealer" }, displayRank: "A" },
      { kind: "card", target: { kind: "seat", seat: 1 }, displayRank: "4" },
      { kind: "workflow", action: "done" },
    ];
    expect(formatNarrationConfirmation(entries)).toBe("NEXT · DEALER: A · S1: 4 · DONE");
  });

  it("never merges two non-adjacent groups for the same target across an intervening different target", () => {
    const entries: ConfirmationEntry[] = [
      { kind: "card", target: { kind: "seat", seat: 3 }, displayRank: "8" },
      { kind: "card", target: { kind: "seat", seat: 3 }, displayRank: "5" },
      { kind: "card", target: { kind: "seat", seat: 1 }, displayRank: "4" },
      { kind: "card", target: { kind: "seat", seat: 3 }, displayRank: "2" },
    ];
    expect(formatNarrationConfirmation(entries)).toBe("S3: 8 5 · S1: 4 · S3: 2");
  });
});

import { describe, expect, it } from "vitest";
import { formatNarrationConfirmation, type ConfirmationEntry } from "./narrationConfirmation";

describe("formatNarrationConfirmation", () => {
  it('renders the milestone brief\'s own example shape: "DEALER: K A · SPOT 1: 5 3 7 · SPOT 3: 8 5"', () => {
    const entries: ConfirmationEntry[] = [
      { kind: "card", targetLabel: "DEALER", displayRank: "K" },
      { kind: "card", targetLabel: "DEALER", displayRank: "A" },
      { kind: "card", targetLabel: "SPOT 1", displayRank: "5" },
      { kind: "card", targetLabel: "SPOT 1", displayRank: "3" },
      { kind: "card", targetLabel: "SPOT 1", displayRank: "7" },
      { kind: "card", targetLabel: "SPOT 3", displayRank: "8" },
      { kind: "card", targetLabel: "SPOT 3", displayRank: "5" },
    ];
    expect(formatNarrationConfirmation(entries)).toBe("DEALER: K A · SPOT 1: 5 3 7 · SPOT 3: 8 5");
  });

  it("keeps workflow entries in their true sequence position — a leading/trailing boundary, not folded into an adjacent card group", () => {
    const entries: ConfirmationEntry[] = [
      { kind: "workflow", action: "next" },
      { kind: "card", targetLabel: "DEALER", displayRank: "A" },
      { kind: "card", targetLabel: "SPOT 1", displayRank: "4" },
      { kind: "workflow", action: "done" },
    ];
    expect(formatNarrationConfirmation(entries)).toBe("NEXT · DEALER: A · SPOT 1: 4 · DONE");
  });

  it("never merges two non-adjacent groups for the same target across an intervening different target", () => {
    const entries: ConfirmationEntry[] = [
      { kind: "card", targetLabel: "SPOT 3", displayRank: "8" },
      { kind: "card", targetLabel: "SPOT 3", displayRank: "5" },
      { kind: "card", targetLabel: "SPOT 1", displayRank: "4" },
      { kind: "card", targetLabel: "SPOT 3", displayRank: "2" },
    ];
    expect(formatNarrationConfirmation(entries)).toBe("SPOT 3: 8 5 · SPOT 1: 4 · SPOT 3: 2");
  });

  it("EyeOnPit 1.10 Phase 6 — a split-hand target label (e.g. from confirmationLabelFor) renders exactly as given, distinguishing Hand 1 from Hand 2 in the same slot-merging way an ordinary seat label does", () => {
    const entries: ConfirmationEntry[] = [
      { kind: "card", targetLabel: "SPOT 3 HAND 2", displayRank: "5" },
      { kind: "card", targetLabel: "SPOT 3 HAND 2", displayRank: "K" },
      { kind: "card", targetLabel: "SPOT 3 HAND 1", displayRank: "7" },
    ];
    expect(formatNarrationConfirmation(entries)).toBe("SPOT 3 HAND 2: 5 K · SPOT 3 HAND 1: 7");
  });
});

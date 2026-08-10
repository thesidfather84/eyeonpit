// @vitest-environment jsdom
//
// Regression coverage for requirement #3 of the count-reliability/Floor
// audio-feedback milestone: Done (tap OR voice — see useRoundControls'
// own doc comment, this is the ONE handler both paths call) speaks a
// concise count summary once the round has ACTUALLY completed, never
// before, and never when Done was blocked. VoiceControl's own tests cover
// the voice "done" path; this file drives the real tap path through
// RoundControlsRow, since both share the exact same handleDone.
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvestigationProvider } from "@/contexts/InvestigationContext";
import { addCardToRound } from "@/lib/db/repositories/cardEvents";
import { createInvestigation } from "@/lib/db/repositories/investigations";
import { useSettingsStore } from "@/store/useSettingsStore";
import { RoundControlsRow } from "./RoundControlsRow";

class MockSpeechSynthesisUtterance {
  lang = "";
  constructor(public text: string) {}
}

const mockSpeechSynthesis = { cancel: vi.fn(), speak: vi.fn() };

beforeEach(() => {
  mockSpeechSynthesis.cancel.mockClear();
  mockSpeechSynthesis.speak.mockClear();
  (window as unknown as { speechSynthesis?: unknown }).speechSynthesis = mockSpeechSynthesis;
  (window as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance =
    MockSpeechSynthesisUtterance;
});

afterEach(() => {
  delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
  delete (window as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance;
  useSettingsStore.getState().setVoiceAudioFeedback(true);
  useSettingsStore.getState().setFloorSpokenCountContent("hiloRc");
});

async function freshInvestigationId(): Promise<string> {
  const inv = await createInvestigation({
    casino: "",
    tableNumber: "",
    dealerName: "",
    investigationDate: "2026-08-10",
    operatorName: "",
    countingSystem: "Hi-Lo",
    shoeTotalDecks: 6,
    status: "active",
  });
  return inv.localId;
}

/** No occupied seats + a dealer card is the minimal state canCompleteRound allows Done for. */
async function makeCompletableRound(rank: "2" | "10" = "10") {
  const inv = await createInvestigation({
    casino: "",
    tableNumber: "",
    dealerName: "",
    investigationDate: "2026-08-10",
    operatorName: "",
    countingSystem: "Hi-Lo",
    shoeTotalDecks: 6,
    status: "active",
  });
  const round = inv.rounds[0];
  await addCardToRound({
    investigationLocalId: inv.localId,
    roundId: round.id,
    targetType: "dealer",
    targetId: "dealer",
    rank,
    applyToRound: (r) => ({ ...r, dealerHand: { cards: [...r.dealerHand.cards, { rank, suit: "unspecified" }] } }),
    event: { type: "card", message: `Dealer: ${rank}` },
  });
  return inv.localId;
}

describe("RoundControlsRow — Done spoken feedback (tap path)", () => {
  it("tapping Done on a completable round speaks the count summary AFTER the round actually completes", async () => {
    const investigationId = await makeCompletableRound("10");
    render(
      <InvestigationProvider investigationId={investigationId}>
        <RoundControlsRow />
      </InvestigationProvider>
    );

    const doneButton = await screen.findByRole("button", { name: "Done — complete this round" });
    await waitFor(() => expect((doneButton as HTMLButtonElement).disabled).toBe(false));
    await act(async () => {
      doneButton.click();
    });

    await waitFor(() => expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1));
    const spoken = mockSpeechSynthesis.speak.mock.calls[0][0] as MockSpeechSynthesisUtterance;
    expect(spoken.text).toBe("Hi-Lo -1.");
  });

  it("a BLOCKED Done (round not completable) never speaks — no misleading count for a hand that didn't finish", async () => {
    const investigationId = await freshInvestigationId(); // no dealer cards -> not completable
    render(
      <InvestigationProvider investigationId={investigationId}>
        <RoundControlsRow />
      </InvestigationProvider>
    );

    const doneButton = await screen.findByRole("button", { name: "Done — complete this round" });
    expect((doneButton as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      doneButton.click();
    });

    expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
  });

  it('floorSpokenCountContent "off" -> the round still completes, but nothing is spoken', async () => {
    useSettingsStore.getState().setFloorSpokenCountContent("off");
    const investigationId = await makeCompletableRound("2");
    render(
      <InvestigationProvider investigationId={investigationId}>
        <RoundControlsRow />
      </InvestigationProvider>
    );

    const doneButton = await screen.findByRole("button", { name: "Done — complete this round" });
    await waitFor(() => expect((doneButton as HTMLButtonElement).disabled).toBe(false));
    await act(async () => {
      doneButton.click();
    });

    await waitFor(() => expect(doneButton.getAttribute("disabled")).not.toBeNull());
    expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
  });

  it("voiceAudioFeedback off (master switch) -> the round still completes, but nothing is spoken", async () => {
    useSettingsStore.getState().setVoiceAudioFeedback(false);
    const investigationId = await makeCompletableRound("2");
    render(
      <InvestigationProvider investigationId={investigationId}>
        <RoundControlsRow />
      </InvestigationProvider>
    );

    const doneButton = await screen.findByRole("button", { name: "Done — complete this round" });
    await waitFor(() => expect((doneButton as HTMLButtonElement).disabled).toBe(false));
    await act(async () => {
      doneButton.click();
    });

    await waitFor(() => expect(doneButton.getAttribute("disabled")).not.toBeNull());
    expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
  });
});

describe("RoundControlsRow — Undo spoken feedback (tap path)", () => {
  it("tapping Undo speaks the POST-undo count, not the stale pre-undo one", async () => {
    // Dealer 10 -> Hi-Lo -1; undoing it must speak the count AFTER
    // reversal (0), never the -1 that was true before the undo ran.
    const investigationId = await makeCompletableRound("10");
    render(
      <InvestigationProvider investigationId={investigationId}>
        <RoundControlsRow />
      </InvestigationProvider>
    );

    const undoButton = await screen.findByRole("button", { name: /Undo/ });
    await waitFor(() => expect((undoButton as HTMLButtonElement).disabled).toBe(false));
    await act(async () => {
      undoButton.click();
    });

    await waitFor(() => expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1));
    const spoken = mockSpeechSynthesis.speak.mock.calls[0][0] as MockSpeechSynthesisUtterance;
    expect(spoken.text).toBe("Undone. Hi-Lo 0.");
  });

  it("a BLOCKED Undo (nothing to undo) never speaks", async () => {
    const investigationId = await freshInvestigationId(); // no cards, nothing undoable
    render(
      <InvestigationProvider investigationId={investigationId}>
        <RoundControlsRow />
      </InvestigationProvider>
    );

    const undoButton = await screen.findByRole("button", { name: /Undo/ });
    expect((undoButton as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      undoButton.click();
    });

    expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
  });

  it('floorSpokenCountContent "off" -> undo still reverses the card, but nothing is spoken', async () => {
    useSettingsStore.getState().setFloorSpokenCountContent("off");
    const investigationId = await makeCompletableRound("2");
    render(
      <InvestigationProvider investigationId={investigationId}>
        <RoundControlsRow />
      </InvestigationProvider>
    );

    const undoButton = await screen.findByRole("button", { name: /Undo/ });
    await waitFor(() => expect((undoButton as HTMLButtonElement).disabled).toBe(false));
    await act(async () => {
      undoButton.click();
    });

    await waitFor(() => expect((undoButton as HTMLButtonElement).disabled).toBe(true));
    expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
  });
});

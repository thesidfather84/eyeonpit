// @vitest-environment jsdom
//
// EyeOnPit 1.10 Phase 4 — voice Split/Double commands. Same harness pattern
// as VoiceControl.test.tsx (jsdom has no real SpeechRecognition, so a small
// mock constructor drives onresult directly) — kept as its own file rather
// than appended to that already-huge one, following this session's own
// Phase 3 precedent (SplitHandUX.test.tsx).
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvestigationProvider, useInvestigationContext } from "@/contexts/InvestigationContext";
import {
  createInvestigation,
  occupySeat,
  splitSeat,
  updateSeatBet,
  getInvestigation,
} from "@/lib/db/repositories/investigations";
import { getCardEventsForInvestigation } from "@/lib/db/repositories/cardEvents";
import { resetLastSpokenText } from "@/lib/voice/speechOutput";
import { CountSummaryPanel } from "./CountSummaryPanel";
import { VoiceControl } from "./VoiceControl";

interface MockAlternative {
  transcript: string;
  confidence: number;
}

class MockSpeechRecognition {
  static instances: MockSpeechRecognition[] = [];
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  lang = "";
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;
  onaudiostart: (() => void) | null = null;
  onsoundstart: (() => void) | null = null;
  onspeechstart: (() => void) | null = null;
  onspeechend: (() => void) | null = null;
  onsoundend: (() => void) | null = null;
  onaudioend: (() => void) | null = null;

  constructor() {
    MockSpeechRecognition.instances.push(this);
  }
  start() {
    this.onstart?.();
  }
  stop() {
    this.onend?.();
  }
  abort() {
    this.onend?.();
  }

  static latest(): MockSpeechRecognition {
    const instance = MockSpeechRecognition.instances[MockSpeechRecognition.instances.length - 1];
    if (!instance) throw new Error("No MockSpeechRecognition instance was created — was the mic button clicked?");
    return instance;
  }

  static reset() {
    MockSpeechRecognition.instances = [];
  }
}

function makeResultEvent(transcript: string, isFinal: boolean, confidence = 0.9) {
  const alt: MockAlternative = { transcript, confidence };
  const result = { isFinal, length: 1, 0: alt };
  const results = { length: 1, 0: result };
  return { resultIndex: 0, results };
}

function sayFinal(transcript: string, confidence = 0.9) {
  MockSpeechRecognition.latest().onresult?.(makeResultEvent(transcript, true, confidence));
}

async function freshInvestigationId(): Promise<string> {
  const inv = await createInvestigation({
    casino: "",
    tableNumber: "",
    dealerName: "",
    investigationDate: "2026-08-20",
    operatorName: "",
    countingSystem: "Hi-Lo",
    shoeTotalDecks: 6,
    status: "active",
  });
  return inv.localId;
}

/** Occupies seat 3 and gives it a $25 starting wager — the shared setup for every test below. */
async function occupySeat3WithBet(investigationId: string): Promise<void> {
  await occupySeat(investigationId, 3);
  const inv = await getInvestigation(investigationId);
  await updateSeatBet(investigationId, inv!.rounds[0].id, 3, 25, { direction: "first", amount: 25, overridden: false });
}

/** Occupies, bets, and splits seat 3 via the repository directly (bypassing voice) — used by tests that need an already-split seat to test Double's hand-targeting or Split's "already split" rejection. */
async function occupyBetAndSplitSeat3(investigationId: string): Promise<void> {
  await occupySeat3WithBet(investigationId);
  const inv = await getInvestigation(investigationId);
  await splitSeat(investigationId, inv!.rounds[0].id, 3);
}

function SplitDoubleProbe() {
  const { activeTarget, investigation } = useInvestigationContext();
  const round = investigation.rounds[investigation.rounds.length - 1];
  const primary = round.seats[3];
  const split = round.splitHands[3];
  return (
    <div>
      <div data-testid="active-target">{String(activeTarget)}</div>
      <div data-testid="hand1-doubled">{String(Boolean(primary?.doubled))}</div>
      <div data-testid="hand1-bet">{String(primary?.betAmount ?? "")}</div>
      <div data-testid="hand2-exists">{String(round.splitHands[3] != null)}</div>
      <div data-testid="hand2-doubled">{String(Boolean(split?.doubled))}</div>
      <div data-testid="hand2-bet">{String(split?.betAmount ?? "")}</div>
    </div>
  );
}

async function startListening() {
  const micButton = await screen.findByRole("button", { name: "Start voice command" });
  await act(async () => {
    micButton.click();
  });
}

/** See VoiceControl.test.tsx's identical helper: every final result ends its native session and the hook auto-restarts shortly after — a second `sayFinal` in the same test must await that restart first. */
async function awaitRestartFrom(previousInstanceCount: number) {
  await waitFor(() => expect(MockSpeechRecognition.instances.length).toBeGreaterThan(previousInstanceCount));
}

class MockSpeechSynthesisUtterance {
  lang = "";
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

const mockSpeechSynthesis = { cancel: vi.fn(), speak: vi.fn() };

beforeEach(() => {
  MockSpeechRecognition.reset();
  (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = MockSpeechRecognition;
  mockSpeechSynthesis.cancel.mockClear();
  mockSpeechSynthesis.speak.mockClear();
  (window as unknown as { speechSynthesis?: unknown }).speechSynthesis = mockSpeechSynthesis;
  (window as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance =
    MockSpeechSynthesisUtterance;
  resetLastSpokenText();
});

afterEach(() => {
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
  delete (window as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance;
  vi.restoreAllMocks();
});

function renderVoice(investigationId: string) {
  return render(
    <InvestigationProvider investigationId={investigationId}>
      <VoiceControl />
      <CountSummaryPanel />
      <SplitDoubleProbe />
    </InvestigationProvider>
  );
}

describe("Voice Split — accepted forms", () => {
  it.each(["spot 3 split", "player 3 split", "split spot 3", "split player 3"])(
    '"%s" splits spot 3 — Hand 2 created, active target becomes the split hand, spoken confirmation "Spot 3 split."',
    async (transcript) => {
      const investigationId = await freshInvestigationId();
      await occupySeat3WithBet(investigationId);
      renderVoice(investigationId);
      await startListening();

      await act(async () => sayFinal(transcript));

      await waitFor(() => expect(screen.getByTestId("hand2-exists").textContent).toBe("true"));
      expect(screen.getByTestId("active-target").textContent).toBe("-3");
      expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1);
      expect((mockSpeechSynthesis.speak.mock.calls[0][0] as { text: string }).text).toBe("Spot 3 split");
    }
  );
});

describe("Voice Double — unsplit seat", () => {
  it.each(["spot 3 double", "player 3 double"])(
    '"%s" doubles spot 3\'s primary hand — bet doubled, doubled flag set, spoken "Spot 3 doubled."',
    async (transcript) => {
      const investigationId = await freshInvestigationId();
      await occupySeat3WithBet(investigationId);
      renderVoice(investigationId);
      await startListening();

      await act(async () => sayFinal(transcript));

      await waitFor(() => expect(screen.getByTestId("hand1-doubled").textContent).toBe("true"));
      expect(screen.getByTestId("hand1-bet").textContent).toBe("50");
      expect(screen.getByTestId("active-target").textContent).toBe("3");
      expect((mockSpeechSynthesis.speak.mock.calls[0][0] as { text: string }).text).toBe("Spot 3 doubled");
    }
  );
});

describe("Voice Double — split seat, explicit hand required", () => {
  it('"spot 3 hand 1 double" doubles ONLY Hand 1 — Hand 2 untouched', async () => {
    const investigationId = await freshInvestigationId();
    await occupyBetAndSplitSeat3(investigationId);
    renderVoice(investigationId);
    await startListening();

    await act(async () => sayFinal("spot 3 hand 1 double"));

    await waitFor(() => expect(screen.getByTestId("hand1-doubled").textContent).toBe("true"));
    expect(screen.getByTestId("hand1-bet").textContent).toBe("50");
    expect(screen.getByTestId("hand2-doubled").textContent).toBe("false");
    expect(screen.getByTestId("hand2-bet").textContent).toBe("25");
    expect(screen.getByTestId("active-target").textContent).toBe("3");
    expect((mockSpeechSynthesis.speak.mock.calls[0][0] as { text: string }).text).toBe("Spot 3 Hand 1 doubled");
  });

  it('"spot 3 hand 2 double" doubles ONLY Hand 2 — Hand 1 untouched', async () => {
    const investigationId = await freshInvestigationId();
    await occupyBetAndSplitSeat3(investigationId);
    renderVoice(investigationId);
    await startListening();

    await act(async () => sayFinal("spot 3 hand 2 double"));

    await waitFor(() => expect(screen.getByTestId("hand2-doubled").textContent).toBe("true"));
    expect(screen.getByTestId("hand2-bet").textContent).toBe("50");
    expect(screen.getByTestId("hand1-doubled").textContent).toBe("false");
    expect(screen.getByTestId("hand1-bet").textContent).toBe("25");
    expect(screen.getByTestId("active-target").textContent).toBe("-3");
    expect((mockSpeechSynthesis.speak.mock.calls[0][0] as { text: string }).text).toBe("Spot 3 Hand 2 doubled");
  });

  it.each(["spot 3 double", "player 3 double", "double spot 3"])(
    'bare "%s" on an already-split seat is REJECTED as ambiguous — never guesses which hand',
    async (transcript) => {
      const investigationId = await freshInvestigationId();
      await occupyBetAndSplitSeat3(investigationId);
      renderVoice(investigationId);
      await startListening();

      await act(async () => sayFinal(transcript));

      await waitFor(() => screen.getByText(/hand 1.*hand 2|hand 2.*hand 1/i));
      expect(screen.getByTestId("hand1-doubled").textContent).toBe("false");
      expect(screen.getByTestId("hand2-doubled").textContent).toBe("false");
      expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
    }
  );
});

describe("Voice Split/Double — invalid targets rejected, zero mutation", () => {
  it('"spot 3 split" on a seat with no hand at all is rejected — no split hand created', async () => {
    const investigationId = await freshInvestigationId();
    renderVoice(investigationId);
    await startListening();

    await act(async () => sayFinal("spot 3 split"));

    await waitFor(() => screen.getByText(/no hand to split/i));
    expect(screen.getByTestId("hand2-exists").textContent).toBe("false");
    expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
  });

  it('"spot 3 split" on an already-split seat is rejected — no second split created, existing hands untouched', async () => {
    const investigationId = await freshInvestigationId();
    await occupyBetAndSplitSeat3(investigationId);
    renderVoice(investigationId);
    await startListening();

    await act(async () => sayFinal("spot 3 split"));

    await waitFor(() => screen.getByText(/already split/i));
    expect(screen.getByTestId("hand1-bet").textContent).toBe("25");
    expect(screen.getByTestId("hand2-bet").textContent).toBe("25");
    expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
  });

  it('"spot 3 double" on a seat with no hand at all is rejected', async () => {
    const investigationId = await freshInvestigationId();
    renderVoice(investigationId);
    await startListening();

    await act(async () => sayFinal("spot 3 double"));

    await waitFor(() => screen.getByText(/no hand yet/i));
    expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
  });

  it('"spot 3 double" on a seat already doubled is rejected — bet stays at its doubled value, not doubled again', async () => {
    const investigationId = await freshInvestigationId();
    await occupySeat3WithBet(investigationId);
    renderVoice(investigationId);
    await startListening();
    const before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("spot 3 double"));
    await waitFor(() => expect(screen.getByTestId("hand1-bet").textContent).toBe("50"));

    await awaitRestartFrom(before);
    // A different phrasing than the first attempt ("player" not "spot") —
    // an identical repeated transcript within DUPLICATE_WINDOW_MS is
    // silently ignored by VoiceControl's own duplicate-suppression guard,
    // which isn't what this test is exercising.
    await act(async () => sayFinal("player 3 double"));

    await waitFor(() => screen.getByText(/can't be doubled/i));
    expect(screen.getByTestId("hand1-bet").textContent).toBe("50");
  });

  it.each(["spot 3 hand 3 double", "spot 3 hand zero double"])(
    'malformed hand number "%s" is rejected — never guesses a fallback hand',
    async (transcript) => {
      const investigationId = await freshInvestigationId();
      await occupyBetAndSplitSeat3(investigationId);
      renderVoice(investigationId);
      await startListening();

      await act(async () => sayFinal(transcript));

      await waitFor(() => screen.getByText(/not recognized/i));
      expect(screen.getByTestId("hand1-doubled").textContent).toBe("false");
      expect(screen.getByTestId("hand2-doubled").textContent).toBe("false");
      expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
    }
  );
});

describe("Voice Split/Double — never touch the CardEvent ledger or the count", () => {
  it("voice split creates zero CardEvents and leaves the running count unchanged", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeat3WithBet(investigationId);
    renderVoice(investigationId);
    await startListening();

    const before = await getCardEventsForInvestigation(investigationId);
    expect(before).toHaveLength(0);

    await act(async () => sayFinal("spot 3 split"));
    await waitFor(() => expect(screen.getByTestId("hand2-exists").textContent).toBe("true"));

    const after = await getCardEventsForInvestigation(investigationId);
    expect(after).toHaveLength(0);
    expect(screen.getByLabelText("HI-LO running count").textContent).toBe("0");
  });

  it("voice double creates zero CardEvents and leaves the running count unchanged", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeat3WithBet(investigationId);
    renderVoice(investigationId);
    await startListening();

    await act(async () => sayFinal("spot 3 double"));
    await waitFor(() => expect(screen.getByTestId("hand1-doubled").textContent).toBe("true"));

    const events = await getCardEventsForInvestigation(investigationId);
    expect(events).toHaveLength(0);
    expect(screen.getByLabelText("HI-LO running count").textContent).toBe("0");
  });
});

describe("Voice Double -> Undo — Phase 2 guarantees hold for a voice-triggered Double", () => {
  it("Undo immediately after a voice Double reverts the double, not a card — identical to manual Double -> Undo", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeat3WithBet(investigationId);
    renderVoice(investigationId);
    await startListening();

    const before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("spot 3 double"));
    await waitFor(() => expect(screen.getByTestId("hand1-doubled").textContent).toBe("true"));
    expect(screen.getByTestId("hand1-bet").textContent).toBe("50");

    await awaitRestartFrom(before);
    await act(async () => sayFinal("undo"));

    await waitFor(() => expect(screen.getByTestId("hand1-doubled").textContent).toBe("false"));
    expect(screen.getByTestId("hand1-bet").textContent).toBe("25");
  });
});

describe("Voice Split/Double — Player/Spot terminology stays interchangeable", () => {
  it('"player 3 split" then "player 3 hand 2 double" — the "player" synonym works for both commands together', async () => {
    const investigationId = await freshInvestigationId();
    await occupySeat3WithBet(investigationId);
    renderVoice(investigationId);
    await startListening();

    const before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("player 3 split"));
    await waitFor(() => expect(screen.getByTestId("hand2-exists").textContent).toBe("true"));

    await awaitRestartFrom(before);
    await act(async () => sayFinal("player 3 hand 2 double"));

    await waitFor(() => expect(screen.getByTestId("hand2-doubled").textContent).toBe("true"));
    expect(screen.getByTestId("hand2-bet").textContent).toBe("50");
    expect(screen.getByTestId("hand1-doubled").textContent).toBe("false");
  });
});

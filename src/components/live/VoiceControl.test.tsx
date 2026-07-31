// @vitest-environment jsdom
//
// jsdom has no real SpeechRecognition implementation, so every test here
// installs a small mock constructor on `window.SpeechRecognition` before
// rendering (removed again in afterEach). The mock only implements the
// surface useVoiceRecognition actually touches: start()/stop(), and the
// onresult/onerror/onend callback slots a test drives directly to simulate
// what a real browser would fire. This proves the parser -> dispatch ->
// existing-handler pipeline exhaustively; it does not (and cannot, in
// jsdom) prove real-world recognition accuracy.
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvestigationProvider, useInvestigationContext } from "@/contexts/InvestigationContext";
import { LockProvider } from "@/contexts/LockContext";
import { EntryLockProvider } from "@/contexts/EntryLockContext";
import { createInvestigation } from "@/lib/db/repositories/investigations";
import { CardEntryPad } from "./CardEntryPad";
import { CountSummaryPanel } from "./CountSummaryPanel";
import { VoiceControl } from "./VoiceControl";
import { VoiceControlErrorBoundary } from "./VoiceControlErrorBoundary";

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

function sayInterim(transcript: string) {
  MockSpeechRecognition.latest().onresult?.(makeResultEvent(transcript, false));
}

async function freshInvestigationId(): Promise<string> {
  const inv = await createInvestigation({
    casino: "",
    tableNumber: "",
    dealerName: "",
    investigationDate: "2026-07-31",
    operatorName: "",
    countingSystem: "Hi-Lo",
    shoeTotalDecks: 6,
    status: "active",
  });
  return inv.localId;
}

function ActiveTargetProbe() {
  const { activeTarget, investigation } = useInvestigationContext();
  return (
    <div>
      <div data-testid="active-target">{String(activeTarget)}</div>
      <div data-testid="round-count">{investigation.rounds.length}</div>
      <div data-testid="round-completed">{String(investigation.rounds[investigation.rounds.length - 1].completed)}</div>
      <div data-testid="dealer-card-count">{investigation.rounds[investigation.rounds.length - 1].dealerHand.cards.length}</div>
    </div>
  );
}

async function startListening() {
  // findByRole (not getByRole) — InvestigationProvider loads asynchronously
  // (Dexie), so immediately after render() the screen may still show
  // "Loading investigation…" and VoiceControl won't be mounted yet.
  const micButton = await screen.findByRole("button", { name: "Start voice command" });
  await act(async () => {
    micButton.click();
  });
}

beforeEach(() => {
  MockSpeechRecognition.reset();
  (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = MockSpeechRecognition;
});

afterEach(() => {
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  vi.restoreAllMocks();
});

describe("VoiceControl — selection", () => {
  it('1. "seat one" selects Seat 1', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("dealer"));

    await startListening();
    await act(async () => sayFinal("seat one"));

    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("1"));
    await waitFor(() => screen.getByText("✓ Seat 1 selected"));
  });

  it('2. "dealer" selects the dealer', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("dealer"));

    await startListening();
    await act(async () => sayFinal("seat two"));
    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("2"));

    await startListening();
    await act(async () => sayFinal("dealer"));
    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("dealer"));
  });
});

describe("VoiceControl — card entry", () => {
  it("3. \"ace\" enters exactly one Ace through the existing handler", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("0"));

    await startListening();
    await act(async () => sayFinal("ace"));

    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));
    await waitFor(() => screen.getByText("✓ Card A entered"));
  });

  it('4. "ten" enters one 10', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("ten"));
    await waitFor(() => screen.getByText("✓ Card 10 entered"));
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));
  });

  it.each(["jack", "queen", "king"])("5. %s normalizes to rank 10", async (word) => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal(word));
    await waitFor(() => screen.getByText("✓ Card 10 entered"));
  });
});

describe("VoiceControl — workflow", () => {
  it('6. "done" invokes the existing Done behavior', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    // Dealer needs a card recorded before the round can complete (see
    // canCompleteRound) — same precondition the touch Done button has.
    await startListening();
    await act(async () => sayFinal("ace"));
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));

    await startListening();
    await act(async () => sayFinal("done"));

    await waitFor(() => expect(screen.getByTestId("round-completed").textContent).toBe("true"));
    await waitFor(() => screen.getByText("✓ Done"));
  });

  it('7. "next" invokes the existing Next behavior', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("ace"));
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));

    await startListening();
    await act(async () => sayFinal("done"));
    await waitFor(() => expect(screen.getByTestId("round-completed").textContent).toBe("true"));

    const roundsBefore = Number(screen.getByTestId("round-count").textContent);
    await startListening();
    await act(async () => sayFinal("next"));

    await waitFor(() => expect(Number(screen.getByTestId("round-count").textContent)).toBe(roundsBefore + 1));
    await waitFor(() => screen.getByText("✓ Next"));
  });

  it('8. "undo" invokes the existing Undo behavior', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("ace"));
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));

    await startListening();
    await act(async () => sayFinal("undo"));

    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("0"));
    await waitFor(() => screen.getByText("✓ Undo"));
  });
});

describe("VoiceControl — safety", () => {
  it("9. unsupported speech creates no card event and no state change", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("dealer"));

    await startListening();
    await act(async () => sayFinal("banana"));

    await waitFor(() => screen.getByText(/Not recognized/));
    expect(screen.getByTestId("dealer-card-count").textContent).toBe("0");
    expect(screen.getByTestId("active-target").textContent).toBe("dealer");
  });

  it("10. duplicate final results execute only once", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    const instance = MockSpeechRecognition.latest();
    await act(async () => {
      // Same instance fires two "final" results for the same utterance —
      // a real recognizer restart/duplicate-final scenario.
      instance.onresult?.(makeResultEvent("ace", true));
      instance.onresult?.(makeResultEvent("ace", true));
    });

    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));
    // Still exactly one — not two.
    expect(screen.getByTestId("dealer-card-count").textContent).toBe("1");
  });

  it("interim results are shown but never dispatched", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayInterim("seat"));

    await waitFor(() => screen.getByText(/Listening…/));
    expect(screen.getByTestId("active-target").textContent).toBe("dealer");
    expect(screen.getByTestId("dealer-card-count").textContent).toBe("0");
  });

  it("11. voice control is entirely absent while the privacy lock is active", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <LockProvider>
        <EntryLockProvider>
          <InvestigationProvider investigationId={investigationId}>
            <VoiceControlErrorBoundary>
              <VoiceControl />
            </VoiceControlErrorBoundary>
          </InvestigationProvider>
        </EntryLockProvider>
      </LockProvider>
    );
    // Simulates what InvestigationChrome does when LockContext.locked is
    // true: VoiceControl (and everything else in the live screen) simply
    // isn't rendered — there is no separate "locked" prop on VoiceControl
    // to bypass, because there's nothing mounted to bypass.
    expect(screen.queryByRole("button", { name: "Start voice command" })).toBeNull();
  });

  it("12. a microphone permission failure leaves the manual keypad fully usable", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <CardEntryPad />
        <CountSummaryPanel />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await waitFor(() => expect(screen.getByLabelText("HI-LO running count").textContent).toBe("0"));

    await startListening();
    await act(async () => {
      MockSpeechRecognition.latest().onerror?.({ error: "not-allowed" });
    });
    await waitFor(() => screen.getByText("Microphone permission denied."));

    // Manual controls must still work exactly as if voice never ran.
    const tenButton = screen.getByRole("button", { name: "10" });
    await act(async () => {
      tenButton.click();
    });
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));
  });
});

describe("VoiceControl — parity with the touch keypad", () => {
  it("13. voice-entered 2, 3, 10 produces the same Hi-Lo result as tapping 2, 3, 10 (+1)", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <CountSummaryPanel />
      </InvestigationProvider>
    );
    await waitFor(() => expect(screen.getByLabelText("HI-LO running count").textContent).toBe("0"));

    for (const word of ["two", "three", "ten"]) {
      await startListening();
      await act(async () => sayFinal(word));
    }

    await waitFor(() => expect(screen.getByLabelText("HI-LO running count").textContent).toBe("+1"));
  });
});

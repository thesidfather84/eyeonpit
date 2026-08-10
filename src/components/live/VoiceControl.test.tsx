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
  const round = investigation.rounds[investigation.rounds.length - 1];
  return (
    <div>
      <div data-testid="active-target">{String(activeTarget)}</div>
      <div data-testid="occupied-seats">{investigation.occupiedSeats.join(",")}</div>
      <div data-testid="investigation-status">{investigation.status}</div>
      <div data-testid="shoe-number">{round.shoeNumber}</div>
      <div data-testid="round-count">{investigation.rounds.length}</div>
      <div data-testid="round-completed">{String(round.completed)}</div>
      <div data-testid="dealer-card-count">{round.dealerHand.cards.length}</div>
      {[1, 2, 3].map((seatNumber) => (
        <div key={seatNumber} data-testid={`seat-${seatNumber}-card-count`}>
          {round.seats[seatNumber]?.playerCards.length ?? 0}
        </div>
      ))}
      <div data-testid="note-count">{investigation.operatorNotes.length}</div>
      <div data-testid="latest-note">{investigation.operatorNotes[investigation.operatorNotes.length - 1]?.text ?? ""}</div>
    </div>
  );
}

async function startListening() {
  // findByRole (not getByRole) — InvestigationProvider loads asynchronously
  // (Dexie), so immediately after render() the screen may still show
  // "Loading investigation…" and VoiceControl won't be mounted yet. Only
  // ever called once per test now that listening means "continuous voice
  // mode is on" (see useVoiceRecognition) — a second call would find the
  // button already relabeled "Stop listening" and time out, which is
  // itself a useful signal that a test is still using the old one-tap-
  // per-command pattern.
  const micButton = await screen.findByRole("button", { name: "Start voice command" });
  await act(async () => {
    micButton.click();
  });
}

/**
 * Under continuous listening, every final result — accepted, rejected, or
 * disabled — ends its native session and the hook auto-restarts a fresh
 * one shortly after (see RESTART_DELAY_MS in useVoiceRecognition). A test
 * simulating more than one command in the same continuous session must
 * await that restart before driving the next one, or `sayFinal` would
 * reach into an already-stopped mock instance via `latest()`. Capture
 * `MockSpeechRecognition.instances.length` immediately before the
 * triggering `sayFinal` call and pass it here.
 */
async function awaitRestartFrom(previousInstanceCount: number) {
  await waitFor(() => expect(MockSpeechRecognition.instances.length).toBeGreaterThan(previousInstanceCount));
}

/** Diagnostics are opt-in — the "Debug" toggle only appears once at least one log entry exists, and the panel itself only renders after it's clicked. */
async function openDiagnostics() {
  const debugButton = await screen.findByRole("button", { name: "Show Voice Diagnostics" });
  await act(async () => {
    debugButton.click();
  });
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
});

afterEach(() => {
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
  delete (window as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance;
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
    const before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("seat two"));
    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("2"));

    // Still the same continuous session — no second mic tap.
    await awaitRestartFrom(before);
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
    await waitFor(() => screen.getByText("✓ DEALER: A"));
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
    await waitFor(() => screen.getByText("✓ DEALER: 10"));
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));
  });

  it.each([
    ["jack", "J"],
    ["queen", "Q"],
    ["king", "K"],
  ])(
    "5. %s enters rank 10 (unchanged counting/storage) but confirms with the spoken face-card letter %s",
    async (word, letter) => {
      const investigationId = await freshInvestigationId();
      render(
        <InvestigationProvider investigationId={investigationId}>
          <VoiceControl />
          <ActiveTargetProbe />
        </InvestigationProvider>
      );
      await startListening();
      await act(async () => sayFinal(word));
      // The confirmation echoes the spoken face card...
      await waitFor(() => screen.getByText(`✓ DEALER: ${letter}`));
      // ...but the stored card, and therefore the count, is exactly "10" —
      // identical to what CardEntryPad's own "10" button produces. The
      // status text renders synchronously; the card-add itself is async
      // (Dexie write + refresh), so this needs its own waitFor too.
      await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));
    }
  );

  it('reproduces the reported "King recognized but nothing entered" case: capitalized "King", exactly as a real recognizer returned it, still enters the card', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("0"));

    await startListening();
    // The real-world diagnostics showed the transcript exactly as "King"
    // (capitalized) at ~0.9 confidence — normalizeTranscript lowercases
    // before lookup, so this must resolve identically to "king".
    await act(async () => sayFinal("King", 0.9));

    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));
    await waitFor(() => screen.getByText("✓ DEALER: K"));
  });

  it.each([
    ["an ace", "✓ DEALER: A"],
    ["card ace", "✓ DEALER: A"],
    ["a king", "✓ DEALER: K"],
  ] as const)('observed Safari variant "%s" is still accepted end-to-end', async (phrase, expectedStatus) => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal(phrase));
    await waitFor(() => screen.getByText(expectedStatus));
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));
  });

  it('a card word recognized while entry is disabled shows "not available right now", never "Not recognized" — recognition genuinely succeeded, only the action didn\'t', async () => {
    const investigationId = await freshInvestigationId();
    // Paused *before* the provider mounts, so its very first load already
    // reflects "paused" — InvestigationContext has no live subscription, so
    // a pause written after mount wouldn't be visible without a refresh().
    const { pauseInvestigation } = await import("@/lib/db/repositories/investigations");
    await pauseInvestigation(investigationId);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );

    await startListening();
    await act(async () => sayFinal("king"));

    await waitFor(() => screen.getByText(/Heard.*king.*that action isn.t available right now/));
    expect(screen.queryByText(/Not recognized/)).toBeNull();
    expect(screen.getByTestId("dealer-card-count").textContent).toBe("0");
  });

  it("selecting a seat while entry is disabled still works — only card entry and workflow actions are gated", async () => {
    // Confirms the "disabled" status wording above is specific to actions
    // that actually get gated (cardDisabled/doneDisabled/etc.), not a
    // blanket state — select-seat/select-dealer never check `disabled` at
    // all, exactly like tapping a seat tile manually.
    const investigationId = await freshInvestigationId();
    const { pauseInvestigation } = await import("@/lib/db/repositories/investigations");
    await pauseInvestigation(investigationId);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );

    await startListening();
    await act(async () => sayFinal("seat two"));

    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("2"));
  });
});

describe("VoiceControl — noisy real-world transcripts, end to end (the safety rule: one spoken card never creates more than one CardEvent)", () => {
  it('"dealer King King" enters exactly one card, not two', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("dealer King King"));

    await waitFor(() => screen.getByText("✓ DEALER: K"));
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));
    expect(screen.getByTestId("active-target").textContent).toBe("dealer");
  });

  it('"dealer King King King" (three repeats) still enters exactly one card', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("dealer King King King"));

    await waitFor(() => screen.getByText("✓ DEALER: K"));
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));
  });

  it('"C1 King Ace" — REDEFINED under natural hand narration (see parseNarration.ts): C1 is an explicit target, so two distinct sequential ranks are no longer ambiguous — Seat 1 gets both cards, in order, not a rejection', async () => {
    const investigationId = await freshInvestigationId();
    const { occupySeat } = await import("@/lib/db/repositories/investigations");
    await occupySeat(investigationId, 1);
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("C1 King Ace"));

    await waitFor(() => screen.getByText("✓ S1: K A"));
    await waitFor(() => expect(screen.getByTestId("seat-1-card-count").textContent).toBe("2"));
    expect(screen.getByTestId("dealer-card-count").textContent).toBe("0");
  });

  it('"Taylor King King" -> reject, ZERO CardEvents — redefined per the narration/legacy boundary safety fix: a bare unscoped card with ANY surrounding unrecognized word ("Taylor") must never be salvaged, even though it fits the old tolerance built for a misheard proper noun. That old tolerance was proven indistinguishable from ordinary conversation by the "Team 5" regression, so it no longer applies to a target-less card', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("Taylor King King"));

    await waitFor(() => screen.getByText(/Not recognized/));
    expect(screen.getByTestId("dealer-card-count").textContent).toBe("0");
  });

  it('"dealer Qing King" ignores the garbled near-miss and enters exactly one card', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("dealer Qing King"));

    await waitFor(() => screen.getByText("✓ DEALER: K"));
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));
  });

  it('"seat three ace" selects Seat 3 and enters exactly one card there in a single utterance', async () => {
    const investigationId = await freshInvestigationId();
    const { occupySeat } = await import("@/lib/db/repositories/investigations");
    await occupySeat(investigationId, 3);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("seat three ace"));

    await waitFor(() => screen.getByText("✓ SEAT 3: A"));
    await waitFor(() => expect(screen.getByTestId("seat-3-card-count").textContent).toBe("1"));
    expect(screen.getByTestId("active-target").textContent).toBe("3");
    // Confirms the dealer wasn't touched — the card went to exactly the
    // spoken target, nowhere else.
    expect(screen.getByTestId("dealer-card-count").textContent).toBe("0");
  });

  it('the exact captured phrase "C1 Ace King" — REDEFINED under natural hand narration: C1 recognized as Seat 1, and with an explicit target established, Ace then King become two ordered Seat 1 CardEvents rather than an ambiguous rejection', async () => {
    const investigationId = await freshInvestigationId();
    const { occupySeat } = await import("@/lib/db/repositories/investigations");
    await occupySeat(investigationId, 1);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("C1 Ace King"));

    await waitFor(() => screen.getByText("✓ S1: A K"));
    await waitFor(() => expect(screen.getByTestId("seat-1-card-count").textContent).toBe("2"));
    expect(screen.getByTestId("dealer-card-count").textContent).toBe("0");
    expect(screen.getByTestId("active-target").textContent).toBe("1");
  });

  it('"C1 Ace" (the alternate single-card recognition candidate for the same utterance) selects Seat 1 and enters exactly one Ace', async () => {
    const investigationId = await freshInvestigationId();
    const { occupySeat } = await import("@/lib/db/repositories/investigations");
    await occupySeat(investigationId, 1);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("C1 Ace"));

    await waitFor(() => screen.getByText("✓ SEAT 1: A"));
    await waitFor(() => expect(screen.getByTestId("seat-1-card-count").textContent).toBe("1"));
    expect(screen.getByTestId("active-target").textContent).toBe("1");
  });
});

describe("VoiceControl — a sentence containing a card word never creates a CardEvent (continuous natural-speech safety)", () => {
  it('real captured field bug: with Seat 3 active, "Player bet Ace." must NOT enter a card on Seat 3 — zero CardEvents anywhere', async () => {
    const investigationId = await freshInvestigationId();
    const { occupySeat } = await import("@/lib/db/repositories/investigations");
    await occupySeat(investigationId, 3);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    // Make Seat 3 the active target first, exactly as the field report had it.
    const before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("seat three"));
    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("3"));

    await awaitRestartFrom(before);
    await act(async () => sayFinal("Player bet Ace."));

    await waitFor(() => screen.getByText(/Not recognized/));
    expect(screen.getByTestId("seat-3-card-count").textContent).toBe("0");
    expect(screen.getByTestId("dealer-card-count").textContent).toBe("0");
  });

  it.each([
    "I saw an ace earlier.",
    "Seat 3 raised his bet after the five.",
    "That guy looks like a king.",
  ])('"%s" is rejected end to end — zero CardEvents', async (transcript) => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal(transcript));

    await waitFor(() => screen.getByText(/Not recognized/));
    expect(screen.getByTestId("dealer-card-count").textContent).toBe("0");
    expect(screen.getByTestId("seat-1-card-count").textContent).toBe("0");
  });

  it('"King Ace." (two distinct cards, no target) is rejected end to end, exactly like the existing "C1 King Ace" ambiguity case', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("King Ace."));

    await waitFor(() => screen.getByText(/Not recognized/));
    expect(screen.getByTestId("dealer-card-count").textContent).toBe("0");
  });

  it("an empty/blank final transcript is a silent no-op — no visible rejection pill, nothing dispatched", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    const before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal(""));

    // The native session still ends and restarts, same as any other final
    // result — only the visible/dispatch side is a no-op.
    await awaitRestartFrom(before);
    expect(screen.queryByText(/Not recognized/)).toBeNull();
    expect(screen.getByTestId("dealer-card-count").textContent).toBe("0");

    // Manual/voice entry still works fine right after — this isn't a stuck state.
    await act(async () => sayFinal("ace"));
    await waitFor(() => screen.getByText("✓ DEALER: A"));
  });
});

describe('VoiceControl — "next seat" (deterministic alias for the existing Next behavior)', () => {
  it('"next seat" advances the active target to the next occupied seat, then wraps to dealer — the exact same advanceToNext logic bare "next" already uses mid-round', async () => {
    const investigationId = await freshInvestigationId();
    const { occupySeat } = await import("@/lib/db/repositories/investigations");
    await occupySeat(investigationId, 1);
    await occupySeat(investigationId, 2);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    let before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("seat one"));
    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("1"));

    await awaitRestartFrom(before);
    before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("next seat"));
    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("2"));
    await waitFor(() => screen.getByText("✓ Next"));

    // Bare "next" for the second step, not "next seat" again — saying the
    // exact same literal phrase twice within 1.5s hits VoiceControl's
    // own (pre-existing, unrelated) duplicate-transcript guard, which is
    // not what this test is about. Different wording, identical resulting
    // command — proving "next seat" and "next" really do share one code
    // path all the way through advanceToNext.
    await awaitRestartFrom(before);
    await act(async () => sayFinal("next"));
    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("dealer"));
  });
});

describe("VoiceControl — numeric card words", () => {
  it.each(["2", "5"])('bare digit "%s" enters that card end to end, exactly like the word form', async (digit) => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal(digit));

    await waitFor(() => screen.getByText(`✓ DEALER: ${digit}`));
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));
  });

  it('"seat 2" (digit form) still selects Seat 2 rather than entering a card — target selection and card entry never collide', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("seat 2"));

    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("2"));
    expect(screen.getByTestId("dealer-card-count").textContent).toBe("0");
  });
});

describe("VoiceControl — voice note dictation", () => {
  it('"start note" enters dictation mode, subsequent speech is captured as free text (never parsed as a command), and "end note" saves it via the existing operator-note mechanism, then returns to normal command listening', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await waitFor(() => expect(screen.getByTestId("note-count").textContent).toBe("0"));

    await startListening();
    let before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("start note"));
    await waitFor(() => screen.getByText(/Note mode/));

    await awaitRestartFrom(before);
    before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("I see player in spot 3 raised bet when the count was high"));
    await waitFor(() => screen.getByText("I see player in spot 3 raised bet when the count was high"));

    await awaitRestartFrom(before);
    before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("end note"));

    await waitFor(() => screen.getByText("✓ Note saved"));
    // addOperatorNote + refresh() are async (a real Dexie write) — the
    // status pill above renders synchronously with setStatus, well before
    // that write settles, so both of these need their own waitFor too.
    await waitFor(() => expect(screen.getByTestId("note-count").textContent).toBe("1"));
    await waitFor(() =>
      expect(screen.getByTestId("latest-note").textContent).toBe(
        "I see player in spot 3 raised bet when the count was high"
      )
    );

    // Back to normal command mode — a card word is now entered as a card
    // again, not appended to a note.
    await awaitRestartFrom(before);
    await act(async () => sayFinal("ace"));
    await waitFor(() => screen.getByText("✓ DEALER: A"));
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));
  });

  it('card/seat/workflow words spoken during note mode are saved as text, never entered as commands', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );

    await startListening();
    let before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("note"));
    await waitFor(() => screen.getByText(/Note mode/));

    await awaitRestartFrom(before);
    before = MockSpeechRecognition.instances.length;
    // Every one of these would normally be a real command — while note
    // mode is active, none of them may touch the ledger.
    await act(async () => sayFinal("dealer king seat two undo"));
    await waitFor(() => screen.getByText("dealer king seat two undo"));

    await awaitRestartFrom(before);
    await act(async () => sayFinal("end note"));
    await waitFor(() => screen.getByText("✓ Note saved"));

    expect(screen.getByTestId("dealer-card-count").textContent).toBe("0");
    expect(screen.getByTestId("active-target").textContent).toBe("dealer");
    await waitFor(() => expect(screen.getByTestId("latest-note").textContent).toBe("dealer king seat two undo"));
  });

  it('"cancel note" discards the dictated text without saving, and returns to normal command mode', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );

    await startListening();
    let before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("start note"));
    await waitFor(() => screen.getByText(/Note mode/));

    await awaitRestartFrom(before);
    before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("this was a mistake"));
    await waitFor(() => screen.getByText("this was a mistake"));

    await awaitRestartFrom(before);
    before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("cancel note"));

    await waitFor(() => screen.getByText("✓ Note cancelled"));
    expect(screen.getByTestId("note-count").textContent).toBe("0");

    // Back to normal command mode.
    await awaitRestartFrom(before);
    await act(async () => sayFinal("king"));
    await waitFor(() => screen.getByText("✓ DEALER: K"));
  });

  it('"start note" followed immediately by content in the same utterance ("start note the count is high") captures the remainder as the note\'s first words', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );

    await startListening();
    const before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("start note the count is high"));
    await waitFor(() => screen.getByText("the count is high"));

    await awaitRestartFrom(before);
    await act(async () => sayFinal("end note"));

    await waitFor(() => expect(screen.getByTestId("latest-note").textContent).toBe("the count is high"));
  });

  it("an empty note (start note immediately followed by end note) is not saved", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );

    await startListening();
    const before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("start note"));
    await waitFor(() => screen.getByText(/Note mode/));

    await awaitRestartFrom(before);
    await act(async () => sayFinal("end note"));

    await waitFor(() => screen.getByText(/Note empty/));
    expect(screen.getByTestId("note-count").textContent).toBe("0");
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
    const before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("ace"));
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));

    // Still the same continuous session — no second mic tap.
    await awaitRestartFrom(before);
    await act(async () => sayFinal("done"));

    await waitFor(() => expect(screen.getByTestId("round-completed").textContent).toBe("true"));
    await waitFor(() => screen.getByText("✓ Done"));
  });

  it('voice "done" speaks the count summary once the round has actually completed (same handleDone the tap path uses)', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    const before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("king")); // Hi-Lo -1
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));

    await awaitRestartFrom(before);
    mockSpeechSynthesis.speak.mockClear(); // discard whatever the "king" entry itself may have queued
    await act(async () => sayFinal("done"));

    await waitFor(() => expect(screen.getByTestId("round-completed").textContent).toBe("true"));
    await waitFor(() => expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1));
    const spoken = mockSpeechSynthesis.speak.mock.calls[0][0] as MockSpeechSynthesisUtterance;
    expect(spoken.text).toBe("Hi-Lo -1.");
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
    let before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("ace"));
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));

    await awaitRestartFrom(before);
    before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("done"));
    await waitFor(() => expect(screen.getByTestId("round-completed").textContent).toBe("true"));

    const roundsBefore = Number(screen.getByTestId("round-count").textContent);
    await awaitRestartFrom(before);
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
    const before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("ace"));
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));

    await awaitRestartFrom(before);
    await act(async () => sayFinal("undo"));

    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("0"));
    await waitFor(() => screen.getByText("✓ Undo"));
  });
});

describe('VoiceControl — "count"/"status" (read-only spoken feedback)', () => {
  it('"count" speaks the current Hi-Lo running count through speech synthesis and creates zero CardEvents', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    let before = MockSpeechRecognition.instances.length;
    // Two low cards (2, 3) -> Hi-Lo +2.
    await act(async () => sayFinal("two"));
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));
    await awaitRestartFrom(before);
    before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("three"));
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("2"));

    await awaitRestartFrom(before);
    await act(async () => sayFinal("count"));

    await waitFor(() => screen.getByText(/Hi-Lo \+2\./));
    expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1);
    const spoken = mockSpeechSynthesis.speak.mock.calls[0][0] as MockSpeechSynthesisUtterance;
    expect(spoken.text).toContain("Hi-Lo +2.");
    // Read-only — the count command itself never added a card.
    expect(screen.getByTestId("dealer-card-count").textContent).toBe("2");
  });

  it('"status" speaks just the count (default content: Hi-Lo RC only) — no target/round preamble anymore', async () => {
    const investigationId = await freshInvestigationId();
    const { occupySeat } = await import("@/lib/db/repositories/investigations");
    await occupySeat(investigationId, 2);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    const before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("seat two"));
    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("2"));

    await awaitRestartFrom(before);
    await act(async () => sayFinal("status"));

    await waitFor(() => screen.getByText("✓ Hi-Lo 0."));
    expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1);
  });

  it('"status" respects the floorSpokenCountContent setting ("hiloRcTc" adds the true count sentence)', async () => {
    const { useSettingsStore } = await import("@/store/useSettingsStore");
    useSettingsStore.getState().setFloorSpokenCountContent("hiloRcTc");

    try {
      const investigationId = await freshInvestigationId();
      const { occupySeat } = await import("@/lib/db/repositories/investigations");
      await occupySeat(investigationId, 2);

      render(
        <InvestigationProvider investigationId={investigationId}>
          <VoiceControl />
          <ActiveTargetProbe />
        </InvestigationProvider>
      );
      await startListening();
      await act(async () => sayFinal("status"));

      await waitFor(() => screen.getByText(/✓ Hi-Lo 0\.\s*True count/));
    } finally {
      useSettingsStore.getState().setFloorSpokenCountContent("hiloRc");
    }
  });

  it('"status" with floorSpokenCountContent "off" -> visual pill still shows a real count, but nothing is spoken', async () => {
    const { useSettingsStore } = await import("@/store/useSettingsStore");
    useSettingsStore.getState().setFloorSpokenCountContent("off");

    try {
      const investigationId = await freshInvestigationId();
      render(
        <InvestigationProvider investigationId={investigationId}>
          <VoiceControl />
        </InvestigationProvider>
      );
      await startListening();
      await act(async () => sayFinal("status"));

      await waitFor(() => screen.getByText("✓ Hi-Lo 0."));
      expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
    } finally {
      useSettingsStore.getState().setFloorSpokenCountContent("hiloRc");
    }
  });

  it("does not speak when the operator has turned spoken voice feedback off in Settings, but the status pill still shows the same text", async () => {
    const { useSettingsStore } = await import("@/store/useSettingsStore");
    useSettingsStore.getState().setVoiceAudioFeedback(false);

    try {
      const investigationId = await freshInvestigationId();
      render(
        <InvestigationProvider investigationId={investigationId}>
          <VoiceControl />
        </InvestigationProvider>
      );
      await startListening();
      await act(async () => sayFinal("count"));

      await waitFor(() => screen.getByText(/Hi-Lo 0\./));
      expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
    } finally {
      useSettingsStore.getState().setVoiceAudioFeedback(true);
    }
  });
});

describe("VoiceControl — TTS self-hearing protection (mic must not re-hear its own spoken count)", () => {
  it("while the count summary is being spoken, no new recognition session starts; one begins again only once the utterance ends", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("status"));
    await waitFor(() => expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1));

    const utterance = mockSpeechSynthesis.speak.mock.calls[0][0] as MockSpeechSynthesisUtterance;
    const instancesBeforeSpeaking = MockSpeechRecognition.instances.length;

    // The utterance actually starting playing suppresses the mic — the
    // subscription this test proves is wired (the mechanism itself is
    // covered exhaustively in useVoiceRecognition.test.ts).
    await act(async () => {
      utterance.onstart?.();
    });
    // Give any (incorrectly) still-scheduled restart a chance to fire.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(MockSpeechRecognition.instances.length).toBe(instancesBeforeSpeaking);

    // The utterance finishing resumes listening — a fresh session appears.
    await act(async () => {
      utterance.onend?.();
    });
    await waitFor(() => expect(MockSpeechRecognition.instances.length).toBeGreaterThan(instancesBeforeSpeaking));
  });
});

describe("VoiceControl — investigation-lifecycle voice commands (Pause/Resume/New Shoe/End Investigation/Full Status)", () => {
  it('"pause investigation" pauses; "resume investigation" resumes — both speak a short confirmation', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    const before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("pause investigation"));

    await waitFor(() => expect(screen.getByTestId("investigation-status").textContent).toBe("paused"));
    await waitFor(() => screen.getByText("✓ Paused"));
    expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1);

    await awaitRestartFrom(before);
    await act(async () => sayFinal("resume investigation"));

    await waitFor(() => expect(screen.getByTestId("investigation-status").textContent).toBe("active"));
    await waitFor(() => screen.getByText("✓ Resumed"));
    expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(2);
  });

  it('"pause investigation" on an ALREADY-paused investigation is rejected as already-paused, never re-announced', async () => {
    const investigationId = await freshInvestigationId();
    const { pauseInvestigation } = await import("@/lib/db/repositories/investigations");
    await pauseInvestigation(investigationId); // already paused before voice ever hears anything

    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await waitFor(() => expect(screen.getByTestId("investigation-status").textContent).toBe("paused"));
    await act(async () => sayFinal("pause investigation"));

    await waitFor(() => screen.getByText(/Already paused/));
    expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
  });

  it('while paused, card entry stays blocked — pause never becomes a silent second entry-lock system', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    const before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("pause investigation"));
    await waitFor(() => expect(screen.getByTestId("investigation-status").textContent).toBe("paused"));

    await awaitRestartFrom(before);
    await act(async () => sayFinal("king"));

    await waitFor(() => screen.getByText(/isn.t available right now|not available/));
    expect(screen.getByTestId("dealer-card-count").textContent).toBe("0");
  });

  it('"new shoe" with an empty shoe (nothing recorded yet) starts immediately, no confirmation needed, and announces the fresh count', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("new shoe"));

    await waitFor(() => expect(screen.getByTestId("shoe-number").textContent).toBe("2"));
    await waitFor(() => screen.getByText("✓ Shoe 2 started. Hi-Lo 0."));
    expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1);
  });

  it('"new shoe" with cards recorded in a COMPLETED round requires "confirm new shoe" before anything happens — never finalizes on one recognition result', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    let before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("king")); // Hi-Lo -1, dealer
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));

    await awaitRestartFrom(before);
    before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("done"));
    await waitFor(() => expect(screen.getByTestId("round-completed").textContent).toBe("true"));

    await awaitRestartFrom(before);
    before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("new shoe"));

    // Still shoe 1 — nothing happened yet, only a pending confirmation.
    await waitFor(() => screen.getByText(/confirm new shoe/));
    expect(screen.getByTestId("shoe-number").textContent).toBe("1");

    await awaitRestartFrom(before);
    await act(async () => sayFinal("confirm new shoe"));

    await waitFor(() => expect(screen.getByTestId("shoe-number").textContent).toBe("2"));
    await waitFor(() => screen.getByText(/Shoe 2 started/));
  });

  it('a DIFFERENT command heard after "new shoe" silently drops the pending confirmation — "confirm new shoe" said later does nothing', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    let before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("king"));
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));
    await awaitRestartFrom(before);
    before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("done"));
    await waitFor(() => expect(screen.getByTestId("round-completed").textContent).toBe("true"));

    await awaitRestartFrom(before);
    before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("new shoe"));
    await waitFor(() => screen.getByText(/confirm new shoe/));

    // A different, unrelated command interrupts the pending confirmation.
    await awaitRestartFrom(before);
    before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("status"));
    await waitFor(() => screen.getByText(/Hi-Lo/));

    // "confirm new shoe" now, with nothing pending, must do nothing.
    await awaitRestartFrom(before);
    await act(async () => sayFinal("confirm new shoe"));
    await waitFor(() => screen.getByText(/Not recognized/));
    expect(screen.getByTestId("shoe-number").textContent).toBe("1");
  });

  it('"new shoe" while the current round is still open (not completed) but has cards -> rejected with a brief explanation, defers to the manual control', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    const before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("king")); // dealer card, round still open
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));

    await awaitRestartFrom(before);
    await act(async () => sayFinal("new shoe"));

    await waitFor(() => screen.getByText(/round isn.t complete/));
    expect(screen.getByTestId("shoe-number").textContent).toBe("1");
  });

  it('"end investigation" requires "confirm end investigation" — the bare phrase alone never closes anything', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("end investigation"));

    await waitFor(() => screen.getByText(/confirm end investigation/));
    expect(screen.getByTestId("investigation-status").textContent).toBe("active");
  });

  it('"confirm end investigation" actually closes the investigation once pending, and speaks a confirmation', async () => {
    const investigationId = await freshInvestigationId();
    const { getInvestigation } = await import("@/lib/db/repositories/investigations");
    const reloadSpy = vi.fn();
    const assignSpy = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, pathname: "/", reload: reloadSpy, assign: assignSpy },
    });

    try {
      render(
        <InvestigationProvider investigationId={investigationId}>
          <VoiceControl />
          <ActiveTargetProbe />
        </InvestigationProvider>
      );
      await startListening();
      const before = MockSpeechRecognition.instances.length;
      await act(async () => sayFinal("end investigation"));
      await waitFor(() => screen.getByText(/confirm end investigation/));
      expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1); // the pending-confirmation prompt itself is spoken too
      mockSpeechSynthesis.speak.mockClear();

      await awaitRestartFrom(before);
      await act(async () => sayFinal("confirm end investigation"));

      await waitFor(() => screen.getByText("✓ Investigation ended."));
      expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1);
      const closed = await getInvestigation(investigationId);
      expect(closed!.status).toBe("closed");
      // End & Review lands on the just-closed investigation's own review
      // (Reports opened via ?review=1), not bare home — see LiveMenu.tsx's
      // and VoiceControl.tsx's handleEndInvestigation/confirm-end-investigation.
      expect(reloadSpy).not.toHaveBeenCalled();
      expect(assignSpy).toHaveBeenCalledTimes(1);
      expect(assignSpy).toHaveBeenCalledWith(`/investigations/${investigationId}/live?review=1`);
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    }
  });

  it('"full status" speaks every enabled system\'s running count (same content "all" already gives Count), regardless of the configured floorSpokenCountContent setting', async () => {
    const { useSettingsStore } = await import("@/store/useSettingsStore");
    useSettingsStore.getState().setFloorSpokenCountContent("off"); // even fully "off"...

    try {
      const investigationId = await freshInvestigationId();
      render(
        <InvestigationProvider investigationId={investigationId}>
          <VoiceControl />
          <ActiveTargetProbe />
        </InvestigationProvider>
      );
      await startListening();
      await act(async () => sayFinal("full status"));

      // ...still speaks, since "full status" is an explicit, one-off
      // request. KO's own -20 here isn't a bug — a 6-deck shoe seeds KO's
      // Initial Running Count at -4 per extra deck (see countTags.ts);
      // this is the exact same value every other count surface shows.
      await waitFor(() => screen.getByText(/Hi-Lo 0\..*K O -20\..*Zen 0\..*Omega II 0\./));
      expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1);
    } finally {
      useSettingsStore.getState().setFloorSpokenCountContent("hiloRc");
    }
  });
});

describe("VoiceControl — natural hand narration, end to end (milestone required tests A-I)", () => {
  it('A. "dealer king ace" -> exactly 2 dealer CardEvents, with a compact confirmation', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("dealer king ace"));

    await waitFor(() => screen.getByText("✓ DEALER: K A"));
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("2"));
  });

  it('B. "seat one five three seven" -> exactly 3 Seat-1 CardEvents', async () => {
    const investigationId = await freshInvestigationId();
    const { occupySeat } = await import("@/lib/db/repositories/investigations");
    await occupySeat(investigationId, 1);
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("seat one five three seven"));

    await waitFor(() => screen.getByText("✓ S1: 5 3 7"));
    await waitFor(() => expect(screen.getByTestId("seat-1-card-count").textContent).toBe("3"));
  });

  it('C. "C3 85" -> Seat 3: 8, 5 — the C<n> artifact as a narration target plus a compact digit run decomposed', async () => {
    const investigationId = await freshInvestigationId();
    const { occupySeat } = await import("@/lib/db/repositories/investigations");
    await occupySeat(investigationId, 3);
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("C3 85"));

    await waitFor(() => screen.getByText("✓ S3: 8 5"));
    await waitFor(() => expect(screen.getByTestId("seat-3-card-count").textContent).toBe("2"));
  });

  it('E. "new hand dealer ace king seat one four five seat two three five nine done" -> complete narration across workflow + multiple targets', async () => {
    const investigationId = await freshInvestigationId();
    const { occupySeat } = await import("@/lib/db/repositories/investigations");
    await occupySeat(investigationId, 1);
    await occupySeat(investigationId, 2);
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () =>
      sayFinal("new hand dealer ace king seat one four five seat two three five nine done")
    );

    // "new hand" parses to the same "next" workflow op bare "next" produces
    // (see parseNarration's SINGLE_WORD_WORKFLOW / two-token lookahead), so
    // it renders as its own leading "NEXT" clause exactly like any other
    // workflow op in the sequence — consistent with
    // narrationConfirmation.test.ts's own "NEXT · DEALER: A · S1: 4 · DONE"
    // case.
    await waitFor(() => screen.getByText("✓ NEXT · DEALER: A K · S1: 4 5 · S2: 3 5 9 · DONE"));
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("2"));
    await waitFor(() => expect(screen.getByTestId("seat-1-card-count").textContent).toBe("2"));
    await waitFor(() => expect(screen.getByTestId("seat-2-card-count").textContent).toBe("3"));
    await waitFor(() => expect(screen.getByTestId("round-completed").textContent).toBe("true"));
  });

  it('F. "seat three raised his bet after the five" (a casino observation, not narration) -> zero CardEvents', async () => {
    const investigationId = await freshInvestigationId();
    const { occupySeat } = await import("@/lib/db/repositories/investigations");
    await occupySeat(investigationId, 3);
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("seat three raised his bet after the five"));

    await waitFor(() => screen.getByText(/Not recognized/));
    expect(screen.getByTestId("seat-3-card-count").textContent).toBe("0");
  });

  it('H. malformed narration ("dealer king ace seat nine five") commits ZERO events — never the valid "dealer king ace" prefix', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("dealer king ace seat nine five"));

    await waitFor(() => screen.getByText(/Not recognized/));
    // Not just "no seat 9" — the earlier, individually-valid "dealer king
    // ace" must ALSO not have been committed. Zero cards anywhere proves
    // the whole narration was validated before anything was dispatched.
    expect(screen.getByTestId("dealer-card-count").textContent).toBe("0");
  });

  it("I. the exact same FINAL narration delivered twice in quick succession (a recognition restart artifact) produces exactly one set of CardEvents, never two", async () => {
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
      // Same native session firing the identical final transcript twice —
      // the existing duplicate-window guard (unchanged by this milestone)
      // must still catch this exactly as it always has.
      instance.onresult?.(makeResultEvent("dealer king ace", true));
      instance.onresult?.(makeResultEvent("dealer king ace", true));
    });

    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("2"));
    expect(screen.getByTestId("dealer-card-count").textContent).toBe("2");
  });
});

describe("VoiceControl — ATOMIC COMMIT: a multi-op narration commits ALL of its operations or NONE, never a partial prefix or suffix", () => {
  // Distinct from test H above: H is a PARSE-time rejection (seat 9 is
  // never a valid seat number at all, so parseNarration itself never
  // produces ops). These are RUNTIME preflight failures — the narration
  // parses into a perfectly valid ops list, but one op's target isn't
  // actually usable right now. Before this fix, commitNarration would
  // silently skip just that one infeasible op and keep committing the
  // rest; now the whole narration must preflight successfully BEFORE
  // anything commits.
  //
  // NOTE: an unoccupied seat is no longer a usable failure trigger here —
  // per the real-device Floor fix, an explicit voice target naming an
  // empty seat now occupies it (tap parity), so these use a seat whose
  // hand is already LOCKED (an outcome already recorded — see
  // isSeatLocked) as the genuinely infeasible target instead.
  async function lockSeat(investigationId: string, seatNumber: number) {
    const { occupySeat, getInvestigation, mutateRound } = await import("@/lib/db/repositories/investigations");
    await occupySeat(investigationId, seatNumber);
    const inv = await getInvestigation(investigationId);
    const roundId = inv!.rounds[inv!.rounds.length - 1].id;
    await mutateRound(
      investigationId,
      roundId,
      (round) => ({
        ...round,
        seats: { ...round.seats, [seatNumber]: { ...round.seats[seatNumber]!, outcome: "win" } },
      }),
      { type: "correction", message: `test setup: lock seat ${seatNumber}` }
    );
  }

  it('failure at the FIRST mutating op ("seat three five dealer king ace done", seat 3 already locked) -> zero events anywhere, including the later valid dealer cards', async () => {
    const investigationId = await freshInvestigationId();
    await lockSeat(investigationId, 3);
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("seat three five dealer king ace done"));

    await waitFor(() => screen.getByText(/isn.t available right now/));
    expect(screen.getByTestId("seat-3-card-count").textContent).toBe("0");
    expect(screen.getByTestId("dealer-card-count").textContent).toBe("0");
    expect(screen.getByTestId("round-completed").textContent).toBe("false");
  });

  it('failure in the MIDDLE ("dealer king ace seat three five done", seat 3 already locked) -> zero events, including the earlier valid "dealer king ace"', async () => {
    const investigationId = await freshInvestigationId();
    await lockSeat(investigationId, 3);
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("dealer king ace seat three five done"));

    await waitFor(() => screen.getByText(/isn.t available right now/));
    // The individually-valid "dealer king ace" prefix must NOT have landed
    // just because it preflighted fine before the seat 3 failure was found.
    expect(screen.getByTestId("dealer-card-count").textContent).toBe("0");
    expect(screen.getByTestId("seat-3-card-count").textContent).toBe("0");
    expect(screen.getByTestId("round-completed").textContent).toBe("false");
  });

  it('failure at the FINAL op ("dealer king ace done", with seat 1 wagered but zero cards -> Done infeasible) -> zero events, including the earlier valid dealer cards', async () => {
    const investigationId = await freshInvestigationId();
    const { occupySeat, getInvestigation, updateSeatBet } = await import("@/lib/db/repositories/investigations");
    await occupySeat(investigationId, 1);
    const inv = await getInvestigation(investigationId);
    const roundId = inv!.rounds[inv!.rounds.length - 1].id;
    // A wagered seat with zero cards is exactly what canCompleteRound
    // blocks on — see roundValidation.ts's checkHand — so "done" is
    // infeasible even though nothing at all is wrong with the dealer cards
    // this same narration is about to add.
    await updateSeatBet(investigationId, roundId, 1, 25, { direction: "first", amount: null, overridden: false });

    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("dealer king ace done"));

    await waitFor(() => screen.getByText(/Done isn.t available/));
    // Not just "Done didn't run" — the dealer cards that preflighted fine
    // on their own must not have landed either, since the WHOLE narration
    // (dealer cards + done) failed preflight together.
    expect(screen.getByTestId("dealer-card-count").textContent).toBe("0");
    expect(screen.getByTestId("round-completed").textContent).toBe("false");
  });

  it('a fully feasible narration ("dealer king ace seat one five three seven done") commits every operation exactly once', async () => {
    const investigationId = await freshInvestigationId();
    const { occupySeat } = await import("@/lib/db/repositories/investigations");
    await occupySeat(investigationId, 1);
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("dealer king ace seat one five three seven done"));

    await waitFor(() => screen.getByText("✓ DEALER: K A · S1: 5 3 7 · DONE"));
    expect(screen.getByTestId("dealer-card-count").textContent).toBe("2");
    expect(screen.getByTestId("seat-1-card-count").textContent).toBe("3");
    expect(screen.getByTestId("round-completed").textContent).toBe("true");
  });

  it("the exact same FINAL multi-op narration delivered twice in quick succession commits its whole operation set exactly once, never twice", async () => {
    const investigationId = await freshInvestigationId();
    const { occupySeat } = await import("@/lib/db/repositories/investigations");
    await occupySeat(investigationId, 1);
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    const instance = MockSpeechRecognition.latest();
    await act(async () => {
      instance.onresult?.(makeResultEvent("dealer king ace seat one five three seven done", true));
      instance.onresult?.(makeResultEvent("dealer king ace seat one five three seven done", true));
    });

    await waitFor(() => expect(screen.getByTestId("round-completed").textContent).toBe("true"));
    expect(screen.getByTestId("dealer-card-count").textContent).toBe("2");
    expect(screen.getByTestId("seat-1-card-count").textContent).toBe("3");
  });
});

describe("VoiceControl — REAL DEVICE FIX: target synonyms are identical AND an explicit empty-seat target occupies + activates (tap parity)", () => {
  // Before this fix: "Seat 2" alone set the active target to 2 without
  // occupying it, so the UI showed "ACTIVE — SEAT 2" while the card pad
  // simultaneously said "Seat not enabled" — internally inconsistent.
  // occupySeat is the same production path SeatTilesRow's own tap handler
  // calls (it already no-ops to a plain select when a seat is already
  // occupied), so routing voice through it exactly mirrors a tap.
  it.each(["Seat 2", "Spot 2", "Player 2", "C2"])(
    '"%s" on an empty seat -> Seat 2 becomes occupied AND active, identically for every synonym',
    async (transcript) => {
      const investigationId = await freshInvestigationId();
      render(
        <InvestigationProvider investigationId={investigationId}>
          <VoiceControl />
          <ActiveTargetProbe />
        </InvestigationProvider>
      );
      await startListening();
      await act(async () => sayFinal(transcript));

      await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("2"));
      await waitFor(() => expect(screen.getByTestId("occupied-seats").textContent).toBe("2"));
    }
  );

  it('"seat two five" (seat 2 never occupied) -> seat 2 is occupied, activated, AND the card is entered — no separate "enable seat two" step required', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("seat two five"));

    await waitFor(() => expect(screen.getByTestId("occupied-seats").textContent).toBe("2"));
    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("2"));
    // seat-card-count probes only render for seats 1-3, which covers seat 2.
    await waitFor(() => expect(screen.getByTestId("seat-2-card-count").textContent).toBe("1"));
  });
});

describe("VoiceControl — ATOMICITY FOLLOW-UP: combined 'empty seat + card' voice commands go through the atomic occupySeatAndAddCard path", () => {
  // The exact path audited: dispatch's "card" case with an explicit target
  // (the legacy 2-op equivalent "seat two five" defers to here, not
  // narration — see isTrivialLegacyEquivalent). Repository-level proof of
  // the transaction itself (including the forced-failure rollback case)
  // lives in cardEvents.test.ts; these confirm the SAME atomic path is
  // actually what VoiceControl dispatches through, for every target
  // synonym, and that the pre-existing "already occupied" path is
  // unchanged.
  it.each(["seat two five", "spot two five", "player two five", "C2 five"])(
    '"%s" on an empty seat -> occupied + exactly one CardEvent, identically for every synonym',
    async (transcript) => {
      const investigationId = await freshInvestigationId();
      render(
        <InvestigationProvider investigationId={investigationId}>
          <VoiceControl />
          <ActiveTargetProbe />
        </InvestigationProvider>
      );
      await startListening();
      await act(async () => sayFinal(transcript));

      await waitFor(() => expect(screen.getByTestId("occupied-seats").textContent).toBe("2"));
      await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("2"));
      await waitFor(() => expect(screen.getByTestId("seat-2-card-count").textContent).toBe("1"));

      const { getCardEventsForInvestigation } = await import("@/lib/db/repositories/cardEvents");
      const events = await getCardEventsForInvestigation(investigationId);
      expect(events).toHaveLength(1);
      expect(events[0].rank).toBe("5");
    }
  );

  it('an ALREADY-occupied Seat 2 + "seat two five" -> unchanged normal path: no new player group, exactly one card entered', async () => {
    const investigationId = await freshInvestigationId();
    const { occupySeat, getInvestigation } = await import("@/lib/db/repositories/investigations");
    await occupySeat(investigationId, 2);
    const before = await getInvestigation(investigationId);
    const groupCountBefore = Object.keys(before!.playerGroups).length;

    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("seat two five"));

    await waitFor(() => expect(screen.getByTestId("seat-2-card-count").textContent).toBe("1"));
    const after = await getInvestigation(investigationId);
    expect(Object.keys(after!.playerGroups)).toHaveLength(groupCountBefore);
  });
});

describe("VoiceControl — REAL DEVICE FIX: natural hand connectors and leading-seat shorthand, end to end", () => {
  it('"spot 3 has a 5 and a 7" -> Seat 3 occupied + active, cards 5 and 7 entered', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("spot 3 has a 5 and a 7"));

    await waitFor(() => screen.getByText("✓ S3: 5 7"));
    expect(screen.getByTestId("occupied-seats").textContent).toBe("3");
    expect(screen.getByTestId("active-target").textContent).toBe("3");
    expect(screen.getByTestId("seat-3-card-count").textContent).toBe("2");
  });

  it('"player 2 has 4 8" -> Seat 2 occupied + active, cards 4 and 8 entered', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("player 2 has 4 8"));

    await waitFor(() => screen.getByText("✓ S2: 4 8"));
    expect(screen.getByTestId("occupied-seats").textContent).toBe("2");
    expect(screen.getByTestId("seat-2-card-count").textContent).toBe("2");
  });

  it('"seat one has king ace" -> Seat 1 occupied + active, cards K and A entered', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("seat one has king ace"));

    await waitFor(() => screen.getByText("✓ S1: K A"));
    expect(screen.getByTestId("occupied-seats").textContent).toBe("1");
    expect(screen.getByTestId("seat-1-card-count").textContent).toBe("2");
  });

  it('"one has a king and an ace" (leading-seat shorthand, no "seat"/"spot"/"player" word) -> Seat 1 occupied + active, cards K and A entered', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("one has a king and an ace"));

    await waitFor(() => screen.getByText("✓ S1: K A"));
    expect(screen.getByTestId("occupied-seats").textContent).toBe("1");
    expect(screen.getByTestId("seat-1-card-count").textContent).toBe("2");
  });

  it.each(["I ordered five pizzas", "seat three raised his bet after the five"])(
    '"%s" -> zero CardEvents (connector grammar never reopens ordinary-conversation noise tolerance)',
    async (transcript) => {
      const investigationId = await freshInvestigationId();
      render(
        <InvestigationProvider investigationId={investigationId}>
          <VoiceControl />
          <ActiveTargetProbe />
        </InvestigationProvider>
      );
      await startListening();
      await act(async () => sayFinal(transcript));

      await waitFor(() => screen.getByText(/Not recognized/));
      expect(screen.getByTestId("dealer-card-count").textContent).toBe("0");
      expect(screen.getByTestId("seat-3-card-count").textContent).toBe("0");
    }
  );
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
    await waitFor(() => screen.getByText(/Microphone permission was denied\..*not-allowed/));

    // Manual controls must still work exactly as if voice never ran.
    const tenButton = screen.getByRole("button", { name: "10" });
    await act(async () => {
      tenButton.click();
    });
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));
  });

  it("a genuinely offline device (repeated network errors) shows a persistent Voice Unavailable state, never loops, and never disables manual card entry", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
        <CardEntryPad />
        <ActiveTargetProbe />
      </InvestigationProvider>
    );

    await startListening();
    // Every attempt fails identically, as it would with no network path to
    // the speech service at all — real browsers fire onend after onerror.
    for (let i = 0; i < 4; i++) {
      const instance = MockSpeechRecognition.latest();
      await act(async () => {
        instance.onerror?.({ error: "network" });
        instance.onend?.();
      });
    }

    await waitFor(() => screen.getByText(/Voice unavailable — offline/));
    screen.getByText(/investigation is unaffected/i);
    // The mic button itself is gone — replaced by the persistent notice,
    // not left pulsing uselessly.
    expect(screen.queryByRole("button", { name: "Stop listening" })).toBeNull();

    // Manual entry is completely untouched by any of this.
    const tenButton = screen.getByRole("button", { name: "10" });
    await act(async () => {
      tenButton.click();
    });
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));

    // Tapping the notice retries — a fresh, deliberate attempt, not an
    // automatic one.
    const before = MockSpeechRecognition.instances.length;
    await act(async () => {
      screen.getByText(/Voice unavailable — offline/).closest("button")!.click();
    });
    expect(MockSpeechRecognition.instances.length).toBeGreaterThan(before);
    await screen.findByRole("button", { name: "Stop listening" });
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

    await startListening();
    for (const word of ["two", "three", "ten"]) {
      const before = MockSpeechRecognition.instances.length;
      await act(async () => sayFinal(word));
      await awaitRestartFrom(before);
    }

    await waitFor(() => expect(screen.getByLabelText("HI-LO running count").textContent).toBe("+1"));
  });
});

describe("VoiceControl — diagnostics panel", () => {
  it("stays collapsed by default during ordinary voice entry, even once log entries exist — only the deliberate Debug toggle reveals it", async () => {
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

    // The card entered fine and the small status pill confirmed it — but
    // the full diagnostics log/lifecycle text must never have appeared on
    // its own, even though plenty of log entries now exist.
    expect(screen.queryByText("STARTED")).toBeNull();
    expect(screen.queryByText("Voice Diagnostics")).toBeNull();
    expect(screen.queryByText(/Copy Voice Log/)).toBeNull();

    const debugButton = screen.getByRole("button", { name: "Show Voice Diagnostics" });
    await act(async () => {
      debugButton.click();
    });
    // Only now, after a deliberate tap, does the log actually show.
    screen.getByText("Voice Diagnostics");
    screen.getByText("STARTED");
  });

  it("appending multiple voice sessions, including multi-alternative results, never produces duplicate diagnostic entry keys", async () => {
    // Regression test for a real console error: "Encountered two children
    // with the same key". The trigger is several appendLog() calls firing
    // synchronously in one tick (result.alternatives.forEach(...) below) —
    // exercised here across two separate start/stop sessions, each with
    // multiple alternatives, to also confirm the id counter is genuinely
    // monotonic across sessions rather than resetting on each STARTED.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
      </InvestigationProvider>
    );

    await startListening();
    let before = MockSpeechRecognition.instances.length;
    await act(async () => {
      const instance = MockSpeechRecognition.latest();
      const result = {
        isFinal: true,
        length: 3,
        0: { transcript: "king", confidence: 0.4 },
        1: { transcript: "thing", confidence: 0.3 },
        2: { transcript: "ring", confidence: 0.2 },
      };
      instance.onresult?.({ resultIndex: 0, results: { length: 1, 0: result } });
    });

    await awaitRestartFrom(before);
    before = MockSpeechRecognition.instances.length;
    await act(async () => {
      const instance = MockSpeechRecognition.latest();
      const result = {
        isFinal: true,
        length: 2,
        0: { transcript: "queen", confidence: 0.5 },
        1: { transcript: "green", confidence: 0.3 },
      };
      instance.onresult?.({ resultIndex: 0, results: { length: 1, 0: result } });
    });

    await openDiagnostics();
    await waitFor(() => screen.getByText("Voice Diagnostics"));

    const duplicateKeyErrors = consoleError.mock.calls.filter((args) =>
      args.some((arg) => typeof arg === "string" && arg.includes("same key"))
    );
    expect(duplicateKeyErrors).toHaveLength(0);

    consoleError.mockRestore();
  });

  it("logs the full recognition lifecycle, every alternative with its confidence, and the outcome", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
      </InvestigationProvider>
    );

    await startListening();
    await openDiagnostics();
    await waitFor(() => screen.getByText("STARTED"));

    const instance = MockSpeechRecognition.latest();
    await act(async () => {
      instance.onaudiostart?.();
      instance.onsoundstart?.();
      instance.onspeechstart?.();
    });
    await waitFor(() => screen.getByText("AUDIO START"));
    screen.getByText("SOUND START");
    screen.getByText("SPEECH START");

    // Multiple alternatives — logged in full, but only alternatives[0] is
    // ever checked against the parser.
    await act(async () => {
      const alt0 = { transcript: "king", confidence: 0.4 };
      const alt1 = { transcript: "thing", confidence: 0.3 };
      const result = { isFinal: true, length: 2, 0: alt0, 1: alt1 };
      const results = { length: 1, 0: result };
      instance.onresult?.({ resultIndex: 0, results });
    });

    await waitFor(() => screen.getByText(/FINAL #1/));
    expect(screen.getByText(/"king" \(confidence: 0.40\)/)).toBeTruthy();
    expect(screen.getByText(/"thing" \(confidence: 0.30\)/)).toBeTruthy();
    await waitFor(() => screen.getByText("ACCEPTED"));
    await waitFor(() => screen.getByText("END"));
  });

  it("logs the exact error code verbatim, even for a code with no built-in description", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => {
      MockSpeechRecognition.latest().onerror?.({ error: "some-brand-new-error-code" });
    });
    await openDiagnostics();
    // Appears in both the status pill and the diagnostics log — two matches is expected.
    const matches = await screen.findAllByText(/some-brand-new-error-code/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it.each(["no-speech", "audio-capture", "not-allowed", "service-not-allowed", "network", "aborted", "language-not-supported"])(
    "displays a description for the %s error code",
    async (code) => {
      const investigationId = await freshInvestigationId();
      render(
        <InvestigationProvider investigationId={investigationId}>
          <VoiceControl />
        </InvestigationProvider>
      );
      await startListening();
      await act(async () => {
        MockSpeechRecognition.latest().onerror?.({ error: code });
      });
      await openDiagnostics();
      const matches = await screen.findAllByText(new RegExp(code));
      expect(matches.length).toBeGreaterThan(0);
    }
  );

  it('"Copy Voice Log" copies the rendered log to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
      </InvestigationProvider>
    );
    await startListening();
    await act(async () => sayFinal("ace"));
    await waitFor(() => screen.getByText("✓ DEALER: A"));
    await openDiagnostics();
    await waitFor(() => screen.getByText("ACCEPTED"));

    const copyButton = screen.getByRole("button", { name: /Copy Voice Log/ });
    await act(async () => {
      copyButton.click();
    });

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const loggedText = writeText.mock.calls[0][0] as string;
    expect(loggedText).toContain("STARTED");
    expect(loggedText).toContain("ACCEPTED");
    expect(loggedText).toContain("ace");
  });
});

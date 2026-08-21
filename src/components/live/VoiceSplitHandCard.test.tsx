// @vitest-environment jsdom
//
// EyeOnPit 1.10 Phase 5 — explicit split-hand voice card targeting. Same
// harness pattern as VoiceSplitDouble.test.tsx (jsdom has no real
// SpeechRecognition, so a small mock constructor drives onresult directly).
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
import { buildReportFromInvestigation } from "@/lib/reporting/reportBuilder";
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

/** Occupies seat 3 and gives it a $25 starting wager — the shared setup for the unsplit-seat tests below. */
async function occupySeat3WithBet(investigationId: string): Promise<void> {
  await occupySeat(investigationId, 3);
  const inv = await getInvestigation(investigationId);
  await updateSeatBet(investigationId, inv!.rounds[0].id, 3, 25, { direction: "first", amount: 25, overridden: false });
}

/** Occupies, bets, and splits seat 3 via the repository directly (bypassing voice) — the shared setup for every split-seat test below. */
async function occupyBetAndSplitSeat3(investigationId: string): Promise<void> {
  await occupySeat3WithBet(investigationId);
  const inv = await getInvestigation(investigationId);
  await splitSeat(investigationId, inv!.rounds[0].id, 3);
}

function SplitHandCardProbe() {
  const { activeTarget, investigation, redo } = useInvestigationContext();
  const round = investigation.rounds[investigation.rounds.length - 1];
  const primary = round.seats[3];
  const split = round.splitHands[3];
  return (
    <div>
      <div data-testid="active-target">{String(activeTarget)}</div>
      <div data-testid="hand1-cards">{(primary?.playerCards ?? []).map((c) => c.rank).join(",")}</div>
      <div data-testid="hand2-cards">{(split?.playerCards ?? []).map((c) => c.rank).join(",")}</div>
      <div data-testid="hand1-doubled">{String(Boolean(primary?.doubled))}</div>
      <div data-testid="hand2-doubled">{String(Boolean(split?.doubled))}</div>
      {/* Redo has no voice command (only Undo does — see WORKFLOW_WORDS in
          parseVoiceCommand.ts) — this test-only trigger calls the exact
          same context `redo()` the Undo/Redo UI button itself uses, so the
          Redo test below exercises the real production Redo path. */}
      <button type="button" data-testid="trigger-redo" onClick={() => redo()}>
        redo
      </button>
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
      <SplitHandCardProbe />
    </InvestigationProvider>
  );
}

describe("Voice split-hand card — accepted explicit forms", () => {
  it.each([
    ["spot 3 hand 1 has a five", "1", "5"],
    ["player 3 hand 1 has an ace", "1", "A"],
    ["seat 3 hand 1 has a seven", "1", "7"],
    ["spot 3 hand 2 has a king", "2", "10"],
    ["player 3 hand 2 has a ten", "2", "10"],
    ["seat 3 hand 2 has a queen", "2", "10"],
  ])('"%s" enters exactly one card on the named hand', async (transcript, hand, expectedRank) => {
    const investigationId = await freshInvestigationId();
    await occupyBetAndSplitSeat3(investigationId);
    renderVoice(investigationId);
    await startListening();

    await act(async () => sayFinal(transcript));

    const testId = hand === "1" ? "hand1-cards" : "hand2-cards";
    await waitFor(() => expect(screen.getByTestId(testId).textContent).toBe(expectedRank));
    const otherTestId = hand === "1" ? "hand2-cards" : "hand1-cards";
    expect(screen.getByTestId(otherTestId).textContent).toBe("");
    expect(screen.getByTestId("active-target").textContent).toBe(hand === "1" ? "3" : "-3");
  });

  it('"spot 3 hand 1 five" (no connector) is accepted — a safe equivalent of the existing connector-less plain-seat form', async () => {
    const investigationId = await freshInvestigationId();
    await occupyBetAndSplitSeat3(investigationId);
    renderVoice(investigationId);
    await startListening();

    await act(async () => sayFinal("spot 3 hand 1 five"));

    await waitFor(() => expect(screen.getByTestId("hand1-cards").textContent).toBe("5"));
  });
});

describe("Voice split-hand card — unsplit seat behavior", () => {
  it('explicit Hand 1 on an UNSPLIT seat is accepted — resolves to the same primary-hand target a bare card would', async () => {
    const investigationId = await freshInvestigationId();
    await occupySeat3WithBet(investigationId);
    renderVoice(investigationId);
    await startListening();

    await act(async () => sayFinal("spot 3 hand 1 has a five"));

    await waitFor(() => expect(screen.getByTestId("hand1-cards").textContent).toBe("5"));
    expect(screen.getByTestId("active-target").textContent).toBe("3");
  });

  it('explicit Hand 2 on an UNSPLIT seat is REJECTED — never silently reinterpreted as Hand 1', async () => {
    const investigationId = await freshInvestigationId();
    await occupySeat3WithBet(investigationId);
    renderVoice(investigationId);
    await startListening();

    await act(async () => sayFinal("spot 3 hand 2 has a five"));

    await waitFor(() => screen.getByText(/doesn't exist yet/i));
    expect(screen.getByTestId("hand1-cards").textContent).toBe("");
    expect(screen.getByTestId("hand2-cards").textContent).toBe("");
    expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
  });
});

describe("Voice split-hand card — bare target on a split seat is ambiguous", () => {
  it('"spot 3 has a five" once spot 3 is split is REJECTED as ambiguous — never guesses Hand 1 vs Hand 2', async () => {
    const investigationId = await freshInvestigationId();
    await occupyBetAndSplitSeat3(investigationId);
    renderVoice(investigationId);
    await startListening();

    const before = await getCardEventsForInvestigation(investigationId);
    expect(before).toHaveLength(0);

    await act(async () => sayFinal("spot 3 has a five"));

    await waitFor(() => screen.getByText(/hand 1.*hand 2|hand 2.*hand 1/i));
    expect(screen.getByTestId("hand1-cards").textContent).toBe("");
    expect(screen.getByTestId("hand2-cards").textContent).toBe("");
    const after = await getCardEventsForInvestigation(investigationId);
    expect(after).toHaveLength(0);
    expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
  });

  it('the SAME bare "spot 3 has a five" on an UNSPLIT seat is unaffected — still enters normally', async () => {
    const investigationId = await freshInvestigationId();
    await occupySeat3WithBet(investigationId);
    renderVoice(investigationId);
    await startListening();

    await act(async () => sayFinal("spot 3 has a five"));

    await waitFor(() => expect(screen.getByTestId("hand1-cards").textContent).toBe("5"));
  });
});

describe("Voice split-hand card — malformed hand targets fail closed", () => {
  it.each(["spot 3 hand 3 has a five", "spot 3 hand zero has a five", "spot 3 hand has a five"])(
    'malformed "%s" is rejected — never falls through into ordinary card parsing, never creates a CardEvent',
    async (transcript) => {
      const investigationId = await freshInvestigationId();
      await occupyBetAndSplitSeat3(investigationId);
      renderVoice(investigationId);
      await startListening();

      await act(async () => sayFinal(transcript));

      await waitFor(() => screen.getByText(/not recognized/i));
      expect(screen.getByTestId("hand1-cards").textContent).toBe("");
      expect(screen.getByTestId("hand2-cards").textContent).toBe("");
      const events = await getCardEventsForInvestigation(investigationId);
      expect(events).toHaveLength(0);
      expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
    }
  );

  it('a multi-card attempt under one hand ("...has a five and a king") blocks outright rather than partially entering the first card', async () => {
    const investigationId = await freshInvestigationId();
    await occupyBetAndSplitSeat3(investigationId);
    renderVoice(investigationId);
    await startListening();

    await act(async () => sayFinal("spot 3 hand 2 has a five and a king"));

    await waitFor(() => screen.getByText(/not recognized/i));
    expect(screen.getByTestId("hand2-cards").textContent).toBe("");
    const events = await getCardEventsForInvestigation(investigationId);
    expect(events).toHaveLength(0);
  });
});

describe("Voice split-hand card — count/ledger integrity", () => {
  it("a Hand 1 card produces exactly one CardEvent and the running count changes exactly once", async () => {
    const investigationId = await freshInvestigationId();
    await occupyBetAndSplitSeat3(investigationId);
    renderVoice(investigationId);
    await startListening();

    await act(async () => sayFinal("spot 3 hand 1 has a five")); // Hi-Lo +1
    await waitFor(() => expect(screen.getByLabelText("HI-LO running count").textContent).toBe("+1"));

    const events = await getCardEventsForInvestigation(investigationId);
    expect(events).toHaveLength(1);
    expect(events[0].rank).toBe("5");
    expect(events[0].targetType).toBe("seat");
  });

  it("a Hand 2 card produces exactly one CardEvent, targeted as the split hand, and the count changes exactly once", async () => {
    const investigationId = await freshInvestigationId();
    await occupyBetAndSplitSeat3(investigationId);
    renderVoice(investigationId);
    await startListening();

    await act(async () => sayFinal("spot 3 hand 2 has a king")); // Hi-Lo -1
    await waitFor(() => expect(screen.getByLabelText("HI-LO running count").textContent).toBe("-1"));

    const events = await getCardEventsForInvestigation(investigationId);
    expect(events).toHaveLength(1);
    expect(events[0].rank).toBe("10");
    expect(events[0].targetType).toBe("split");
  });

  it("Hand 1 then Hand 2 cards never migrate between hands — each stays exactly where it was spoken, count reflects both", async () => {
    const investigationId = await freshInvestigationId();
    await occupyBetAndSplitSeat3(investigationId);
    renderVoice(investigationId);
    await startListening();

    const before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("spot 3 hand 1 has a five")); // +1
    await waitFor(() => expect(screen.getByTestId("hand1-cards").textContent).toBe("5"));

    await awaitRestartFrom(before);
    await act(async () => sayFinal("spot 3 hand 2 has a king")); // -1

    await waitFor(() => expect(screen.getByTestId("hand2-cards").textContent).toBe("10"));
    expect(screen.getByTestId("hand1-cards").textContent).toBe("5");
    expect(screen.getByTestId("hand2-cards").textContent).toBe("10");
    await waitFor(() => expect(screen.getByLabelText("HI-LO running count").textContent).toBe("0"));

    const events = await getCardEventsForInvestigation(investigationId);
    expect(events).toHaveLength(2);
  });

  it("cards present on the primary hand BEFORE the split remain untouched by a voice-entered Hand 2 card", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeat3WithBet(investigationId);
    const invBefore = await getInvestigation(investigationId);
    const { addCardToRound } = await import("@/lib/db/repositories/cardEvents");
    const { updateSeatAtTarget } = await import("@/lib/utils/seatTarget");
    await addCardToRound({
      investigationLocalId: investigationId,
      roundId: invBefore!.rounds[0].id,
      targetType: "seat",
      targetId: 3,
      rank: "9",
      applyToRound: (round) =>
        updateSeatAtTarget(round, 3, (seat) => ({ ...seat, playerCards: [...seat.playerCards, { rank: "9", suit: "unspecified" }] })),
      event: { type: "card", message: "Spot 3: 9" },
    });
    const invForSplit = await getInvestigation(investigationId);
    await splitSeat(investigationId, invForSplit!.rounds[0].id, 3);

    renderVoice(investigationId);
    await startListening();
    await waitFor(() => expect(screen.getByTestId("hand1-cards").textContent).toBe("9"));

    await act(async () => sayFinal("spot 3 hand 2 has a five"));

    await waitFor(() => expect(screen.getByTestId("hand2-cards").textContent).toBe("5"));
    expect(screen.getByTestId("hand1-cards").textContent).toBe("9");
  });

  it("Double state stays associated with the correct hand after a voice-entered card on the OTHER hand", async () => {
    const investigationId = await freshInvestigationId();
    await occupyBetAndSplitSeat3(investigationId);
    const inv = await getInvestigation(investigationId);
    const { updateSeatAtTarget } = await import("@/lib/utils/seatTarget");
    const { mutateRound } = await import("@/lib/db/repositories/investigations");
    await mutateRound(
      investigationId,
      inv!.rounds[0].id,
      (round) => updateSeatAtTarget(round, -3, (seat) => ({ ...seat, doubled: true, doubledAtCardCount: seat.playerCards.length })),
      { type: "action", message: "Spot 3 (split): Double" }
    );

    renderVoice(investigationId);
    await startListening();
    await waitFor(() => expect(screen.getByTestId("hand2-doubled").textContent).toBe("true"));

    await act(async () => sayFinal("spot 3 hand 1 has a five"));

    await waitFor(() => expect(screen.getByTestId("hand1-cards").textContent).toBe("5"));
    expect(screen.getByTestId("hand1-doubled").textContent).toBe("false");
    expect(screen.getByTestId("hand2-doubled").textContent).toBe("true");
  });
});

describe("Voice split-hand card — Undo/Redo", () => {
  it("Undo after an explicit Hand 1 card removes exactly that card and reverses the count exactly once", async () => {
    const investigationId = await freshInvestigationId();
    await occupyBetAndSplitSeat3(investigationId);
    renderVoice(investigationId);
    await startListening();

    const before1 = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("spot 3 hand 1 has a five")); // +1
    await waitFor(() => expect(screen.getByTestId("hand1-cards").textContent).toBe("5"));
    await waitFor(() => expect(screen.getByLabelText("HI-LO running count").textContent).toBe("+1"));

    await awaitRestartFrom(before1);
    await act(async () => sayFinal("undo"));

    await waitFor(() => expect(screen.getByTestId("hand1-cards").textContent).toBe(""));
    expect(screen.getByLabelText("HI-LO running count").textContent).toBe("0");
    // Undo flips the CardEvent's own status to "undone" (see
    // CardEventStatus's own doc comment) rather than deleting the row — the
    // ledger stays a complete, append-only history; only ACTIVE events ever
    // count toward the running count or a hand's displayed cards.
    const events = await getCardEventsForInvestigation(investigationId);
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe("undone");
    expect(events.filter((e) => e.status === "active")).toHaveLength(0);
  });

  it("Undo after an explicit Hand 2 card removes exactly that card, leaves Hand 1 untouched, reverses the count exactly once", async () => {
    const investigationId = await freshInvestigationId();
    await occupyBetAndSplitSeat3(investigationId);
    renderVoice(investigationId);
    await startListening();

    const before1 = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("spot 3 hand 1 has a five")); // +1
    await waitFor(() => expect(screen.getByTestId("hand1-cards").textContent).toBe("5"));

    await awaitRestartFrom(before1);
    const before2 = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("spot 3 hand 2 has a king")); // -1, net 0
    await waitFor(() => expect(screen.getByTestId("hand2-cards").textContent).toBe("10"));
    await waitFor(() => expect(screen.getByLabelText("HI-LO running count").textContent).toBe("0"));

    await awaitRestartFrom(before2);
    await act(async () => sayFinal("undo"));

    await waitFor(() => expect(screen.getByTestId("hand2-cards").textContent).toBe(""));
    expect(screen.getByTestId("hand1-cards").textContent).toBe("5"); // untouched
    expect(screen.getByLabelText("HI-LO running count").textContent).toBe("+1");
  });

  it("Redo restores an undone Hand 2 card to the same logical hand, and the count restores exactly once", async () => {
    const investigationId = await freshInvestigationId();
    await occupyBetAndSplitSeat3(investigationId);
    renderVoice(investigationId);
    await startListening();

    const before1 = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("spot 3 hand 2 has a king")); // -1
    await waitFor(() => expect(screen.getByTestId("hand2-cards").textContent).toBe("10"));

    await awaitRestartFrom(before1);
    await act(async () => sayFinal("undo"));
    await waitFor(() => expect(screen.getByTestId("hand2-cards").textContent).toBe(""));
    expect(screen.getByLabelText("HI-LO running count").textContent).toBe("0");

    await act(async () => {
      screen.getByTestId("trigger-redo").click();
    });

    await waitFor(() => expect(screen.getByTestId("hand2-cards").textContent).toBe("10"));
    expect(screen.getByTestId("hand1-cards").textContent).toBe(""); // still untouched
    expect(screen.getByLabelText("HI-LO running count").textContent).toBe("-1");
  });
});

describe("Voice split-hand card — reporting association", () => {
  it("a voice-entered Hand 2 card is reported under handIndex 2 for the correct seat, Hand 1 stays its own separate entry", async () => {
    const investigationId = await freshInvestigationId();
    await occupyBetAndSplitSeat3(investigationId);
    renderVoice(investigationId);
    await startListening();

    const before = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("spot 3 hand 1 has a seven"));
    await waitFor(() => expect(screen.getByTestId("hand1-cards").textContent).toBe("7"));

    await awaitRestartFrom(before);
    await act(async () => sayFinal("spot 3 hand 2 has a queen"));
    await waitFor(() => expect(screen.getByTestId("hand2-cards").textContent).toBe("10"));

    const investigation = await getInvestigation(investigationId);
    const cardEvents = await getCardEventsForInvestigation(investigationId);
    const report = buildReportFromInvestigation({ investigation: investigation!, cardEvents });

    const roundEvidence = report.observedPlay.roundEvidence[0];
    const hand1Entry = roundEvidence.seats.find((s) => s.seatNumber === 3 && s.handIndex === 1);
    const hand2Entry = roundEvidence.seats.find((s) => s.seatNumber === 3 && s.handIndex === 2);
    expect(hand1Entry?.cards).toEqual(["7"]);
    expect(hand2Entry?.cards).toEqual(["10"]); // stored rank is always "10" for a face card — see RANK_WORDS' own doc comment
  });
});

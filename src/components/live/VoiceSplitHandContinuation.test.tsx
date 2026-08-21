// @vitest-environment jsdom
//
// EyeOnPit 1.10 Phase 6 — natural split-hand voice continuation. Proves
// that an explicit split-hand card command locks the active target, and a
// subsequent bare (unscoped) card continues to that SAME hand using the
// existing active-target architecture — no new conversational-memory
// mechanism was built; `activeTarget` (already signed: positive = primary
// hand, negative = split hand, since Phase 4/5) is the only state this
// phase reads or writes. Same harness pattern as VoiceSplitHandCard.test.tsx.
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

function makeMultiAltFinalEvent(alts: MockAlternative[]) {
  const result: Record<number, MockAlternative> & { isFinal: boolean; length: number } = {
    isFinal: true,
    length: alts.length,
  };
  alts.forEach((alt, i) => {
    result[i] = alt;
  });
  return { resultIndex: 0, results: { length: 1, 0: result } };
}

function sayFinal(transcript: string, confidence = 0.9) {
  MockSpeechRecognition.latest().onresult?.(makeResultEvent(transcript, true, confidence));
}

function sayFinalMultiAlt(alts: MockAlternative[]) {
  MockSpeechRecognition.latest().onresult?.(makeMultiAltFinalEvent(alts));
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

async function occupySeatWithBet(investigationId: string, seat: number): Promise<void> {
  await occupySeat(investigationId, seat);
  const inv = await getInvestigation(investigationId);
  await updateSeatBet(investigationId, inv!.rounds[0].id, seat, 25, { direction: "first", amount: 25, overridden: false });
}

/** Occupies, bets, and splits seat 3 via the repository directly (bypassing voice) — the shared setup for every split-seat continuation test below. */
async function occupyBetAndSplitSeat3(investigationId: string): Promise<void> {
  await occupySeatWithBet(investigationId, 3);
  const inv = await getInvestigation(investigationId);
  await splitSeat(investigationId, inv!.rounds[0].id, 3);
}

function SplitHandContinuationProbe() {
  const { activeTarget, investigation, redo, misdealAndAdvance, markSeatEmpty, refresh } = useInvestigationContext();
  const round = investigation.rounds[investigation.rounds.length - 1];
  const hand3Primary = round.seats[3];
  const hand3Split = round.splitHands[3];
  const seat5 = round.seats[5];
  return (
    <div>
      <div data-testid="active-target">{String(activeTarget)}</div>
      <div data-testid="round-count">{investigation.rounds.length}</div>
      <div data-testid="hand1-cards">{(hand3Primary?.playerCards ?? []).map((c) => c.rank).join(",")}</div>
      <div data-testid="hand2-cards">{(hand3Split?.playerCards ?? []).map((c) => c.rank).join(",")}</div>
      <div data-testid="hand1-doubled">{String(Boolean(hand3Primary?.doubled))}</div>
      <div data-testid="hand2-doubled">{String(Boolean(hand3Split?.doubled))}</div>
      <div data-testid="hand2-exists">{String(round.splitHands[3] != null)}</div>
      <div data-testid="seat5-cards">{(seat5?.playerCards ?? []).map((c) => c.rank).join(",")}</div>
      {/* Redo/round-advance/leave-seat have no voice command (or would need
          a full legitimate round-completion flow this file doesn't need to
          exercise) — these test-only triggers call the exact same
          production context functions the real UI/voice dispatch use. */}
      <button type="button" data-testid="trigger-redo" onClick={() => redo()}>
        redo
      </button>
      <button type="button" data-testid="trigger-next-round" onClick={() => misdealAndAdvance()}>
        next round
      </button>
      <button type="button" data-testid="trigger-leave-seat-3" onClick={() => markSeatEmpty(3)}>
        leave seat 3
      </button>
      {/* Test-only: mirrors the refresh() every real context mutation already
          calls on its own write — used only to make the context observe an
          out-of-band DB mutation performed directly by a test (see the
          stale-split-hand-target test below), never fired from application UI. */}
      <button type="button" data-testid="trigger-refresh" onClick={() => refresh()}>
        refresh
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
      <SplitHandContinuationProbe />
    </InvestigationProvider>
  );
}

describe("Phase 6 — explicit split-hand command locks the active target for continuation", () => {
  it("explicit Hand 1 → two bare continuation cards, both land on Hand 1, Hand 2 stays empty", async () => {
    const investigationId = await freshInvestigationId();
    await occupyBetAndSplitSeat3(investigationId);
    renderVoice(investigationId);
    await startListening();

    const before1 = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("spot 3 hand 1 has a five"));
    await waitFor(() => expect(screen.getByTestId("hand1-cards").textContent).toBe("5"));
    expect(screen.getByTestId("active-target").textContent).toBe("3");

    await awaitRestartFrom(before1);
    const before2 = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("king"));
    await waitFor(() => expect(screen.getByTestId("hand1-cards").textContent).toBe("5,10"));

    await awaitRestartFrom(before2);
    await act(async () => sayFinal("seven"));
    await waitFor(() => expect(screen.getByTestId("hand1-cards").textContent).toBe("5,10,7"));

    expect(screen.getByTestId("hand2-cards").textContent).toBe("");
    expect(screen.getByTestId("active-target").textContent).toBe("3");
  });

  it("explicit Hand 2 → two bare continuation cards, both land on Hand 2, Hand 1 stays empty", async () => {
    const investigationId = await freshInvestigationId();
    await occupyBetAndSplitSeat3(investigationId);
    renderVoice(investigationId);
    await startListening();

    const before1 = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("spot 3 hand 2 has a five"));
    await waitFor(() => expect(screen.getByTestId("hand2-cards").textContent).toBe("5"));
    expect(screen.getByTestId("active-target").textContent).toBe("-3");

    await awaitRestartFrom(before1);
    const before2 = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("king"));
    await waitFor(() => expect(screen.getByTestId("hand2-cards").textContent).toBe("5,10"));

    await awaitRestartFrom(before2);
    await act(async () => sayFinal("seven"));
    await waitFor(() => expect(screen.getByTestId("hand2-cards").textContent).toBe("5,10,7"));

    expect(screen.getByTestId("hand1-cards").textContent).toBe("");
    expect(screen.getByTestId("active-target").textContent).toBe("-3");
  });
});

describe("Phase 6 — target changes and hand switching", () => {
  it("split hand (Hand 2) → an ordinary different seat cleanly changes continuation, Hand 2 untouched", async () => {
    const investigationId = await freshInvestigationId();
    await occupyBetAndSplitSeat3(investigationId);
    await occupySeatWithBet(investigationId, 5);
    renderVoice(investigationId);
    await startListening();

    const before1 = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("spot 3 hand 2 has a five"));
    await waitFor(() => expect(screen.getByTestId("hand2-cards").textContent).toBe("5"));

    await awaitRestartFrom(before1);
    const before2 = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("player 5 has a seven"));
    await waitFor(() => expect(screen.getByTestId("seat5-cards").textContent).toBe("7"));
    expect(screen.getByTestId("active-target").textContent).toBe("5");

    await awaitRestartFrom(before2);
    await act(async () => sayFinal("ace"));
    await waitFor(() => expect(screen.getByTestId("seat5-cards").textContent).toBe("7,A"));

    expect(screen.getByTestId("hand2-cards").textContent).toBe("5");
  });

  it("an ordinary seat → an explicit split hand cleanly changes continuation, the ordinary seat untouched", async () => {
    const investigationId = await freshInvestigationId();
    await occupyBetAndSplitSeat3(investigationId);
    await occupySeatWithBet(investigationId, 5);
    renderVoice(investigationId);
    await startListening();

    const before1 = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("player 5 has a seven"));
    await waitFor(() => expect(screen.getByTestId("seat5-cards").textContent).toBe("7"));

    await awaitRestartFrom(before1);
    const before2 = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("spot 3 hand 1 has a five"));
    await waitFor(() => expect(screen.getByTestId("hand1-cards").textContent).toBe("5"));
    expect(screen.getByTestId("active-target").textContent).toBe("3");

    await awaitRestartFrom(before2);
    await act(async () => sayFinal("king"));
    await waitFor(() => expect(screen.getByTestId("hand1-cards").textContent).toBe("5,10"));

    expect(screen.getByTestId("seat5-cards").textContent).toBe("7");
  });

  it("explicit Hand 1 → explicit Hand 2 switches continuation cleanly, each hand keeps only its own cards", async () => {
    const investigationId = await freshInvestigationId();
    await occupyBetAndSplitSeat3(investigationId);
    renderVoice(investigationId);
    await startListening();

    const before1 = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("spot 3 hand 1 has a five"));
    await waitFor(() => expect(screen.getByTestId("hand1-cards").textContent).toBe("5"));

    await awaitRestartFrom(before1);
    const before2 = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("king"));
    await waitFor(() => expect(screen.getByTestId("hand1-cards").textContent).toBe("5,10"));

    await awaitRestartFrom(before2);
    const before3 = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("spot 3 hand 2 has a seven"));
    await waitFor(() => expect(screen.getByTestId("hand2-cards").textContent).toBe("7"));
    expect(screen.getByTestId("active-target").textContent).toBe("-3");

    await awaitRestartFrom(before3);
    await act(async () => sayFinal("ace"));
    await waitFor(() => expect(screen.getByTestId("hand2-cards").textContent).toBe("7,A"));

    expect(screen.getByTestId("hand1-cards").textContent).toBe("5,10");
  });
});

describe("Phase 6 — Split/Double/Undo/Redo interaction with active-target continuation", () => {
  it("Double on the active Hand 2 preserves Hand 2 targeting — never flips to Hand 1", async () => {
    const investigationId = await freshInvestigationId();
    await occupyBetAndSplitSeat3(investigationId);
    renderVoice(investigationId);
    await startListening();

    const before1 = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("spot 3 hand 2 has a five"));
    await waitFor(() => expect(screen.getByTestId("hand2-cards").textContent).toBe("5"));
    expect(screen.getByTestId("active-target").textContent).toBe("-3");

    await awaitRestartFrom(before1);
    const before2 = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("spot 3 hand 2 double"));
    await waitFor(() => expect(screen.getByTestId("hand2-doubled").textContent).toBe("true"));
    expect(screen.getByTestId("active-target").textContent).toBe("-3");
    expect(screen.getByTestId("hand1-doubled").textContent).toBe("false");

    // One card is still allowed post-double (doubledAtCardCount === current
    // length at the moment of doubling) — confirms continuation still
    // targets Hand 2, not silently reset by Double.
    await awaitRestartFrom(before2);
    await act(async () => sayFinal("king"));
    await waitFor(() => expect(screen.getByTestId("hand2-cards").textContent).toBe("5,10"));
    expect(screen.getByTestId("hand1-cards").textContent).toBe("");
  });

  it("Undo then Redo of a continuation card preserves Hand 2 targeting throughout, count reverses/restores exactly once", async () => {
    const investigationId = await freshInvestigationId();
    await occupyBetAndSplitSeat3(investigationId);
    renderVoice(investigationId);
    await startListening();

    const before1 = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("spot 3 hand 2 has a five")); // +1
    await waitFor(() => expect(screen.getByTestId("hand2-cards").textContent).toBe("5"));

    await awaitRestartFrom(before1);
    const before2 = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("king")); // -1, net 0
    await waitFor(() => expect(screen.getByTestId("hand2-cards").textContent).toBe("5,10"));
    await waitFor(() => expect(screen.getByLabelText("HI-LO running count").textContent).toBe("0"));

    await awaitRestartFrom(before2);
    await act(async () => sayFinal("undo"));
    await waitFor(() => expect(screen.getByTestId("hand2-cards").textContent).toBe("5"));
    expect(screen.getByLabelText("HI-LO running count").textContent).toBe("+1");
    expect(screen.getByTestId("active-target").textContent).toBe("-3"); // untouched by an ordinary card undo

    await act(async () => {
      screen.getByTestId("trigger-redo").click();
    });
    await waitFor(() => expect(screen.getByTestId("hand2-cards").textContent).toBe("5,10"));
    expect(screen.getByLabelText("HI-LO running count").textContent).toBe("0");
    expect(screen.getByTestId("active-target").textContent).toBe("-3");

    const events = await getCardEventsForInvestigation(investigationId);
    expect(events.filter((e) => e.status === "active")).toHaveLength(2);
  });

  it("undoing a bare Split (before any card on Hand 2) self-heals the stale target back to Hand 1, which then works normally", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeatWithBet(investigationId, 3);
    renderVoice(investigationId);
    await startListening();

    const before1 = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("spot 3 split"));
    await waitFor(() => expect(screen.getByTestId("hand2-exists").textContent).toBe("true"));
    expect(screen.getByTestId("active-target").textContent).toBe("-3");

    await awaitRestartFrom(before1);
    const before2 = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("undo"));
    await waitFor(() => expect(screen.getByTestId("hand2-exists").textContent).toBe("false"));
    // EyeOnPit 1.10 Phase 6 fix: undo() now redirects a stale negative
    // active target back to the primary hand when the round snapshot it
    // just restored no longer has that split hand.
    expect(screen.getByTestId("active-target").textContent).toBe("3");

    await awaitRestartFrom(before2);
    await act(async () => sayFinal("king"));
    await waitFor(() => expect(screen.getByTestId("hand1-cards").textContent).toBe("10"));
  });
});

describe("Phase 6 — round/session boundaries clear split-hand targeting", () => {
  it("advancing to a new round never leaves a stale split-hand target — activeTarget becomes a valid, non-split target", async () => {
    const investigationId = await freshInvestigationId();
    await occupyBetAndSplitSeat3(investigationId);
    renderVoice(investigationId);
    await startListening();

    await act(async () => sayFinal("spot 3 hand 2 has a five"));
    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("-3"));

    await act(async () => {
      screen.getByTestId("trigger-next-round").click();
    });

    await waitFor(() => expect(screen.getByTestId("round-count").textContent).toBe("2"));
    const target = screen.getByTestId("active-target").textContent!;
    expect(target).not.toBe("-3");
    expect(Number(target) >= 0 || target === "dealer").toBe(true);
    // The new round's own splitHands must start empty — no split survives a round boundary.
    expect(screen.getByTestId("hand2-exists").textContent).toBe("false");
  });

  it("a seat leaving the table redirects a stale split-hand active target instead of leaving it dangling", async () => {
    const investigationId = await freshInvestigationId();
    await occupyBetAndSplitSeat3(investigationId);
    renderVoice(investigationId);
    await startListening();

    await act(async () => sayFinal("spot 3 hand 2 has a five"));
    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("-3"));

    await act(async () => {
      screen.getByTestId("trigger-leave-seat-3").click();
    });

    // EyeOnPit 1.10 Phase 6 fix: markSeatEmpty now also matches the
    // negative (split-hand) form of the seat being emptied.
    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("dealer"));
  });
});

describe("Phase 6 — fail-closed cases produce zero CardEvents", () => {
  it("a bare split-seat target stays ambiguous even while a DIFFERENT hand is the live active target", async () => {
    const investigationId = await freshInvestigationId();
    await occupyBetAndSplitSeat3(investigationId);
    renderVoice(investigationId);
    await startListening();

    const before1 = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("spot 3 hand 1 has a five"));
    await waitFor(() => expect(screen.getByTestId("hand1-cards").textContent).toBe("5"));

    await awaitRestartFrom(before1);
    await act(async () => sayFinal("spot 3 has a king"));

    await waitFor(() => screen.getByText(/hand 1.*hand 2|hand 2.*hand 1/i));
    expect(screen.getByTestId("hand1-cards").textContent).toBe("5"); // unchanged
    expect(screen.getByTestId("hand2-cards").textContent).toBe("");
    const events = await getCardEventsForInvestigation(investigationId);
    expect(events.filter((e) => e.status === "active")).toHaveLength(1);
  });

  it("malformed Hand 3 is rejected even mid-continuation, never falls through to an ordinary card", async () => {
    const investigationId = await freshInvestigationId();
    await occupyBetAndSplitSeat3(investigationId);
    renderVoice(investigationId);
    await startListening();

    const before1 = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("spot 3 hand 1 has a five"));
    await waitFor(() => expect(screen.getByTestId("hand1-cards").textContent).toBe("5"));

    await awaitRestartFrom(before1);
    await act(async () => sayFinal("spot 3 hand 3 has a king"));

    await waitFor(() => screen.getByText(/not recognized/i));
    expect(screen.getByTestId("hand1-cards").textContent).toBe("5");
    expect(screen.getByTestId("hand2-cards").textContent).toBe("");
  });

  it("Hand 2 on an unsplit seat is rejected, never silently reinterpreted as Hand 1 or the active target", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeatWithBet(investigationId, 5);
    renderVoice(investigationId);
    await startListening();

    const before1 = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("player 5 has a seven"));
    await waitFor(() => expect(screen.getByTestId("seat5-cards").textContent).toBe("7"));

    await awaitRestartFrom(before1);
    await act(async () => sayFinal("player 5 hand 2 has an ace"));

    await waitFor(() => screen.getByText(/doesn't exist yet/i));
    expect(screen.getByTestId("seat5-cards").textContent).toBe("7");
  });

  it("a stale split-hand target left after the hand ceases to exist rejects a bare continuation card rather than misapplying it", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeatWithBet(investigationId, 3);
    renderVoice(investigationId);
    await startListening();

    const before1 = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("spot 3 split"));
    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("-3"));

    // Manually force the stale-target condition WITHOUT going through the
    // now-fixed markSeatEmpty path, to prove resolveCardEntryTarget's own
    // safety net (not just this round's markSeatEmpty fix) independently
    // rejects a card for a target whose record no longer exists.
    const { mutateRound } = await import("@/lib/db/repositories/investigations");
    const inv = await getInvestigation(investigationId);
    await mutateRound(
      investigationId,
      inv!.rounds[0].id,
      (round) => {
        const splitHands = { ...round.splitHands };
        delete splitHands[3];
        return { ...round, splitHands };
      },
      { type: "correction", message: "test: force-remove Hand 2" }
    );
    // InvestigationContext has no live-query — its state only advances when
    // one of its own methods calls refresh() after a write. This mutateRound
    // call went around the context entirely, so the context must be told to
    // observe it before "king" is spoken, or resolveCardEntryTarget would
    // validate against a stale in-memory round that still has Hand 2.
    await act(async () => {
      screen.getByTestId("trigger-refresh").click();
    });
    await waitFor(() => expect(screen.getByTestId("hand2-exists").textContent).toBe("false"));

    await awaitRestartFrom(before1);
    await act(async () => sayFinal("king"));

    await waitFor(() => screen.getByText(/not enabled/i));
    const events = await getCardEventsForInvestigation(investigationId);
    expect(events.filter((e) => e.status === "active")).toHaveLength(0);
  });

  it("unrelated speech is rejected, zero CardEvents, even with an active split-hand target", async () => {
    const investigationId = await freshInvestigationId();
    await occupyBetAndSplitSeat3(investigationId);
    renderVoice(investigationId);
    await startListening();

    const before1 = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("spot 3 hand 2 has a five"));
    await waitFor(() => expect(screen.getByTestId("hand2-cards").textContent).toBe("5"));

    await awaitRestartFrom(before1);
    await act(async () => sayFinal("what time does the buffet close"));

    await waitFor(() => screen.getByText(/not recognized/i));
    expect(screen.getByTestId("hand2-cards").textContent).toBe("5");
  });

  it("conflicting N-best alternatives naming different hands refuse to guess — rejected, zero CardEvents", async () => {
    const investigationId = await freshInvestigationId();
    await occupyBetAndSplitSeat3(investigationId);
    renderVoice(investigationId);
    await startListening();

    await act(async () =>
      sayFinalMultiAlt([
        { transcript: "spot 3 hand 1 has a five", confidence: 0.85 },
        { transcript: "spot 3 hand 2 has a five", confidence: 0.85 },
      ])
    );

    await waitFor(() => expect(screen.getByTestId("hand1-cards").textContent).toBe(""));
    expect(screen.getByTestId("hand2-cards").textContent).toBe("");
    const events = await getCardEventsForInvestigation(investigationId);
    expect(events.filter((e) => e.status === "active")).toHaveLength(0);
  });
});

describe("Phase 6 — count integrity across a full continuation sequence", () => {
  it("four continuation cards across both hands: exactly 4 CardEvents, count reflects exactly those 4, no card migrates between hands", async () => {
    const investigationId = await freshInvestigationId();
    await occupyBetAndSplitSeat3(investigationId);
    renderVoice(investigationId);
    await startListening();

    const before1 = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("spot 3 hand 1 has a five")); // +1
    await waitFor(() => expect(screen.getByTestId("hand1-cards").textContent).toBe("5"));

    await awaitRestartFrom(before1);
    const before2 = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("king")); // -1, net 0
    await waitFor(() => expect(screen.getByTestId("hand1-cards").textContent).toBe("5,10"));

    await awaitRestartFrom(before2);
    const before3 = MockSpeechRecognition.instances.length;
    await act(async () => sayFinal("spot 3 hand 2 has a seven")); // neutral (7-9 = 0), net 0
    await waitFor(() => expect(screen.getByTestId("hand2-cards").textContent).toBe("7"));

    await awaitRestartFrom(before3);
    await act(async () => sayFinal("two")); // +1, net +1
    await waitFor(() => expect(screen.getByTestId("hand2-cards").textContent).toBe("7,2"));

    expect(screen.getByTestId("hand1-cards").textContent).toBe("5,10");
    expect(screen.getByTestId("hand2-cards").textContent).toBe("7,2");
    await waitFor(() => expect(screen.getByLabelText("HI-LO running count").textContent).toBe("+1"));

    const events = await getCardEventsForInvestigation(investigationId);
    const active = events.filter((e) => e.status === "active");
    expect(active).toHaveLength(4);
    expect(active.filter((e) => e.targetType === "seat")).toHaveLength(2);
    expect(active.filter((e) => e.targetType === "split")).toHaveLength(2);
  });
});

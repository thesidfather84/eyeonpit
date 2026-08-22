// @vitest-environment jsdom
//
// Floor Mode reuses InvestigationContext, the CardEvent ledger, the count
// engine, and the existing card/round mutations wholesale (CardEntryPad,
// RoundControlsRow, CountSummaryPanel, VoiceControl are the exact same
// components LiveScreen renders) — these tests exist to prove that reuse
// actually works end to end through FloorScreen's own arrangement, not to
// re-test those components' own internals (already covered by their own
// test files).
import { useEffect } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InvestigationProvider, useInvestigationContext } from "@/contexts/InvestigationContext";
import { LockProvider } from "@/contexts/LockContext";
import { EntryLockProvider } from "@/contexts/EntryLockContext";
import { createInvestigation } from "@/lib/db/repositories/investigations";
import { FloorScreen } from "./FloorScreen";
import { LiveScreen } from "./LiveScreen";

class MockSpeechRecognition {
  static current: MockSpeechRecognition | null = null;
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
    MockSpeechRecognition.current = this;
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
}

/** Mirrors VoiceControl.test.tsx's own makeResultEvent — kept local/self-contained rather than shared, matching this file's existing convention of duplicating its own minimal MockSpeechRecognition instead of importing one. */
function makeFinalResultEvent(transcript: string) {
  const alt = { transcript, confidence: 0.9 };
  const result = { isFinal: true, length: 1, 0: alt };
  const results = { length: 1, 0: result };
  return { results, resultIndex: 0 };
}

beforeEach(() => {
  (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = MockSpeechRecognition;
});

afterEach(() => {
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
});

async function freshInvestigationId(): Promise<string> {
  const inv = await createInvestigation({
    casino: "",
    tableNumber: "",
    dealerName: "",
    investigationDate: "2026-08-09",
    operatorName: "",
    countingSystem: "Hi-Lo",
    shoeTotalDecks: 6,
    status: "active",
  });
  return inv.localId;
}

function RoundProbe() {
  const { investigation } = useInvestigationContext();
  const round = investigation.rounds[investigation.rounds.length - 1];
  return (
    <div>
      <div data-testid="dealer-card-count">{round.dealerHand.cards.length}</div>
      <div data-testid="round-completed">{String(round.completed)}</div>
      <div data-testid="round-count">{investigation.rounds.length}</div>
    </div>
  );
}

describe("FloorScreen — minimal Floor Mode shell", () => {
  it("shows compact identity/status, reuses the same count engine output as Surveillance, and links back to Surveillance", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <FloorScreen />
      </InvestigationProvider>
    );

    await screen.findByText("FLOOR");
    await waitFor(() => expect(screen.getByLabelText("HI-LO running count").textContent).toBe("0"));

    const surveillanceLink = screen.getByRole("link", { name: /Surveillance/ });
    expect(surveillanceLink.getAttribute("href")).toBe(`/investigations/${investigationId}/live`);
  });

  it("manual card entry works through the exact same CardEntryPad/ledger LiveScreen uses", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <FloorScreen />
        <RoundProbe />
      </InvestigationProvider>
    );

    const aceButton = await screen.findByRole("button", { name: "A" });
    await act(async () => {
      aceButton.click();
    });

    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));
    await waitFor(() => expect(screen.getByLabelText("HI-LO running count").textContent).toBe("-1"));
  });

  it("Done/Next/Undo reuse the exact same round-control handlers RoundControlsRow already exposes on Surveillance", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <FloorScreen />
        <RoundProbe />
      </InvestigationProvider>
    );

    const aceButton = await screen.findByRole("button", { name: "A" });
    await act(async () => {
      aceButton.click();
    });
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));

    const undoButton = screen.getByRole("button", { name: "Undo Dealer" });
    await act(async () => {
      undoButton.click();
    });
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("0"));
  });

  it("operator-loop correction: tapping Done once in Floor completes the round AND starts exactly one next round — no second Next required, no duplicate round created", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <FloorScreen />
        <RoundProbe />
      </InvestigationProvider>
    );

    const kingButton = await screen.findByRole("button", { name: "10" });
    await act(async () => {
      kingButton.click(); // Hi-Lo -1 — one dealer card is enough for canCompleteRound
    });
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));

    const roundsBefore = Number(screen.getByTestId("round-count").textContent);
    const doneButton = screen.getByRole("button", { name: "Done — complete this round" });
    await act(async () => {
      doneButton.click();
    });

    // Exactly one round completed, exactly one next round created — proven
    // as a single settled state (completeRoundAndAdvance is one atomic
    // operation), not two separate taps landing on two separate states.
    await waitFor(() => expect(Number(screen.getByTestId("round-count").textContent)).toBe(roundsBefore + 1));
    expect(screen.getByTestId("round-completed").textContent).toBe("false");
    expect(screen.getByTestId("dealer-card-count").textContent).toBe("0"); // the NEW round, genuinely empty
    await waitFor(() => expect(screen.getByLabelText("HI-LO running count").textContent).toBe("-1")); // the completed hand's own count, unaffected by advancing

    // Ready for entry immediately — no "Round complete, say or tap Next"
    // block, no disabled keypad.
    expect(screen.queryByText(/Round complete/)).toBeNull();
    const aceButton = screen.getByRole("button", { name: "A" }) as HTMLButtonElement;
    expect(aceButton.disabled).toBe(false);

    // A stray extra Next, if somehow tapped right after, must not create a
    // SECOND round on top of the one Done already started — nextRound()'s
    // own `!currentRound.completed` guard makes this structurally
    // impossible (see useRoundControls.ts), verified here end to end.
    const roundsAfterDone = Number(screen.getByTestId("round-count").textContent);
    const nextButton = screen.getByRole("button", { name: "Next" });
    await act(async () => {
      nextButton.click();
    });
    expect(Number(screen.getByTestId("round-count").textContent)).toBe(roundsAfterDone); // unchanged — no duplicate advance
  });

  it("operator-loop correction: Surveillance keeps the deliberate two-step Done then Next — unaffected by Floor's auto-advance", async () => {
    const investigationId = await freshInvestigationId();
    const { LiveScreen } = await import("./LiveScreen");
    const { LockProvider } = await import("@/contexts/LockContext");
    const { EntryLockProvider } = await import("@/contexts/EntryLockContext");
    render(
      <LockProvider>
        <EntryLockProvider>
          <InvestigationProvider investigationId={investigationId}>
            <LiveScreen />
            <RoundProbe />
          </InvestigationProvider>
        </EntryLockProvider>
      </LockProvider>
    );

    const kingButton = await screen.findByRole("button", { name: "10" });
    await act(async () => {
      kingButton.click();
    });
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));

    const roundsBefore = Number(screen.getByTestId("round-count").textContent);
    const doneButton = screen.getByRole("button", { name: "Done — complete this round" });
    await act(async () => {
      doneButton.click();
    });

    // Unchanged Surveillance behavior: Done alone locks the round, but does
    // NOT start the next one — Next is still a required, deliberate step.
    await waitFor(() => expect(screen.getByTestId("round-completed").textContent).toBe("true"));
    expect(Number(screen.getByTestId("round-count").textContent)).toBe(roundsBefore);

    const nextButton = screen.getByRole("button", { name: "Next" });
    await act(async () => {
      nextButton.click();
    });
    await waitFor(() => expect(Number(screen.getByTestId("round-count").textContent)).toBe(roundsBefore + 1));
  });

  it("shows the active seat's identity, exactly like ActiveSeatHeader does on Surveillance, once a seat is selected", async () => {
    function SelectSeatOnMount() {
      const { selectSeat } = useInvestigationContext();
      // selectSeat only ever selects (never occupies) — FloorScreen has no
      // seat map of its own, so this harness drives the identical context
      // action directly, exactly as voice's "seat three" command does.
      useEffect(() => {
        selectSeat(3);
      }, [selectSeat]);
      return null;
    }

    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <FloorScreen />
        <SelectSeatOnMount />
      </InvestigationProvider>
    );

    // ActiveSeatHeader is the ONE place that states the active target now —
    // "SPOT 3" / "ENTER CARDS" in Floor Mode. PRIORITY 1.9-10: Surveillance's
    // own instance of this same component says "SPOT 3" too now (the new
    // global default) — see ActiveSeatHeader's own doc comment on the
    // `terminology` prop.
    await waitFor(() => screen.getByText("SPOT 3"));
    screen.getByText("ENTER CARDS");
  });

  it("the large mic control (VoiceControl) is present, same as Surveillance", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <FloorScreen />
      </InvestigationProvider>
    );

    await screen.findByRole("button", { name: "Start voice command" });
  });
});

describe("FloorScreen — compact play-field summary (FloorPlayField)", () => {
  it("shows the dealer and all seven seats at a glance, empty seats reading as a dash", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <FloorScreen />
      </InvestigationProvider>
    );

    const field = await screen.findByTestId("floor-play-field");
    // A fresh investigation starts with the dealer as the active target.
    await within(field).findByRole("button", { name: "Dealer, active" });
    for (let seat = 1; seat <= 7; seat++) {
      const seatButton = within(field).getByTestId(`floor-seat-${seat}`);
      expect(seatButton.getAttribute("aria-label")).toBe(`Spot ${seat}, empty`);
      expect(within(seatButton).getByText("—")).toBeTruthy();
      // Floor Mode operator usability cleanup — visible label reads "SPOT n",
      // never the bare internal identifier "Sn" (see FloorPlayField's own
      // doc comment on `terminology`).
      expect(within(seatButton).getByText(`SPOT ${seat}`)).toBeTruthy();
      expect(within(seatButton).queryByText(`S${seat}`)).toBeNull();
    }
  });

  it("tapping an empty seat in the play field occupies AND selects it — same production path as the seat map's own tap handler", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <FloorScreen />
      </InvestigationProvider>
    );

    const field = await screen.findByTestId("floor-play-field");
    const seat2 = within(field).getByTestId("floor-seat-2");
    await act(async () => {
      seat2.click();
    });

    await waitFor(() => expect(seat2.getAttribute("aria-label")).toBe("Spot 2, active"));
    expect(within(seat2).getByText("ACTIVE · SPOT 2")).toBeTruthy();
    // ActiveSeatHeader (an existing, separately-tested component) renders
    // once a seat becomes the active target — its appearance here confirms
    // the play field drove the SAME context state, not a parallel one.
    // occupySeat auto-creates a player group ("SPOT 2 · P1" in Floor Mode),
    // so this matches on the seat identity via regex rather than an exact
    // string. Scoped to the header itself since FloorPlayField's own "ACTIVE
    // · SPOT 2" label (just asserted above) would otherwise also match a
    // document-wide search for the same text.
    const header = await screen.findByTestId("active-seat-header");
    await waitFor(() => within(header).getByText(/SPOT 2/));
  });

  it("tapping an already-occupied seat just selects it (no re-occupy, no duplicate player group)", async () => {
    const investigationId = await freshInvestigationId();
    const { occupySeat } = await import("@/lib/db/repositories/investigations");
    await occupySeat(investigationId, 4);
    render(
      <InvestigationProvider investigationId={investigationId}>
        <FloorScreen />
      </InvestigationProvider>
    );

    const field = await screen.findByTestId("floor-play-field");
    const seat4 = within(field).getByTestId("floor-seat-4");
    await waitFor(() => expect(seat4.getAttribute("aria-label")).toBe("Spot 4, occupied"));

    await act(async () => {
      seat4.click();
    });
    await waitFor(() => expect(seat4.getAttribute("aria-label")).toBe("Spot 4, active"));
  });

  it("cards entered through the manual keypad for the dealer and a seat show up in the play field immediately — same round/display state, no separate data model", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <FloorScreen />
      </InvestigationProvider>
    );

    const field = await screen.findByTestId("floor-play-field");
    const aceButton = await screen.findByRole("button", { name: "A" });
    await act(async () => {
      aceButton.click();
    });

    await waitFor(() => {
      const dealerRow = within(field).getByTestId("floor-dealer");
      expect(within(dealerRow).getByText("A")).toBeTruthy();
    });
  });

  it('a natural narration ("seat two five") is immediately visible in the play field — one glance confirms what EyeOnPit heard', async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <FloorScreen />
      </InvestigationProvider>
    );

    const field = await screen.findByTestId("floor-play-field");
    const micButton = await screen.findByRole("button", { name: "Start voice command" });
    await act(async () => {
      micButton.click();
    });
    await act(async () => {
      MockSpeechRecognition.current?.onresult?.(makeFinalResultEvent("seat two five"));
    });

    await waitFor(() => {
      const seat2 = within(field).getByTestId("floor-seat-2");
      expect(seat2.getAttribute("aria-label")).toBe("Spot 2, active");
      expect(within(seat2).getByText("5")).toBeTruthy();
    });
  });
});

describe("FloorScreen and LiveScreen share the same underlying investigation/ledger", () => {
  it("a card entered through Floor's keypad is immediately reflected in Surveillance's count — one investigation, one CardEvent ledger, not two", async () => {
    const investigationId = await freshInvestigationId();

    render(
      <LockProvider>
        <EntryLockProvider>
          <InvestigationProvider investigationId={investigationId}>
            <div data-testid="surveillance-pane">
              <LiveScreen />
            </div>
            <div data-testid="floor-pane">
              <FloorScreen />
            </div>
          </InvestigationProvider>
        </EntryLockProvider>
      </LockProvider>
    );

    // Both screens embed the exact same CountSummaryPanel component — two
    // mounted instances of it, both reading the same InvestigationContext.
    await waitFor(() => {
      const counts = screen.getAllByLabelText("HI-LO running count");
      expect(counts).toHaveLength(2);
      expect(counts[0].textContent).toBe("0");
      expect(counts[1].textContent).toBe("0");
    });

    // Enter a card through Floor's own keypad, not Surveillance's.
    const floorPane = screen.getByTestId("floor-pane");
    const floorAceButton = within(floorPane).getByRole("button", { name: "A" });
    await act(async () => {
      floorAceButton.click();
    });

    // Surveillance's own header count updates too — same ledger, same
    // investigation, no separate Floor counting architecture.
    await waitFor(() => {
      const counts = screen.getAllByLabelText("HI-LO running count");
      expect(counts[0].textContent).toBe("-1");
      expect(counts[1].textContent).toBe("-1");
    });
  });

  it("a card entered through Surveillance's keypad is immediately reflected in Floor's count and compact play field — the reverse direction", async () => {
    const investigationId = await freshInvestigationId();

    render(
      <LockProvider>
        <EntryLockProvider>
          <InvestigationProvider investigationId={investigationId}>
            <div data-testid="surveillance-pane">
              <LiveScreen />
            </div>
            <div data-testid="floor-pane">
              <FloorScreen />
            </div>
          </InvestigationProvider>
        </EntryLockProvider>
      </LockProvider>
    );

    await waitFor(() => {
      const counts = screen.getAllByLabelText("HI-LO running count");
      expect(counts[0].textContent).toBe("0");
      expect(counts[1].textContent).toBe("0");
    });

    // Enter a card through Surveillance's own keypad, not Floor's.
    const surveillancePane = screen.getByTestId("surveillance-pane");
    const aceButton = within(surveillancePane).getByRole("button", { name: "A" });
    await act(async () => {
      aceButton.click();
    });

    await waitFor(() => {
      const counts = screen.getAllByLabelText("HI-LO running count");
      expect(counts[0].textContent).toBe("-1");
      expect(counts[1].textContent).toBe("-1");
    });

    // Floor's compact play field reflects the same dealer card too — not
    // just the header count, the actual round/display state.
    const floorPane = screen.getByTestId("floor-pane");
    const floorPlayField = within(floorPane).getByTestId("floor-play-field");
    const floorDealer = within(floorPlayField).getByTestId("floor-dealer");
    within(floorDealer).getByText("A");
  });

  it("occupying a seat through Surveillance's table map is immediately visible in Floor's compact play field — one investigation, one set of seats, no separate copies", async () => {
    const investigationId = await freshInvestigationId();

    render(
      <LockProvider>
        <EntryLockProvider>
          <InvestigationProvider investigationId={investigationId}>
            <div data-testid="surveillance-pane">
              <LiveScreen />
            </div>
            <div data-testid="floor-pane">
              <FloorScreen />
            </div>
          </InvestigationProvider>
        </EntryLockProvider>
      </LockProvider>
    );

    const surveillancePane = await screen.findByTestId("surveillance-pane");
    const seatTile = within(surveillancePane).getByRole("button", { name: "Spot 3" });
    await act(async () => {
      seatTile.click();
    });

    // PRIORITY 1.9-10: both shells now say "Spot" by default (the new
    // global operator terminology rule, superseding the earlier
    // Floor-only "Spot"/Surveillance-only "Seat" split) — the underlying
    // identifier (seat 3) and investigation state are the same either
    // way, proven by both panes reacting to the identical tap.
    const floorPane = screen.getByTestId("floor-pane");
    await waitFor(() => {
      const floorSeat3 = within(floorPane).getByTestId("floor-seat-3");
      expect(floorSeat3.getAttribute("aria-label")).toBe("Spot 3, active");
    });
  });
});

describe("FloorScreen — operator usability cleanup: no bare internal seat identifiers (S1-S7) in user-facing Floor Mode text", () => {
  it('never renders the bare "S<n>" abbreviation for any occupied/active/empty seat, and always renders "SPOT <n>" instead', async () => {
    const investigationId = await freshInvestigationId();
    const { occupySeat, updateInvestigation } = await import("@/lib/db/repositories/investigations");
    // A mix of empty, occupied, and active seats — every visible state this
    // component can render for a seat row.
    await occupySeat(investigationId, 2);
    await occupySeat(investigationId, 5);
    await updateInvestigation(investigationId, { activeTarget: 5 });

    render(
      <InvestigationProvider investigationId={investigationId}>
        <FloorScreen />
      </InvestigationProvider>
    );

    const field = await screen.findByTestId("floor-play-field");
    for (let seat = 1; seat <= 7; seat++) {
      const seatButton = within(field).getByTestId(`floor-seat-${seat}`);
      expect(within(seatButton).queryByText(`S${seat}`)).toBeNull();
      expect(within(seatButton).queryByText(`ACTIVE · S${seat}`)).toBeNull();
      expect(seatButton.getAttribute("aria-label")).not.toMatch(/^Seat /);
      expect(seatButton.getAttribute("aria-label")).toMatch(/^Spot \d, /);
    }
    // The active-target header (a completely separate component) must be
    // equally clean — this is the banner an operator is most likely to
    // glance at for "where does the next card go."
    const header = screen.getByTestId("active-seat-header");
    expect(within(header).queryByText(/^S5\b/)).toBeNull();
    within(header).getByText(/^SPOT 5\b/);
  });

  it('the card-entry "not enabled" message uses "spot" in Floor Mode, not "seat"', async () => {
    const investigationId = await freshInvestigationId();
    // Set BEFORE mount (mirrors CardEntryPad.test.tsx's own equivalent
    // test) — seat 6, never occupied, is what produces the "not enabled"
    // state; the active target is loaded once from the investigation
    // record at mount, not re-derived from a later write.
    const { updateInvestigation } = await import("@/lib/db/repositories/investigations");
    await updateInvestigation(investigationId, { activeTarget: 6 });

    render(
      <InvestigationProvider investigationId={investigationId}>
        <FloorScreen />
      </InvestigationProvider>
    );

    await screen.findByText("SPOT 6");
    await waitFor(() => screen.getByText("Spot not enabled — tap the spot, or say its name, to enable it"));
    expect(screen.queryByText(/^Seat not enabled/)).toBeNull();
  });

  it("PRIORITY 1.9-10: Surveillance's own ActiveSeatHeader/seat tiles now say SPOT too — the global default, no longer a Floor-only word", async () => {
    const investigationId = await freshInvestigationId();
    const { LiveScreen } = await import("./LiveScreen");
    render(
      <LockProvider>
        <EntryLockProvider>
          <InvestigationProvider investigationId={investigationId}>
            <LiveScreen />
          </InvestigationProvider>
        </EntryLockProvider>
      </LockProvider>
    );

    const seatTile = await screen.findByRole("button", { name: "Spot 3" });
    await act(async () => {
      seatTile.click();
    });

    await screen.findByText("SPOT 3");
    expect(screen.queryByText("SEAT 3")).toBeNull();
  });
});

describe("FloorScreen — wager/player-action controls (AGENTS.md 1.14b) stay collapsed by default, same progressive disclosure as Surveillance", () => {
  it("the collapsed PlayerDetailBar trigger is present for an active occupied seat, but its wager chips/player-action buttons stay hidden until opened", async () => {
    const investigationId = await freshInvestigationId();
    const { occupySeat, updateInvestigation } = await import("@/lib/db/repositories/investigations");
    await occupySeat(investigationId, 1);
    await updateInvestigation(investigationId, { activeTarget: 1 });

    render(
      <InvestigationProvider investigationId={investigationId}>
        <FloorScreen />
      </InvestigationProvider>
    );

    await screen.findByTestId("active-seat-header");
    // 1.14b: Floor Mode gained the exact same PlayerDetailBar/Sheet
    // LiveScreen uses — real wager entry and Double/Split/Insurance are now
    // reachable, but collapsed behind one compact row by default, so the
    // primary card-entry surface stays uncluttered.
    await screen.findByTestId("player-detail-bar");
    expect(screen.queryByRole("button", { name: "$25" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Double" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Split" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Insurance" })).toBeNull();
    expect(screen.queryByText("Decks")).toBeNull();
  });

  it("tapping the collapsed bar reveals the exact same QuickBetPanel/PlayerActionsRow controls LiveScreen uses", async () => {
    const investigationId = await freshInvestigationId();
    const { occupySeat, updateInvestigation } = await import("@/lib/db/repositories/investigations");
    await occupySeat(investigationId, 1);
    await updateInvestigation(investigationId, { activeTarget: 1 });

    render(
      <InvestigationProvider investigationId={investigationId}>
        <FloorScreen />
      </InvestigationProvider>
    );

    const bar = await screen.findByTestId("player-detail-bar");
    await act(async () => {
      bar.click();
    });

    await screen.findByRole("button", { name: "$25" });
    screen.getByRole("button", { name: "Double" });
    screen.getByRole("button", { name: "Split" });
    screen.getByRole("button", { name: "Insurance" });
  });

  it("a wager change made through Floor's QuickBetPanel is reachable by the SAME global Undo RoundControlsRow already exposes for card entry", async () => {
    const investigationId = await freshInvestigationId();
    const { occupySeat, updateInvestigation, getInvestigation } = await import(
      "@/lib/db/repositories/investigations"
    );
    await occupySeat(investigationId, 1);
    await updateInvestigation(investigationId, { activeTarget: 1 });

    render(
      <InvestigationProvider investigationId={investigationId}>
        <FloorScreen />
      </InvestigationProvider>
    );

    const bar = await screen.findByTestId("player-detail-bar");
    await act(async () => {
      bar.click();
    });
    const chip25 = await screen.findByRole("button", { name: "$25" });
    await act(async () => {
      chip25.click();
    });

    await waitFor(async () => {
      const updated = await getInvestigation(investigationId);
      expect(updated!.rounds[0].seats[1]?.betAmount).toBe(25);
    });

    // A Floor-originated wager change is real history, reachable by the
    // SAME global Undo card entry already uses (RoundControlsRow's own
    // undo()/canUndo — see InvestigationContext.integration.test.tsx for
    // that mechanism's own thorough, independent coverage; this only
    // proves Floor's new wager wiring feeds it, not that Undo itself is
    // correct). Polled — the DB write lands before React's own history
    // state/re-render necessarily has, so a synchronous check right after
    // the DB-level waitFor above can race under heavier parallel test load.
    await waitFor(() => {
      const undoButton = screen.getByTitle(/undo/i) as HTMLButtonElement;
      expect(undoButton.disabled).toBe(false);
    });
  });
});

describe("FloorScreen — the operator-loop menu (Pause/Resume, New Shoe, End Investigation, Help — previously Surveillance-only)", () => {
  it("Floor's own Menu button opens the SAME LiveMenu Surveillance uses, with Pause and New Shoe reachable — not a stripped-down or missing menu", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <FloorScreen />
      </InvestigationProvider>
    );

    const menuButton = await screen.findByRole("button", { name: "Menu" });
    await act(async () => {
      menuButton.click();
    });

    const dialog = await screen.findByRole("dialog", { name: "Menu" });
    within(dialog).getByRole("button", { name: /Pause Investigation/ });
    within(dialog).getByRole("button", { name: /New Shoe|New Deck/ });
    within(dialog).getByRole("button", { name: /End & Review/ });
    within(dialog).getByRole("link", { name: /Surveillance/ });
  });

  it("Pause Investigation from Floor's menu actually pauses the real investigation — same context action Surveillance's header icon uses", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <FloorScreen />
      </InvestigationProvider>
    );

    const menuButton = await screen.findByRole("button", { name: "Menu" });
    await act(async () => {
      menuButton.click();
    });
    const dialog = await screen.findByRole("dialog", { name: "Menu" });
    const pauseButton = within(dialog).getByRole("button", { name: /Pause Investigation/ });
    await act(async () => {
      pauseButton.click();
    });

    const { getInvestigation } = await import("@/lib/db/repositories/investigations");
    await waitFor(async () => {
      const inv = await getInvestigation(investigationId);
      expect(inv!.status).toBe("paused");
    });
  });

  it("a closed investigation replaces the Surveillance link/menu with a '+ New' affordance", async () => {
    const investigationId = await freshInvestigationId();
    const { completeInvestigation } = await import("@/lib/db/repositories/investigations");
    await completeInvestigation(investigationId);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <FloorScreen />
      </InvestigationProvider>
    );

    await screen.findByRole("button", { name: "+ New" });
    expect(screen.queryByRole("button", { name: "Menu" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Surveillance/ })).toBeNull();
  });
});

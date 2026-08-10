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
    // "SEAT 3" / "ENTER CARDS", no more "ACTIVE — SEAT n / group / bet".
    await waitFor(() => screen.getByText("SEAT 3"));
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
      expect(seatButton.getAttribute("aria-label")).toBe(`Seat ${seat}, empty`);
      expect(within(seatButton).getByText("—")).toBeTruthy();
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

    await waitFor(() => expect(seat2.getAttribute("aria-label")).toBe("Seat 2, active"));
    // ActiveSeatHeader (an existing, separately-tested component) renders
    // once a seat becomes the active target — its appearance here confirms
    // the play field drove the SAME context state, not a parallel one.
    // occupySeat auto-creates a player group ("SEAT 2 · P1"), so this
    // matches on the seat identity via regex rather than an exact string.
    await waitFor(() => screen.getByText(/SEAT 2/));
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
    await waitFor(() => expect(seat4.getAttribute("aria-label")).toBe("Seat 4, occupied"));

    await act(async () => {
      seat4.click();
    });
    await waitFor(() => expect(seat4.getAttribute("aria-label")).toBe("Seat 4, active"));
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
      expect(seat2.getAttribute("aria-label")).toBe("Seat 2, active");
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
    const seatTile = within(surveillancePane).getByRole("button", { name: "Seat 3" });
    await act(async () => {
      seatTile.click();
    });

    const floorPane = screen.getByTestId("floor-pane");
    await waitFor(() => {
      const floorSeat3 = within(floorPane).getByTestId("floor-seat-3");
      expect(floorSeat3.getAttribute("aria-label")).toBe("Seat 3, active");
    });
  });
});

describe("FloorScreen — stays the stripped-down field instrument even with an active, occupied seat", () => {
  it("no wager chips, no player-action buttons, and no permanent deck-preset row — Floor never grows Surveillance's full wager/player-detail surface", async () => {
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
    expect(screen.queryByRole("button", { name: "$25" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Double" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Split" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Insurance" })).toBeNull();
    expect(screen.queryByTestId("player-detail-bar")).toBeNull();
    expect(screen.queryByText("Decks")).toBeNull();
  });
});

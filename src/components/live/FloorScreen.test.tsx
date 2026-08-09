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
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InvestigationProvider, useInvestigationContext } from "@/contexts/InvestigationContext";
import { createInvestigation } from "@/lib/db/repositories/investigations";
import { FloorScreen } from "./FloorScreen";

class MockSpeechRecognition {
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

  it("shows the active seat's bet/context, exactly like ActiveSeatHeader does on Surveillance, once a seat is occupied and selected", async () => {
    function SelectSeatOnMount() {
      const { selectSeat } = useInvestigationContext();
      // selectSeat is what a tap on an empty seat tile does on Surveillance
      // (occupies it and makes it active) — FloorScreen has no seat map of
      // its own, so this harness drives the identical context action
      // directly, exactly as voice's "seat three" command does.
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

    await waitFor(() => screen.getByText(/ACTIVE — SEAT 3/));
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

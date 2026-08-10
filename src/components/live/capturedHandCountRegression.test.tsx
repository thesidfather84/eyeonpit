// @vitest-environment jsdom
//
// Real-device regression: a field-captured hand exported with the current
// round's runningCount/trueCount both null, even though its recorded
// CardEvents produce a real Hi-Lo running count of -3. Root cause (see the
// milestone report): Round.runningCount/trueCount are an intentional
// HISTORICAL-ONLY cache, populated only when a round is superseded by the
// next one (advanceRound) — the current, still-open round's copy is
// ALWAYS null by design, no matter how many cards were entered. Every live
// UI/voice surface already derives its count fresh from calculateCountSnapshot
// over the CardEvent ledger, never from that field — the ONLY place that
// used to hand the raw (and, for the current round, always-null) field to a
// consumer without recomputation was the JSON export (see toJson.ts's new
// `currentCountSnapshot` field). This file proves every surface — the pure
// engine, Surveillance's CountSummaryPanel, Floor's, spoken Status, a
// simulated reload, and the export bundle — all agree on -3 for the exact
// captured sequence, and that the historical-cache field being null is
// documented/expected, not silently wrong.
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvestigationProvider } from "@/contexts/InvestigationContext";
import { LockProvider } from "@/contexts/LockContext";
import { EntryLockProvider } from "@/contexts/EntryLockContext";
import { addCardToRound, getCardEventsForInvestigation } from "@/lib/db/repositories/cardEvents";
import { createInvestigation, getInvestigation, occupySeat } from "@/lib/db/repositories/investigations";
import { calculateCountSnapshot } from "@/lib/counting-engine/calculateCounts";
import { eventsInShoe } from "@/lib/counting-engine/ledger";
import { investigationToJson, type InvestigationExportBundle } from "@/lib/export/toJson";
import type { CardCode } from "@/types/investigation";
import { CountSummaryPanel } from "./CountSummaryPanel";
import { FloorScreen } from "./FloorScreen";
import { LiveScreen } from "./LiveScreen";
import { VoiceControl } from "./VoiceControl";

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

class MockSpeechSynthesisUtterance {
  lang = "";
  constructor(public text: string) {}
}
const mockSpeechSynthesis = { cancel: vi.fn(), speak: vi.fn() };

function makeFinalResultEvent(transcript: string) {
  const alt = { transcript, confidence: 0.9 };
  const result = { isFinal: true, length: 1, 0: alt };
  const results = { length: 1, 0: result };
  return { results, resultIndex: 0 };
}

beforeEach(() => {
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
});

/** Builds the exact real captured sequence: Seat 5: A,10 · Seat 6: 10,A · Dealer: 10,5 · Seat 1: 7,3 — Hi-Lo RC = -3. */
async function buildCapturedHandInvestigation(): Promise<string> {
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
  await occupySeat(inv.localId, 1);
  await occupySeat(inv.localId, 5);
  await occupySeat(inv.localId, 6);
  const roundId = inv.rounds[0].id;

  function seatCard(seatNumber: number, rank: CardCode["rank"]) {
    return addCardToRound({
      investigationLocalId: inv.localId,
      roundId,
      targetType: "seat",
      targetId: seatNumber,
      rank,
      applyToRound: (round) => {
        const seat = round.seats[seatNumber];
        if (!seat) return round;
        return {
          ...round,
          seats: { ...round.seats, [seatNumber]: { ...seat, playerCards: [...seat.playerCards, { rank, suit: "unspecified" }] } },
        };
      },
      event: { type: "card", message: `Seat ${seatNumber}: ${rank}` },
    });
  }
  function dealerCard(rank: CardCode["rank"]) {
    return addCardToRound({
      investigationLocalId: inv.localId,
      roundId,
      targetType: "dealer",
      targetId: "dealer",
      rank,
      applyToRound: (round) => ({ ...round, dealerHand: { cards: [...round.dealerHand.cards, { rank, suit: "unspecified" }] } }),
      event: { type: "card", message: `Dealer: ${rank}` },
    });
  }

  // Exact real order.
  await seatCard(5, "A");
  await seatCard(5, "10");
  await seatCard(6, "10");
  await seatCard(6, "A");
  await dealerCard("10");
  await dealerCard("5");
  await seatCard(1, "7");
  await seatCard(1, "3");

  return inv.localId;
}

describe("captured-hand regression — Seat5:A,10 · Seat6:10,A · Dealer:10,5 · Seat1:7,3 -> Hi-Lo RC -3, every surface agrees", () => {
  it("the pure counting-engine snapshot over the real CardEvent ledger is -3", async () => {
    const investigationId = await buildCapturedHandInvestigation();
    const investigation = await getInvestigation(investigationId);
    const cardEvents = await getCardEventsForInvestigation(investigationId);
    const snapshot = calculateCountSnapshot(
      eventsInShoe(cardEvents, investigation!.rounds[0].shoeNumber),
      investigation!.shoeTotalDecks
    );
    expect(snapshot["Hi-Lo"].running).toBe(-3);
  });

  it("Surveillance's CountSummaryPanel displays -3", async () => {
    const investigationId = await buildCapturedHandInvestigation();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <CountSummaryPanel />
      </InvestigationProvider>
    );
    await waitFor(() => expect(screen.getByLabelText("HI-LO running count").textContent).toBe("-3"));
  });

  it("Floor's count display shows the same -3 — one ledger, not a second Floor-only calculation", async () => {
    const investigationId = await buildCapturedHandInvestigation();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <FloorScreen />
      </InvestigationProvider>
    );
    await waitFor(() => expect(screen.getByLabelText("HI-LO running count").textContent).toBe("-3"));
  });

  it('spoken "Status" reports Hi-Lo -3', async () => {
    const investigationId = await buildCapturedHandInvestigation();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <VoiceControl />
      </InvestigationProvider>
    );
    const micButton = await screen.findByRole("button", { name: "Start voice command" });
    await act(async () => {
      micButton.click();
    });
    await act(async () => {
      MockSpeechRecognition.current?.onresult?.(makeFinalResultEvent("status"));
    });

    await waitFor(() => screen.getByText("✓ Hi-Lo -3."));
    const spoken = mockSpeechSynthesis.speak.mock.calls[0][0] as MockSpeechSynthesisUtterance;
    expect(spoken.text).toBe("Hi-Lo -3.");
  });

  it("survives a simulated reload — re-fetching the investigation fresh from storage still computes -3, nothing was cached only in memory", async () => {
    const investigationId = await buildCapturedHandInvestigation();

    // First "session": render, confirm -3, then unmount entirely.
    const first = render(
      <InvestigationProvider investigationId={investigationId}>
        <CountSummaryPanel />
      </InvestigationProvider>
    );
    await waitFor(() => expect(screen.getByLabelText("HI-LO running count").textContent).toBe("-3"));
    first.unmount();

    // Second "session" — a fresh provider instance re-reading from Dexie,
    // exactly like a page reload / relaunch would.
    render(
      <InvestigationProvider investigationId={investigationId}>
        <CountSummaryPanel />
      </InvestigationProvider>
    );
    await waitFor(() => expect(screen.getByLabelText("HI-LO running count").textContent).toBe("-3"));
  });

  it("the export bundle's currentCountSnapshot is -3, while investigation.rounds[current].runningCount is null BY DESIGN (historical-only cache, never live truth)", async () => {
    const investigationId = await buildCapturedHandInvestigation();
    const investigation = await getInvestigation(investigationId);
    const json = await investigationToJson(investigation!);
    const bundle: InvestigationExportBundle = JSON.parse(json);

    expect(bundle.currentCountSnapshot["Hi-Lo"].running).toBe(-3);
    // Documents the intentional architecture rather than silently relying
    // on it: the raw cache field for the still-open round is null, exactly
    // as designed — currentCountSnapshot exists precisely so nothing
    // reading the export needs to touch it to get the live truth.
    const currentRound = bundle.investigation.rounds[bundle.investigation.rounds.length - 1];
    expect(currentRound.runningCount).toBeNull();
    expect(currentRound.trueCount).toBeNull();
    // The full ledger is present, so -3 is independently reconstructible
    // from cardEvents alone even without currentCountSnapshot.
    expect(bundle.cardEvents).toHaveLength(8);
  });
});

describe("requirement #6 — Floor and Surveillance are two views of one investigation/ledger, never two counts", () => {
  it("cards entered through Floor's own keypad change the count; switching to a freshly-rendered Surveillance shows the exact same count, and its own spoken Status agrees too", async () => {
    const investigationId = await buildCapturedHandInvestigation(); // -3 already recorded

    const floorRender = render(
      <InvestigationProvider investigationId={investigationId}>
        <FloorScreen />
      </InvestigationProvider>
    );
    await waitFor(() => expect(screen.getByLabelText("HI-LO running count").textContent).toBe("-3"));

    // One more card through Floor's real manual keypad — not the repository directly.
    const kingButton = screen.getByRole("button", { name: "10" });
    await act(async () => {
      kingButton.click();
    });
    await waitFor(() => expect(screen.getByLabelText("HI-LO running count").textContent).toBe("-4"));
    floorRender.unmount();

    // "Switching to Surveillance" — a fresh render of the other shell
    // against the SAME investigationId, exactly like navigating between
    // the two routes would (LiveScreen needs Lock/EntryLock providers,
    // matching its real mount tree).
    render(
      <LockProvider>
        <EntryLockProvider>
          <InvestigationProvider investigationId={investigationId}>
            <LiveScreen />
          </InvestigationProvider>
        </EntryLockProvider>
      </LockProvider>
    );
    await waitFor(() => expect(screen.getByLabelText("HI-LO running count").textContent).toBe("-4"));

    // Surveillance's own VoiceControl instance, asked independently, must
    // report the identical number — proving Status isn't reading some
    // Floor-specific cached value either.
    const micButton = await screen.findByRole("button", { name: "Start voice command" });
    await act(async () => {
      micButton.click();
    });
    await act(async () => {
      MockSpeechRecognition.current?.onresult?.(makeFinalResultEvent("status"));
    });
    await waitFor(() => screen.getByText("✓ Hi-Lo -4."));
  });
});

// @vitest-environment jsdom
//
// This is the ONE test in the suite that renders the real React Context
// (InvestigationProvider) and drives the exact production path a tap on
// CardEntryPad goes through: addCard() -> addCardToRound() (Dexie
// transaction, real fake-indexeddb) -> refresh() -> new `cardEvents` state
// -> re-render. Every other test in this repo either exercises the pure
// counting-engine functions directly or the repository layer directly;
// neither proves the React wiring itself refreshes the visible count after
// a real card tap. This one does.
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InvestigationProvider, useInvestigationContext } from "./InvestigationContext";
import { createInvestigation } from "@/lib/db/repositories/investigations";
import { calculateCountSnapshot } from "@/lib/counting-engine/calculateCounts";
import { eventsInShoe } from "@/lib/counting-engine/ledger";
import type { Rank } from "@/types/investigation";

/**
 * Stands in for CardEntryPad: reads the same `cardEvents` the real
 * CountSummaryPanel reads, computes the same snapshot, and calls the exact
 * same `addCard` the real dealer-card tap handler calls.
 */
function LiveCountProbe() {
  const { investigation, currentRound, cardEvents, addCard } = useInvestigationContext();
  const snapshot = calculateCountSnapshot(
    eventsInShoe(cardEvents, currentRound.shoeNumber),
    investigation.shoeTotalDecks
  );

  function tapDealer(rank: Rank) {
    void addCard(
      { targetType: "dealer", targetId: "dealer", rank },
      (round) => ({
        ...round,
        dealerHand: { cards: [...round.dealerHand.cards, { rank, suit: "unspecified" }] },
      }),
      { type: "card", message: `Dealer: ${rank}` }
    );
  }

  return (
    <div>
      <div data-testid="hi-lo-rc">{snapshot["Hi-Lo"].running}</div>
      <div data-testid="ko-rc">{snapshot.KO.running}</div>
      <div data-testid="zen-rc">{snapshot.Zen.running}</div>
      <div data-testid="omega-rc">{snapshot["Omega II"].running}</div>
      <div data-testid="dealer-card-count">{currentRound.dealerHand.cards.length}</div>
      <button onClick={() => tapDealer("10")}>tap-10</button>
      <button onClick={() => tapDealer("2")}>tap-2</button>
      <button
        onClick={() =>
          void addCard(
            { targetType: "seat", targetId: 1, rank: "A" },
            (round) => {
              const seat = round.seats[1];
              if (!seat) return round;
              return {
                ...round,
                seats: { ...round.seats, 1: { ...seat, playerCards: [...seat.playerCards, { rank: "A", suit: "unspecified" }] } },
              };
            },
            { type: "card", message: "Seat 1: A" }
          )
        }
      >
        tap-seat1-A
      </button>
    </div>
  );
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

describe("InvestigationContext — real card-entry integration path", () => {
  it("Dealer 10, 10, 2, 2 through the real addCard path produces Hi-Lo -1, -2, -1, 0 — and refreshes the visible count each time", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <LiveCountProbe />
      </InvestigationProvider>
    );

    await waitFor(() => expect(screen.getByTestId("hi-lo-rc").textContent).toBe("0"));

    const expected = ["-1", "-2", "-1", "0"];
    const taps = ["tap-10", "tap-10", "tap-2", "tap-2"];

    for (let i = 0; i < taps.length; i++) {
      const button = screen.getByText(taps[i]);
      await act(async () => {
        button.click();
      });
      await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe(String(i + 1)));
      expect(screen.getByTestId("hi-lo-rc").textContent).toBe(expected[i]);
    }
  });

  it("all four systems stay simultaneously correct through the real path (KO/Zen/Omega II, not just Hi-Lo)", async () => {
    const investigationId = await freshInvestigationId();
    render(
      <InvestigationProvider investigationId={investigationId}>
        <LiveCountProbe />
      </InvestigationProvider>
    );
    await waitFor(() => expect(screen.getByTestId("hi-lo-rc").textContent).toBe("0"));

    const button = screen.getByText("tap-10");
    await act(async () => {
      button.click();
    });
    await waitFor(() => expect(screen.getByTestId("dealer-card-count").textContent).toBe("1"));

    // decksInPlay=6 -> KO IRC = -4*(6-1) = -20, then one "10" (-1) -> -21.
    expect(screen.getByTestId("hi-lo-rc").textContent).toBe("-1");
    expect(screen.getByTestId("ko-rc").textContent).toBe("-21");
    expect(screen.getByTestId("zen-rc").textContent).toBe("-2");
    expect(screen.getByTestId("omega-rc").textContent).toBe("-2");
  });

  it("a player-seat card through the real addCard path updates the same live-refreshed count", async () => {
    const investigationId = await freshInvestigationId();
    const { occupySeat } = await import("@/lib/db/repositories/investigations");
    await occupySeat(investigationId, 1);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <LiveCountProbe />
      </InvestigationProvider>
    );
    await waitFor(() => expect(screen.getByTestId("hi-lo-rc").textContent).toBe("0"));

    const button = screen.getByText("tap-seat1-A");
    await act(async () => {
      button.click();
    });

    await waitFor(() => expect(screen.getByTestId("hi-lo-rc").textContent).toBe("-1"));
  });
});

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

/**
 * Stands in for CardEntryPad + RoundControlsRow together, for exercising
 * context-aware Undo across multiple seats/dealer at once: seat-selection
 * buttons drive the real `setActiveTarget`, per-seat/dealer card taps drive
 * the real `addCard`, and the Undo button drives the real `undo()` with the
 * real dynamic `undoLabel` — exactly the production wiring, just without
 * the visual chrome.
 */
function UndoProbe() {
  const { investigation, currentRound, cardEvents, addCard, activeTarget, setActiveTarget, undo, undoLabel, clearSeatHand } =
    useInvestigationContext();
  const snapshot = calculateCountSnapshot(
    eventsInShoe(cardEvents, currentRound.shoeNumber),
    investigation.shoeTotalDecks
  );

  function tapSeat(seatNumber: number, rank: Rank) {
    void addCard(
      { targetType: "seat", targetId: seatNumber, rank },
      (round) => {
        const seat = round.seats[seatNumber];
        if (!seat) return round;
        return {
          ...round,
          seats: { ...round.seats, [seatNumber]: { ...seat, playerCards: [...seat.playerCards, { rank, suit: "unspecified" }] } },
        };
      },
      { type: "card", message: `Seat ${seatNumber}: ${rank}` }
    );
  }

  function tapDealer(rank: Rank) {
    void addCard(
      { targetType: "dealer", targetId: "dealer", rank },
      (round) => ({ ...round, dealerHand: { cards: [...round.dealerHand.cards, { rank, suit: "unspecified" }] } }),
      { type: "card", message: `Dealer: ${rank}` }
    );
  }

  return (
    <div>
      <div data-testid="hi-lo-rc">{snapshot["Hi-Lo"].running}</div>
      <div data-testid="active-target">{String(activeTarget)}</div>
      <div data-testid="undo-label">{undoLabel}</div>
      <div data-testid="dealer-cards">{currentRound.dealerHand.cards.map((c) => c.rank).join(",")}</div>
      {[1, 3, 5].map((seatNumber) => (
        <div key={seatNumber} data-testid={`seat-${seatNumber}-cards`}>
          {currentRound.seats[seatNumber]?.playerCards.map((c) => c.rank).join(",") ?? ""}
        </div>
      ))}
      <button onClick={() => tapSeat(1, "2")}>tap-seat1-2</button>
      <button onClick={() => tapSeat(3, "3")}>tap-seat3-3</button>
      <button onClick={() => tapSeat(5, "4")}>tap-seat5-4</button>
      <button onClick={() => tapDealer("10")}>tap-dealer-10</button>
      <button onClick={() => setActiveTarget(3)}>select-seat3</button>
      <button onClick={() => setActiveTarget(5)}>select-seat5</button>
      <button onClick={() => setActiveTarget("dealer")}>select-dealer</button>
      <button onClick={undo}>undo</button>
      <button onClick={() => void clearSeatHand(3)}>clear-seat3-hand</button>
    </div>
  );
}

async function occupySeats(investigationId: string, seatNumbers: number[]): Promise<void> {
  const { occupySeat } = await import("@/lib/db/repositories/investigations");
  for (const seatNumber of seatNumbers) {
    await occupySeat(investigationId, seatNumber);
  }
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

describe("InvestigationContext — context-aware Undo", () => {
  it("interleaved cards across seats: Seat 1, Seat 3, then Seat 5 each keep exactly their own card", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeats(investigationId, [1, 3, 5]);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <UndoProbe />
      </InvestigationProvider>
    );
    await waitFor(() => expect(screen.getByTestId("hi-lo-rc").textContent).toBe("0"));

    for (const label of ["tap-seat1-2", "tap-seat3-3", "tap-seat5-4"]) {
      await act(async () => {
        screen.getByText(label).click();
      });
    }

    await waitFor(() => expect(screen.getByTestId("seat-5-cards").textContent).toBe("4"));
    expect(screen.getByTestId("seat-1-cards").textContent).toBe("2");
    expect(screen.getByTestId("seat-3-cards").textContent).toBe("3");
    expect(screen.getByTestId("hi-lo-rc").textContent).toBe("3"); // +1 each for 2, 3, 4
  });

  it("Undo with Seat 3 selected reverses only Seat 3's own last card, even though Seat 5's card is globally more recent — the reported bug", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeats(investigationId, [1, 3, 5]);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <UndoProbe />
      </InvestigationProvider>
    );
    await waitFor(() => expect(screen.getByTestId("hi-lo-rc").textContent).toBe("0"));

    for (const label of ["tap-seat1-2", "tap-seat3-3", "tap-seat5-4"]) {
      await act(async () => {
        screen.getByText(label).click();
      });
    }
    await waitFor(() => expect(screen.getByTestId("seat-5-cards").textContent).toBe("4"));

    // The operator is actively working Seat 3, not the globally-last Seat 5.
    await act(async () => {
      screen.getByText("select-seat3").click();
    });
    await waitFor(() => expect(screen.getByTestId("undo-label").textContent).toBe("Undo Seat 3"));

    await act(async () => {
      screen.getByText("undo").click();
    });

    await waitFor(() => expect(screen.getByTestId("seat-3-cards").textContent).toBe(""));
    // Seat 5's card — the globally most recent one — must survive untouched.
    expect(screen.getByTestId("seat-5-cards").textContent).toBe("4");
    expect(screen.getByTestId("seat-1-cards").textContent).toBe("2");
    // Counts reverse only for the event actually undone: Seat 3's "3" (+1)
    // comes back out, Seat 1's "2" and Seat 5's "4" (+1 each) stay counted.
    expect(screen.getByTestId("hi-lo-rc").textContent).toBe("2");
  });

  it("Undo with Dealer selected reverses only the dealer's last card, leaving every seat untouched", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeats(investigationId, [1]);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <UndoProbe />
      </InvestigationProvider>
    );
    await waitFor(() => expect(screen.getByTestId("hi-lo-rc").textContent).toBe("0"));

    await act(async () => {
      screen.getByText("tap-dealer-10").click();
    });
    await waitFor(() => expect(screen.getByTestId("dealer-cards").textContent).toBe("10"));

    await act(async () => {
      screen.getByText("tap-seat1-2").click();
    });
    await waitFor(() => expect(screen.getByTestId("seat-1-cards").textContent).toBe("2"));

    // Seat 1's card is globally more recent than the dealer's — Undo must
    // still reverse the dealer's own card once Dealer is the active target.
    await act(async () => {
      screen.getByText("select-dealer").click();
    });
    await waitFor(() => expect(screen.getByTestId("undo-label").textContent).toBe("Undo Dealer"));

    await act(async () => {
      screen.getByText("undo").click();
    });

    await waitFor(() => expect(screen.getByTestId("dealer-cards").textContent).toBe(""));
    expect(screen.getByTestId("seat-1-cards").textContent).toBe("2"); // untouched
    expect(screen.getByTestId("hi-lo-rc").textContent).toBe("1"); // dealer "10" (-1) reversed; seat1 "2" (+1) remains
  });

  it("Clear Hand removes the seat's displayed cards but never reverses them from the ledger/count", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeats(investigationId, [3]);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <UndoProbe />
      </InvestigationProvider>
    );
    await waitFor(() => expect(screen.getByTestId("hi-lo-rc").textContent).toBe("0"));

    await act(async () => {
      screen.getByText("tap-seat3-3").click();
    });
    await waitFor(() => expect(screen.getByTestId("seat-3-cards").textContent).toBe("3"));
    expect(screen.getByTestId("hi-lo-rc").textContent).toBe("1");

    await act(async () => {
      screen.getByText("clear-seat3-hand").click();
    });

    await waitFor(() => expect(screen.getByTestId("seat-3-cards").textContent).toBe(""));
    // The card is gone from the display, but its CardEvent — and therefore
    // the count — is completely unaffected by Clear Hand.
    expect(screen.getByTestId("hi-lo-rc").textContent).toBe("1");
  });
});

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
import { isSeatLocked } from "@/lib/utils/seatLock";
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
    await waitFor(() => expect(screen.getByTestId("undo-label").textContent).toBe("Undo Spot 3"));

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

/**
 * EyeOnPit 1.10 — targeted, explicit verification of doubledAtCardCount /
 * the double-lock (lib/utils/seatLock.ts) interacting with Undo/Redo,
 * required before any Split/Double voice work per explicit instruction.
 * `pressDouble` here is the exact same mutation
 * PlayerActionsRow.tsx's handleDouble performs, run through the real
 * `mutate()` (which pushes the exact same "round" history entry
 * `splitSeat`/handleDouble already push), so this exercises the REAL
 * undo() decision logic (context-aware per-target card lookup FIRST,
 * whole-round history stack only as a fallback), not a re-implementation
 * of it.
 */
/**
 * Generic across any seat/split target (3, -3, 5, ...) so the same probe
 * covers "an unrelated seat" and "Hand 2 of a split" scenarios without a
 * second component — every button/testid is parameterized by the numeric
 * CardTarget convention (`seatTarget.ts`) the production code itself uses.
 */
function DoubleUndoProbe() {
  const { currentRound, addCard, activeTarget, setActiveTarget, undo, redo, mutate, cardEvents, splitSeat } =
    useInvestigationContext();

  function recordFor(target: number) {
    return target < 0 ? currentRound.splitHands[-target] : currentRound.seats[target];
  }

  function tapTarget(target: number, rank: Rank) {
    const targetType = target < 0 ? "split" : "seat";
    const targetId = Math.abs(target);
    void addCard(
      { targetType, targetId, rank },
      (round) => {
        const key = target < 0 ? "splitHands" : "seats";
        const seat = round[key][targetId];
        if (!seat) return round;
        return { ...round, [key]: { ...round[key], [targetId]: { ...seat, playerCards: [...seat.playerCards, { rank, suit: "unspecified" }] } } };
      },
      { type: "card", message: `Target ${target}: ${rank}` }
    );
  }

  function pressDoubleOn(target: number) {
    const key = target < 0 ? "splitHands" : "seats";
    const targetId = Math.abs(target);
    void mutate(
      (round) => {
        const seat = round[key][targetId];
        if (!seat) return round;
        return {
          ...round,
          [key]: {
            ...round[key],
            [targetId]: {
              ...seat,
              betAmount: seat.betAmount != null ? seat.betAmount * 2 : seat.betAmount,
              doubled: true,
              doubledAtCardCount: seat.playerCards.length,
              actions: [...seat.actions, "double" as const],
            },
          },
        };
      },
      { type: "action", message: `Target ${target}: Double` }
    );
  }

  function probe(target: number, label: string) {
    const record = recordFor(target);
    return (
      <div key={label}>
        <div data-testid={`${label}-cards`}>{record?.playerCards.map((c) => c.rank).join(",") ?? ""}</div>
        <div data-testid={`${label}-doubled`}>{String(record?.doubled ?? false)}</div>
        <div data-testid={`${label}-bet`}>{String(record?.betAmount ?? "")}</div>
        <div data-testid={`${label}-double-count`}>{String(record?.doubledAtCardCount ?? "")}</div>
        <div data-testid={`${label}-locked`}>{String(isSeatLocked(record))}</div>
      </div>
    );
  }

  return (
    <div>
      {probe(3, "seat3")}
      {probe(-3, "split3")}
      {probe(5, "seat5")}
      <div data-testid="active-target">{String(activeTarget)}</div>
      <div data-testid="card-event-count">{cardEvents.filter((e) => e.status === "active").length}</div>
      <button onClick={() => setActiveTarget(3)}>select-seat3</button>
      <button onClick={() => setActiveTarget(-3)}>select-split3</button>
      <button onClick={() => setActiveTarget(5)}>select-seat5</button>
      <button onClick={() => tapTarget(3, "8")}>tap-seat3-8</button>
      <button onClick={() => tapTarget(-3, "9")}>tap-split3-9</button>
      <button onClick={() => tapTarget(5, "7")}>tap-seat5-7</button>
      <button onClick={() => pressDoubleOn(3)}>press-double-seat3</button>
      <button onClick={() => pressDoubleOn(-3)}>press-double-split3</button>
      <button onClick={() => void splitSeat(3)}>press-split-seat3</button>
      <button onClick={undo}>undo</button>
      <button onClick={redo}>redo</button>
    </div>
  );
}

describe("InvestigationContext — Double + Undo/Redo interaction (1.10 Phase 1 verification)", () => {
  it("GOOD CASE: Double, add the one post-double card, then Undo — the lock correctly re-opens and the double stays intact", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeats(investigationId, [3]);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <DoubleUndoProbe />
      </InvestigationProvider>
    );
    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("dealer"));
    await act(async () => {
      screen.getByText("select-seat3").click();
    });

    await act(async () => {
      screen.getByText("tap-seat3-8").click();
    });
    await waitFor(() => expect(screen.getByTestId("seat3-cards").textContent).toBe("8"));
    await act(async () => {
      screen.getByText("tap-seat3-8").click();
    });
    await waitFor(() => expect(screen.getByTestId("seat3-cards").textContent).toBe("8,8"));

    await act(async () => {
      screen.getByText("press-double-seat3").click();
    });
    await waitFor(() => expect(screen.getByTestId("seat3-doubled").textContent).toBe("true"));
    expect(screen.getByTestId("seat3-double-count").textContent).toBe("2");
    expect(screen.getByTestId("seat3-locked").textContent).toBe("false"); // 2 cards, not yet > doubledAtCardCount(2)

    // The one card a double allows.
    await act(async () => {
      screen.getByText("tap-seat3-8").click();
    });
    await waitFor(() => expect(screen.getByTestId("seat3-cards").textContent).toBe("8,8,8"));
    expect(screen.getByTestId("seat3-locked").textContent).toBe("true"); // 3 > 2

    await act(async () => {
      screen.getByText("undo").click();
    });

    await waitFor(() => expect(screen.getByTestId("seat3-cards").textContent).toBe("8,8"));
    // Confirmed: the lock correctly re-opens (2 is no longer > doubledAtCardCount 2),
    // and the double itself is untouched by this undo, exactly as intended for
    // "undo the extra card, not the double".
    expect(screen.getByTestId("seat3-locked").textContent).toBe("false");
    expect(screen.getByTestId("seat3-doubled").textContent).toBe("true");
  });

  it("FIXED (1.10 Phase 2): two-card hand -> Double -> Undo reverts the Double itself — cards are preserved, never removed", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeats(investigationId, [3]);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <DoubleUndoProbe />
      </InvestigationProvider>
    );
    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("dealer"));
    await act(async () => {
      screen.getByText("select-seat3").click();
    });
    await act(async () => {
      screen.getByText("tap-seat3-8").click();
    });
    await waitFor(() => expect(screen.getByTestId("seat3-cards").textContent).toBe("8"));
    await act(async () => {
      screen.getByText("tap-seat3-8").click();
    });
    await waitFor(() => expect(screen.getByTestId("seat3-cards").textContent).toBe("8,8"));

    await act(async () => {
      screen.getByText("press-double-seat3").click();
    });
    await waitFor(() => expect(screen.getByTestId("seat3-doubled").textContent).toBe("true"));
    expect(screen.getByTestId("seat3-bet").textContent).toBe(""); // no bet was ever set in this scenario — betAmount stays null throughout, never NaN/corrupted

    await act(async () => {
      screen.getByText("undo").click();
    });

    // The double is reverted; the hand's own pre-existing cards are completely untouched.
    await waitFor(() => expect(screen.getByTestId("seat3-doubled").textContent).toBe("false"));
    expect(screen.getByTestId("seat3-cards").textContent).toBe("8,8");
    expect(screen.getByTestId("seat3-double-count").textContent).toBe("");
  });

  it("FIXED: two-card hand -> Double -> Undo -> Redo restores the Double exactly", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeats(investigationId, [3]);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <DoubleUndoProbe />
      </InvestigationProvider>
    );
    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("dealer"));
    await act(async () => {
      screen.getByText("select-seat3").click();
    });
    await act(async () => {
      screen.getByText("tap-seat3-8").click();
    });
    await act(async () => {
      screen.getByText("tap-seat3-8").click();
    });
    await waitFor(() => expect(screen.getByTestId("seat3-cards").textContent).toBe("8,8"));
    await act(async () => {
      screen.getByText("press-double-seat3").click();
    });
    await waitFor(() => expect(screen.getByTestId("seat3-doubled").textContent).toBe("true"));
    await act(async () => {
      screen.getByText("undo").click();
    });
    await waitFor(() => expect(screen.getByTestId("seat3-doubled").textContent).toBe("false"));

    await act(async () => {
      screen.getByText("redo").click();
    });

    await waitFor(() => expect(screen.getByTestId("seat3-doubled").textContent).toBe("true"));
    expect(screen.getByTestId("seat3-cards").textContent).toBe("8,8"); // still untouched by either operation
    expect(screen.getByTestId("seat3-double-count").textContent).toBe("2");
  });

  it("FIXED: Double -> extra (post-double) card -> Undo removes the CARD first, Double remains -> Undo again reverts the Double", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeats(investigationId, [3]);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <DoubleUndoProbe />
      </InvestigationProvider>
    );
    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("dealer"));
    await act(async () => {
      screen.getByText("select-seat3").click();
    });
    await act(async () => {
      screen.getByText("tap-seat3-8").click();
    });
    await act(async () => {
      screen.getByText("tap-seat3-8").click();
    });
    await waitFor(() => expect(screen.getByTestId("seat3-cards").textContent).toBe("8,8"));
    await act(async () => {
      screen.getByText("press-double-seat3").click();
    });
    await waitFor(() => expect(screen.getByTestId("seat3-doubled").textContent).toBe("true"));
    await act(async () => {
      screen.getByText("tap-seat3-8").click(); // the one post-double card
    });
    await waitFor(() => expect(screen.getByTestId("seat3-cards").textContent).toBe("8,8,8"));

    // First Undo: removes the extra card, Double remains intact.
    await act(async () => {
      screen.getByText("undo").click();
    });
    await waitFor(() => expect(screen.getByTestId("seat3-cards").textContent).toBe("8,8"));
    expect(screen.getByTestId("seat3-doubled").textContent).toBe("true");

    // Second Undo: NOW reverts the Double itself.
    await act(async () => {
      screen.getByText("undo").click();
    });
    await waitFor(() => expect(screen.getByTestId("seat3-doubled").textContent).toBe("false"));
    expect(screen.getByTestId("seat3-cards").textContent).toBe("8,8"); // the two original cards remain
  });

  it("FIXED: Redo twice, after the extra-card scenario, restores the Double then the extra card, in the correct order", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeats(investigationId, [3]);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <DoubleUndoProbe />
      </InvestigationProvider>
    );
    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("dealer"));
    await act(async () => {
      screen.getByText("select-seat3").click();
    });
    await act(async () => {
      screen.getByText("tap-seat3-8").click();
    });
    await act(async () => {
      screen.getByText("tap-seat3-8").click();
    });
    await act(async () => {
      screen.getByText("press-double-seat3").click();
    });
    await waitFor(() => expect(screen.getByTestId("seat3-doubled").textContent).toBe("true"));
    await act(async () => {
      screen.getByText("tap-seat3-8").click();
    });
    await waitFor(() => expect(screen.getByTestId("seat3-cards").textContent).toBe("8,8,8"));
    await act(async () => {
      screen.getByText("undo").click(); // removes the extra card
    });
    await waitFor(() => expect(screen.getByTestId("seat3-cards").textContent).toBe("8,8"));
    await act(async () => {
      screen.getByText("undo").click(); // reverts the Double
    });
    await waitFor(() => expect(screen.getByTestId("seat3-doubled").textContent).toBe("false"));
    expect(screen.getByTestId("seat3-cards").textContent).toBe("8,8");

    // First Redo restores the Double (the last thing undone)...
    await act(async () => {
      screen.getByText("redo").click();
    });
    await waitFor(() => expect(screen.getByTestId("seat3-doubled").textContent).toBe("true"));
    expect(screen.getByTestId("seat3-cards").textContent).toBe("8,8"); // extra card not back yet

    // ...then the second Redo restores the extra card.
    await act(async () => {
      screen.getByText("redo").click();
    });
    await waitFor(() => expect(screen.getByTestId("seat3-cards").textContent).toBe("8,8,8"));
    expect(screen.getByTestId("seat3-doubled").textContent).toBe("true");
  });

  it("FIXED: the identical Double/Undo/Redo behavior holds on Hand 2 of a split, independent of Hand 1", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeats(investigationId, [3]);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <DoubleUndoProbe />
      </InvestigationProvider>
    );
    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("dealer"));
    await act(async () => {
      screen.getByText("select-seat3").click();
    });
    await act(async () => {
      screen.getByText("tap-seat3-8").click();
    });
    await act(async () => {
      screen.getByText("tap-seat3-8").click();
    });
    await waitFor(() => expect(screen.getByTestId("seat3-cards").textContent).toBe("8,8"));
    await act(async () => {
      screen.getByText("press-split-seat3").click();
    });
    await waitFor(() => expect(screen.getByTestId("split3-cards").textContent).toBe(""));

    await act(async () => {
      screen.getByText("select-split3").click();
    });
    await act(async () => {
      screen.getByText("tap-split3-9").click();
    });
    await waitFor(() => expect(screen.getByTestId("split3-cards").textContent).toBe("9"));
    await act(async () => {
      screen.getByText("press-double-split3").click();
    });
    await waitFor(() => expect(screen.getByTestId("split3-doubled").textContent).toBe("true"));

    await act(async () => {
      screen.getByText("undo").click();
    });

    // Hand 2's double is reverted, its one card is untouched, and Hand 1 (never doubled) is completely unaffected.
    await waitFor(() => expect(screen.getByTestId("split3-doubled").textContent).toBe("false"));
    expect(screen.getByTestId("split3-cards").textContent).toBe("9");
    expect(screen.getByTestId("seat3-cards").textContent).toBe("8,8");
    expect(screen.getByTestId("seat3-doubled").textContent).toBe("false");
  });

  it("Undo on an unrelated seat remains completely correct — another seat's Double never leaks into it", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeats(investigationId, [3, 5]);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <DoubleUndoProbe />
      </InvestigationProvider>
    );
    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("dealer"));
    await act(async () => {
      screen.getByText("select-seat3").click();
    });
    await act(async () => {
      screen.getByText("tap-seat3-8").click();
    });
    await act(async () => {
      screen.getByText("tap-seat3-8").click();
    });
    await act(async () => {
      screen.getByText("press-double-seat3").click();
    });
    await waitFor(() => expect(screen.getByTestId("seat3-doubled").textContent).toBe("true"));

    // Switch to an entirely unrelated seat, add its own card, and Undo —
    // must reverse ONLY seat 5's card, never touch seat 3's double at all.
    await act(async () => {
      screen.getByText("select-seat5").click();
    });
    await act(async () => {
      screen.getByText("tap-seat5-7").click();
    });
    await waitFor(() => expect(screen.getByTestId("seat5-cards").textContent).toBe("7"));

    await act(async () => {
      screen.getByText("undo").click();
    });

    await waitFor(() => expect(screen.getByTestId("seat5-cards").textContent).toBe(""));
    // Seat 3's double is completely untouched by an unrelated seat's undo.
    expect(screen.getByTestId("seat3-doubled").textContent).toBe("true");
    expect(screen.getByTestId("seat3-cards").textContent).toBe("8,8");
  });

  it("Undoing only the Double never touches the CardEvent ledger or the count", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeats(investigationId, [3]);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <DoubleUndoProbe />
      </InvestigationProvider>
    );
    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("dealer"));
    await act(async () => {
      screen.getByText("select-seat3").click();
    });
    await act(async () => {
      screen.getByText("tap-seat3-8").click();
    });
    await act(async () => {
      screen.getByText("tap-seat3-8").click();
    });
    await waitFor(() => expect(screen.getByTestId("card-event-count").textContent).toBe("2"));
    await act(async () => {
      screen.getByText("press-double-seat3").click();
    });
    await waitFor(() => expect(screen.getByTestId("seat3-doubled").textContent).toBe("true"));
    // Double itself never creates a CardEvent — confirmed still exactly 2.
    expect(screen.getByTestId("card-event-count").textContent).toBe("2");

    await act(async () => {
      screen.getByText("undo").click();
    });

    await waitFor(() => expect(screen.getByTestId("seat3-doubled").textContent).toBe("false"));
    // Undoing the Double never creates, removes, or flips a CardEvent — the
    // active-CardEvent count is exactly what it was before, and both
    // physical "8"s are still exactly once each, never duplicated or lost.
    expect(screen.getByTestId("card-event-count").textContent).toBe("2");
    expect(screen.getByTestId("seat3-cards").textContent).toBe("8,8");
  });

  it("Redo after the GOOD CASE undo correctly re-locks the hand", async () => {
    const investigationId = await freshInvestigationId();
    await occupySeats(investigationId, [3]);

    render(
      <InvestigationProvider investigationId={investigationId}>
        <DoubleUndoProbe />
      </InvestigationProvider>
    );
    await waitFor(() => expect(screen.getByTestId("active-target").textContent).toBe("dealer"));
    await act(async () => {
      screen.getByText("select-seat3").click();
    });
    await act(async () => {
      screen.getByText("tap-seat3-8").click();
    });
    await waitFor(() => expect(screen.getByTestId("seat3-cards").textContent).toBe("8"));
    await act(async () => {
      screen.getByText("tap-seat3-8").click();
    });
    await waitFor(() => expect(screen.getByTestId("seat3-cards").textContent).toBe("8,8"));
    await act(async () => {
      screen.getByText("press-double-seat3").click();
    });
    await waitFor(() => expect(screen.getByTestId("seat3-doubled").textContent).toBe("true"));
    await act(async () => {
      screen.getByText("tap-seat3-8").click();
    });
    await waitFor(() => expect(screen.getByTestId("seat3-locked").textContent).toBe("true"));
    await act(async () => {
      screen.getByText("undo").click();
    });
    await waitFor(() => expect(screen.getByTestId("seat3-locked").textContent).toBe("false"));

    await act(async () => {
      screen.getByText("redo").click();
    });

    await waitFor(() => expect(screen.getByTestId("seat3-cards").textContent).toBe("8,8,8"));
    expect(screen.getByTestId("seat3-locked").textContent).toBe("true");
    expect(screen.getByTestId("seat3-doubled").textContent).toBe("true");
  });
});

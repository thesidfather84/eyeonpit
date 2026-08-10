"use client";

import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { formatCard } from "@/lib/utils/cards";

/**
 * Floor Mode's compact play-field summary — the answer to "when the
 * operator talks, one glance confirms what EyeOnPit heard." Deliberately
 * NOT SeatTilesRow/TableMap (the full Surveillance table): no bet amounts,
 * hand totals, blackjack/bust labels, player groups, AP indicators, split
 * hands, or Edit Mode — just dealer cards, each seat's occupied/empty
 * state, its current cards, and which target is active. Reads only the
 * existing `investigation`/`currentRound`/`activeTarget` state every other
 * live-screen component already uses — no new ledger, no new data model,
 * no state of its own.
 *
 * Tap parity with the full table: tapping the dealer row selects it
 * (setActiveTarget), and tapping ANY seat row — empty or occupied — calls
 * occupySeat, the exact same production path SeatTilesRow's own tap
 * handler uses (it already no-ops to a plain select when the seat is
 * already occupied). An explicit voice target does the same thing (see
 * VoiceControl.tsx) — the compact view and voice entry can never disagree
 * about what "selecting seat 2" means.
 */
export function FloorPlayField() {
  const { investigation, currentRound, activeTarget, occupySeat, setActiveTarget } = useInvestigationContext();

  const dealerCards = currentRound.dealerHand.cards;
  const isDealerActive = activeTarget === "dealer";

  return (
    <div
      className="flex-none border-b border-border bg-surface px-1.5 py-1"
      data-testid="floor-play-field"
    >
      <button
        type="button"
        onClick={() => setActiveTarget("dealer")}
        aria-label={isDealerActive ? "Dealer, active" : "Dealer"}
        data-testid="floor-dealer"
        style={{ touchAction: "manipulation" }}
        className={`flex w-full items-center justify-between rounded-md px-1.5 py-0.5 text-left ${
          isDealerActive ? "bg-accent-secondary/15" : "bg-transparent"
        }`}
      >
        <span
          className={`text-[10px] font-bold leading-none ${
            isDealerActive ? "text-accent-secondary" : "text-dealer"
          }`}
        >
          {isDealerActive ? "ACTIVE · DEALER" : "DEALER"}
        </span>
        <span className="text-[10px] leading-none text-muted-foreground">
          {dealerCards.length > 0 ? dealerCards.map(formatCard).join(" ") : "—"}
        </span>
      </button>

      <div className="mt-0.5 grid grid-cols-2 gap-x-1.5 gap-y-0.5 short:grid-cols-4">
        {([1, 2, 3, 4, 5, 6, 7] as const).map((seat) => {
          const isOccupied = investigation.occupiedSeats.includes(seat);
          const isActive = activeTarget === seat;
          const cards = currentRound.seats[seat]?.playerCards ?? [];

          return (
            <button
              key={seat}
              type="button"
              onClick={() => occupySeat(seat)}
              aria-label={isActive ? `Seat ${seat}, active` : isOccupied ? `Seat ${seat}, occupied` : `Seat ${seat}, empty`}
              data-testid={`floor-seat-${seat}`}
              style={{ touchAction: "manipulation" }}
              className={`flex items-center justify-between rounded-md px-1.5 py-0.5 text-left ${
                isActive ? "bg-accent-secondary/15" : isOccupied ? "bg-status-green/10" : "bg-transparent"
              }`}
            >
              <span
                className={`text-[10px] font-bold leading-none ${
                  isActive ? "text-accent-secondary" : isOccupied ? "text-status-green" : "text-muted-foreground"
                }`}
              >
                {isActive ? `ACTIVE · S${seat}` : `S${seat}`}
              </span>
              <span className="text-[10px] leading-none text-muted-foreground">
                {isOccupied ? (cards.length > 0 ? cards.map(formatCard).join(" ") : "—") : "—"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

import { calculateCountSnapshot } from "@/lib/counting-engine/calculateCounts";
import { computeCardsRemaining } from "@/lib/counting-engine/calculateTrueCount";
import { eventsInShoe } from "@/lib/counting-engine/ledger";
import { useInvestigationContext } from "@/contexts/InvestigationContext";

/** Final section of the single Live screen — shoe progress plus investigation-wide totals, all derived live from the card ledger, nothing stored redundantly. */
export function BottomStatusBar() {
  const { investigation, currentRound, cardEvents } = useInvestigationContext();
  const stats = calculateCountSnapshot(
    eventsInShoe(cardEvents, currentRound.shoeNumber),
    investigation.shoeTotalDecks
  );
  const totalCards = Math.max(1, investigation.shoeTotalDecks * 52);
  const penetrationPct = Math.min(100, (stats.exposedCardCount / totalCards) * 100);
  const cardsRemaining = computeCardsRemaining(investigation.shoeTotalDecks, stats.exposedCardCount);

  const totalHands = investigation.rounds.reduce(
    (sum, round) =>
      sum + Object.values(round.seats).filter((seat) => seat?.betAmount != null).length,
    0
  );

  // What EyeOnPit believes is actively being counted right now — the active
  // pack/shoe size, never a physical-deck-inventory number (there is no
  // such field; shoeTotalDecks IS the active pack). See AGENTS.md 1.13a §15.
  const activePackLabel = investigation.blackjackFormat === "shoe" ? "Active Shoe" : "Active Pack";
  const activePackValue = `${investigation.shoeTotalDecks} Deck${investigation.shoeTotalDecks === 1 ? "" : "s"}`;

  const items: { label: string; value: string }[] = [
    { label: activePackLabel, value: activePackValue },
    { label: "Cards Seen", value: String(stats.exposedCardCount) },
    { label: "Cards Remaining", value: String(cardsRemaining) },
    { label: "Decks Remaining", value: stats.decksRemaining.toFixed(1) },
    { label: "Penetration", value: `${penetrationPct.toFixed(0)}%` },
    { label: "Rounds", value: String(investigation.rounds.length) },
    { label: "Hands", value: String(totalHands) },
    { label: "Occupied Seats", value: investigation.occupiedSeats.join(", ") || "none" },
  ];

  return (
    <div className="grid grid-cols-3 gap-x-2 gap-y-2 border-t border-border bg-surface p-3 text-xs sm:grid-cols-6">
      {items.map((item) => (
        <div key={item.label}>
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{item.label}</p>
          <p className="font-semibold text-foreground">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

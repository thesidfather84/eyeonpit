"use client";

import { useState } from "react";
import { calculateCountSnapshot } from "@/lib/counting-engine/calculateCounts";
import { eventsInShoe } from "@/lib/counting-engine/ledger";
import { updateGameConfigAndRecalculate } from "@/lib/db/repositories/investigations";
import { useInvestigationContext } from "@/contexts/InvestigationContext";

const DECK_PRESETS = [1, 2, 6, 8];

/**
 * Deck count must be an obvious, tappable control on the live screen
 * itself, not just buried in Quick/Advanced Setup — but only while it's
 * still safe to change: once any card has been recorded for the current
 * shoe, changing shoeTotalDecks out from under it would silently corrupt
 * decks-remaining/true-count for cards already counted, so this renders
 * nothing past that point (Quick Setup's "risky change" confirmation flow
 * is the correct path once a shoe is underway).
 */
export function LiveDeckSelector() {
  const { investigation, currentRound, cardEvents, refresh } = useInvestigationContext();
  const [busy, setBusy] = useState(false);
  const snapshot = calculateCountSnapshot(
    eventsInShoe(cardEvents, currentRound.shoeNumber),
    investigation.shoeTotalDecks
  );

  if (snapshot.exposedCardCount > 0) return null;

  async function selectDecks(n: number) {
    if (n === investigation.shoeTotalDecks || busy) return;
    setBusy(true);
    try {
      await updateGameConfigAndRecalculate(investigation.localId, { shoeTotalDecks: n });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-none items-center gap-2 border-b border-border bg-surface px-3 py-1.5 short:flex-col short:items-start short:gap-1 short:border-b-0 short:px-2 short:py-1">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Decks
      </span>
      <div className="flex gap-1.5 short:flex-wrap short:gap-1">
        {DECK_PRESETS.map((n) => {
          const selected = investigation.shoeTotalDecks === n;
          return (
            <button
              key={n}
              type="button"
              disabled={busy}
              aria-pressed={selected}
              onClick={() => selectDecks(n)}
              className={`tap-target rounded-md border px-3 text-xs font-bold disabled:opacity-40 short:px-2 short:text-[10px] ${
                selected
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border bg-surface-raised text-foreground"
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

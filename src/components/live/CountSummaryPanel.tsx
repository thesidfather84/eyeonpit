import { activeEventsInOrder, calculateCountSnapshot } from "@/lib/counting-engine/calculateCounts";
import { roundTrueCountForDisplay } from "@/lib/counting-engine/calculateTrueCount";
import { COUNTING_SYSTEMS } from "@/lib/counting-engine/countTags";
import { eventsInShoe } from "@/lib/counting-engine/ledger";
import { useInvestigationContext } from "@/contexts/InvestigationContext";
import { formatSigned, formatTrueCount as formatRoundedTrueCount } from "@/lib/utils/countFormatting";

/** Unbalanced systems (KO) have no meaningful true count — never fabricate one by falling back to 0 or to the running count. Rounding happens only here, at display time (see roundTrueCountForDisplay). */
function formatTrueCount(value: number | null): string {
  return formatRoundedTrueCount(roundTrueCountForDisplay(value));
}

const ABBR: Record<string, string> = { "Hi-Lo": "HI-LO", KO: "KO", Zen: "ZEN", "Omega II": "OMEGA" };

/**
 * The count strip — one horizontal row of every calculated value, meant to
 * be embedded directly in LiveHeader (see LiveHeader.tsx: its own compact
 * second line in portrait, inline in the same row as everything else once
 * there's enough width for landscape/desktop). It receives one calculated
 * CountSnapshot from the counting engine and only formats/renders it — it
 * never calculates a count itself. The primary system's running count is
 * the largest, boldest value in the strip; RC/TC repeat it alongside the
 * true count as smaller labeled pairs; every other system, plus Aces Seen
 * and Decks Remaining, render as equal-size secondary chips.
 *
 * Every numeric slot reserves a fixed minimum width (`tabular-nums` +
 * `min-w-[Nch]`) so a value crossing a digit boundary (+9 -> +10) or a
 * decimal changing never reflows a neighboring value, the chips after it,
 * or the header controls beside it. If the chip row doesn't fit at a given
 * width, it scrolls horizontally (`overflow-x-auto`) rather than wrapping
 * or clipping a value out of view.
 */
export function CountSummaryPanel() {
  const { investigation, currentRound, cardEvents } = useInvestigationContext();
  const shoeEvents = eventsInShoe(cardEvents, currentRound.shoeNumber);
  const snapshot = calculateCountSnapshot(shoeEvents, investigation.shoeTotalDecks);
  const primary = investigation.countingSystem;
  const others = COUNTING_SYSTEMS.filter((s) => s !== primary);
  const primaryValue = snapshot[primary];
  // Aces Seen reuses the engine's own active/ordered event selection (the
  // same function calculateCountSnapshot uses internally) and just tallies
  // by rank — a display aggregate, not a second counting calculation.
  const acesSeen = activeEventsInOrder(shoeEvents).filter((event) => event.rank === "A").length;

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      <div className="flex shrink-0 items-baseline gap-1">
        <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
          {ABBR[primary]}
        </span>
        <span
          className="inline-block min-w-[3.5ch] text-right text-base font-extrabold leading-none tabular-nums text-foreground short:text-sm"
          aria-label={`${ABBR[primary]} running count`}
        >
          {formatSigned(primaryValue.running)}
        </span>
      </div>

      <div className="flex shrink-0 items-baseline gap-1.5 text-[10px] text-muted-foreground">
        <span>
          RC{" "}
          <span className="inline-block min-w-[2.5ch] text-right font-semibold tabular-nums text-foreground">
            {formatSigned(primaryValue.running)}
          </span>
        </span>
        <span>
          TC{" "}
          <span className="inline-block min-w-[3ch] text-right font-semibold tabular-nums text-foreground">
            {formatTrueCount(primaryValue.trueCount)}
          </span>
        </span>
      </div>

      {others.map((system) => (
        <span
          key={system}
          className="flex shrink-0 items-baseline gap-1 rounded-md border border-border bg-surface-raised px-1.5 py-0.5 text-[10px] font-semibold text-foreground"
        >
          <span className="text-muted-foreground">{ABBR[system]}</span>
          <span className="inline-block min-w-[2.5ch] text-right tabular-nums">
            {formatSigned(snapshot[system].running)}
          </span>
        </span>
      ))}

      <span className="flex shrink-0 items-baseline gap-1 rounded-md border border-border bg-surface-raised px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
        <span className="text-muted-foreground">ACES</span>
        <span className="inline-block min-w-[1.5ch] text-right tabular-nums">{acesSeen}</span>
      </span>

      <span className="flex shrink-0 items-baseline gap-1 rounded-md border border-border bg-surface-raised px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
        <span className="text-muted-foreground">DECKS</span>
        <span className="inline-block min-w-[2.5ch] text-right tabular-nums">
          {snapshot.decksRemaining.toFixed(1)}
        </span>
      </span>
    </div>
  );
}

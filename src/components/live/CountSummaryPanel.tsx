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
 * Restrained semantic count coloring — applied to the VALUE text only,
 * never a background/panel, per the count-first UI pass: positive reads as
 * favorable (green/teal family, reusing the existing --status-green
 * token), negative as unfavorable (reusing --destructive, the app's
 * existing red/rose token — no new color was introduced), zero stays
 * perfectly neutral (plain foreground, not muted — it's still the primary
 * number, just not signaling either direction). `null` (KO's true count)
 * is neutral/muted, matching "N/A"'s own quiet treatment. No animation, no
 * flashing — the color is a static property of the current value only.
 */
function countColorClass(value: number | null): string {
  if (value == null) return "text-muted-foreground";
  if (value > 0) return "text-status-green";
  if (value < 0) return "text-destructive";
  return "text-foreground";
}

/**
 * The count dashboard (AGENTS.md operational UI rebuild §4) — one shared
 * panel, reused unchanged between Surveillance and Floor, directly below
 * OperationalHeader. It receives one calculated CountSnapshot from the
 * counting engine and only formats/renders it — it never calculates a
 * count itself, and no count calculation changed for this rebuild.
 *
 * Two-tier layout, deliberately: a centered PRIMARY block (system label
 * over a large, bold RC/TC pair — the one thing an operator glancing at
 * the header actually needs) sits above a row of small secondary chips
 * (every other counting system, Aces Seen, Decks Remaining). The primary
 * block is intentionally NOT flush against the left edge — it's the
 * dominant, centered focal point the count-first redesign asked for,
 * replacing the old single left-jammed row. The secondary row wraps
 * (`flex-wrap`) instead of scrolling — this strip must never produce a
 * horizontal scrollbar on a phone, so a value crossing a digit boundary
 * (+9 -> +10) reflows to a second line rather than requiring a swipe to
 * see. `tabular-nums` + fixed `min-w` on every numeric slot keeps that
 * reflow confined to whichever chip actually changed width.
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
    <div
      data-testid="count-dashboard"
      className="flex flex-none flex-col items-center gap-1.5 border-b border-border bg-surface px-3 py-2.5"
    >
      <div className="flex flex-col items-center gap-0">
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground short:text-[8px]">
          {ABBR[primary]}
        </span>
        <div className="flex items-baseline gap-4 short:gap-3">
          <span className="flex items-baseline gap-1">
            <span className="text-[10px] font-bold uppercase text-muted-foreground short:text-[9px]">RC</span>
            <span
              className={`inline-block min-w-[2.5ch] text-right text-2xl font-extrabold leading-none tabular-nums short:text-lg ${countColorClass(primaryValue.running)}`}
              aria-label={`${ABBR[primary]} running count`}
            >
              {formatSigned(primaryValue.running)}
            </span>
          </span>
          <span className="flex items-baseline gap-1">
            <span className="text-[10px] font-bold uppercase text-muted-foreground short:text-[9px]">TC</span>
            <span
              className={`inline-block min-w-[3ch] text-right text-2xl font-extrabold leading-none tabular-nums short:text-lg ${countColorClass(primaryValue.trueCount)}`}
            >
              {formatTrueCount(primaryValue.trueCount)}
            </span>
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1">
        {others.map((system) => (
          <span
            key={system}
            className="flex shrink-0 items-baseline gap-1 rounded-md border border-border bg-surface-raised px-1.5 py-0.5 text-[10px] font-semibold"
          >
            <span className="text-muted-foreground">{ABBR[system]}</span>
            <span className={`inline-block min-w-[2.5ch] text-right tabular-nums ${countColorClass(snapshot[system].running)}`}>
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
    </div>
  );
}

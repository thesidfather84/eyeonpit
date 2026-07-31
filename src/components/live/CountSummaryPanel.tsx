import { calculateCountSnapshot } from "@/lib/counting-engine/calculateCounts";
import { roundTrueCountForDisplay } from "@/lib/counting-engine/calculateTrueCount";
import { COUNTING_SYSTEMS } from "@/lib/counting-engine/countTags";
import { eventsInShoe } from "@/lib/counting-engine/ledger";
import { useInvestigationContext } from "@/contexts/InvestigationContext";

/** Zero must render as "0", not be swallowed by a falsy check — never `value && ...` / `value || ""` / `value ? ... : null` here. */
function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/** Unbalanced systems (KO) have no meaningful true count — never fabricate one by falling back to 0 or to the running count. Rounding happens only here, at display time (see roundTrueCountForDisplay). */
function formatTrueCount(value: number | null): string {
  const rounded = roundTrueCountForDisplay(value);
  return rounded == null ? "N/A" : formatSigned(rounded);
}

const ABBR: Record<string, string> = { "Hi-Lo": "HI-LO", KO: "KO", Zen: "ZEN", "Omega II": "OMEGA" };

/**
 * One compact strip (~40px) — receives one calculated CountSnapshot from
 * the counting engine and only formats/renders it; it never calculates a
 * count itself. Every system updates from the same card ledger; the
 * primary system (investigation.countingSystem) is emphasized, others
 * shown as quick comparison values.
 */
export function CountSummaryPanel() {
  const { investigation, currentRound, cardEvents } = useInvestigationContext();
  const snapshot = calculateCountSnapshot(
    eventsInShoe(cardEvents, currentRound.shoeNumber),
    investigation.shoeTotalDecks
  );
  const primary = investigation.countingSystem;
  const others = COUNTING_SYSTEMS.filter((s) => s !== primary);

  return (
    <div className="flex h-10 flex-none items-center gap-2 overflow-x-auto border-b border-border bg-surface px-2 text-[11px]">
      <span className="shrink-0 font-bold text-foreground">{ABBR[primary]}</span>
      <span className="shrink-0 font-bold text-foreground">
        RC {formatSigned(snapshot[primary].running)}
      </span>
      <span className="shrink-0 font-bold text-accent">
        TC {formatTrueCount(snapshot[primary].trueCount)}
      </span>
      {others.map((system) => (
        <span key={system} className="shrink-0 text-muted-foreground">
          <span className="text-muted-foreground/70">|</span> {ABBR[system]}{" "}
          {formatSigned(snapshot[system].running)}
        </span>
      ))}
      <span className="shrink-0 text-muted-foreground">
        <span className="text-muted-foreground/70">|</span> {snapshot.decksRemaining.toFixed(1)} decks left
      </span>
    </div>
  );
}

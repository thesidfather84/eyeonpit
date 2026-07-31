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
 * The count panel — receives one calculated CountSnapshot from the
 * counting engine and only formats/renders it; it never calculates a count
 * itself. The primary system's running count is the single largest thing
 * on this panel (an operator glancing at the phone must be able to read it
 * without parsing a sentence); RC/TC are smaller secondary labels next to
 * it. Every other enabled system renders as its own equal-size chip below,
 * wrapping onto a second line on narrow phones rather than clipping —
 * this container never uses overflow-hidden or a fixed height that could
 * hide a value. No system gets an arbitrary one-off color; the only color
 * distinction is foreground (values) vs muted-foreground (labels).
 */
export function CountSummaryPanel() {
  const { investigation, currentRound, cardEvents } = useInvestigationContext();
  const snapshot = calculateCountSnapshot(
    eventsInShoe(cardEvents, currentRound.shoeNumber),
    investigation.shoeTotalDecks
  );
  const primary = investigation.countingSystem;
  const others = COUNTING_SYSTEMS.filter((s) => s !== primary);
  const primaryValue = snapshot[primary];

  return (
    <div className="flex flex-none flex-col gap-2 border-b border-border bg-surface px-3 py-2">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            {ABBR[primary]}
          </p>
          <p
            className="text-[2.5rem] font-extrabold leading-none tabular-nums text-foreground"
            aria-label={`${ABBR[primary]} running count`}
          >
            {formatSigned(primaryValue.running)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-[11px] text-muted-foreground">
          <span>
            RC <span className="font-semibold text-foreground">{formatSigned(primaryValue.running)}</span>
          </span>
          <span>
            TC <span className="font-semibold text-foreground">{formatTrueCount(primaryValue.trueCount)}</span>
          </span>
        </div>
      </div>

      {others.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {others.map((system) => (
            <span
              key={system}
              className="shrink-0 rounded-md border border-border bg-surface-raised px-2 py-1 text-[11px] font-semibold text-foreground"
            >
              <span className="text-muted-foreground">{ABBR[system]}</span>{" "}
              {formatSigned(snapshot[system].running)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

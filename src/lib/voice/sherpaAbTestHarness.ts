/**
 * SHERPA A/B/C LAB TEST HARNESS — pure logic extracted from
 * `/lab/sherpa-voice-test` (page.tsx) so it's independently unit-testable
 * without React Testing Library or a real Sherpa/WASM environment. This
 * module has no DOM/WASM dependency and creates no CardEvent, exactly like
 * every other piece of this Lab-only diagnostic tool — see
 * docs/EYEONPIT_VOICE_PROVIDER_RESEARCH.md §11 for the 2026-08-20 real-mic
 * A/B/C session that motivated pulling this logic out (a Lab UX bug —
 * switching configuration didn't reset the phrase run — plus unequal
 * per-config completed-record totals that needed a real, testable
 * accounting).
 *
 * CONFIGURATION DECISION (2026-08-20): per the real A/B/C mic findings,
 * config C (tuned BPE + uppercase hotwords) is the preferred DEFAULT
 * research configuration for this Lab page only — see
 * `DEFAULT_AB_CONFIG` below and `resolveAbConfigProviderOptions`'s own doc
 * comment. This changes NOTHING about production: EyeOnPit's shipped
 * operator app never references Sherpa-ONNX at all (see
 * `src/components/live/VoiceControl.tsx`, unchanged), and A/B are still
 * fully selectable here for ongoing research comparison.
 */
import type { HotwordEntry } from "./casinoVoiceContext";
import type { SherpaOnnxProviderOptions } from "./sherpaOnnxProvider";

export type AbConfig = "A" | "B" | "C";

/**
 * C is now the preferred default per the real 2026-08-20 A/B/C mic session
 * (docs/EYEONPIT_VOICE_PROVIDER_RESEARCH.md §11): it was the preferred
 * configuration on blackjack-specific recognition quality (it correctly
 * recovered Dealer/Player phrases A and B both missed), not merely
 * aggregate acceptance rate. A and B remain fully selectable — this only
 * changes which one the page opens with.
 */
export const DEFAULT_AB_CONFIG: AbConfig = "C";

/**
 * The exact per-configuration `SherpaOnnxProviderOptions` overrides — pulled
 * out of page.tsx's inline `buildProvider` callback verbatim (same values,
 * same conditions), so "C is still BPE + uppercase" and "B is still the
 * confirmed-wrong cjkchar/lowercase baseline, kept deliberately unchanged so
 * the comparison keeps measuring the real regression" are both independently
 * testable facts, not just prose claims. `commonOptions` (the callback
 * handlers) are supplied by the caller — this function only ever returns the
 * A/B/C-specific tuning fields.
 */
export function resolveAbConfigProviderOptions(
  abConfig: AbConfig,
  hotwordList: HotwordEntry[],
  bpeVocabUrl: string
): Pick<SherpaOnnxProviderOptions, "hotwords" | "modelingUnit" | "bpeVocabUrl" | "hotwordCasing"> {
  if (abConfig === "A") {
    return { hotwords: undefined };
  }
  if (abConfig === "C") {
    return {
      hotwords: hotwordList,
      modelingUnit: "bpe",
      bpeVocabUrl,
      hotwordCasing: "upper",
    };
  }
  // B — exactly what every prior round shipped: hotwords on, default
  // modelingUnit/casing (both CONFIRMED wrong for this model, kept exactly
  // as-is so the A/B/C comparison keeps measuring the real regression).
  return { hotwords: hotwordList };
}

/** Minimal shape this module needs from the Lab page's own `UtteranceRecord` — kept narrow and structural rather than importing the page's full type, so this module has zero dependency on the page component. */
export interface AbTestRecordLike {
  provider: "sherpa-onnx" | "browser-web-speech";
  abConfig: AbConfig | null;
  classification: { accepted: boolean; wouldProduceCardEvent: boolean } | null;
  correctness: "unmarked" | "correct" | "incorrect";
}

export interface AbTestAggregate {
  key: string;
  total: number;
  acceptedRate: number;
  cardEventRate: number;
  correctRate: number | null;
  marked: number;
}

/**
 * Groups completed records by configuration key and computes per-group
 * rates — identical logic to the page's own prior inline `useMemo`, now
 * pure and testable. Deliberately does NOT normalize/pad group sizes to a
 * common total: per the 2026-08-20 real A/B/C session finding (unequal
 * completed-record totals per configuration — see the research doc §11),
 * fabricating a controlled equal-N comparison here would misrepresent what
 * was actually captured. Each group's `total` is exactly how many records
 * exist for it — callers must treat these as descriptive per-run figures,
 * not a controlled accuracy comparison, whenever totals differ.
 */
export function computeAggregatesByConfig(records: AbTestRecordLike[]): AbTestAggregate[] {
  const groups: Record<string, AbTestRecordLike[]> = {};
  for (const r of records) {
    const key = r.provider === "sherpa-onnx" ? `sherpa-${r.abConfig ?? "?"}` : "chrome";
    (groups[key] ??= []).push(r);
  }
  return Object.entries(groups).map(([key, recs]) => {
    const total = recs.length;
    const accepted = recs.filter((r) => r.classification?.accepted).length;
    const wouldProduceCardEvent = recs.filter((r) => r.classification?.wouldProduceCardEvent).length;
    const marked = recs.filter((r) => r.correctness !== "unmarked").length;
    const correct = recs.filter((r) => r.correctness === "correct").length;
    return {
      key,
      total,
      acceptedRate: total ? accepted / total : 0,
      cardEventRate: total ? wouldProduceCardEvent / total : 0,
      correctRate: marked ? correct / marked : null,
      marked,
    };
  });
}

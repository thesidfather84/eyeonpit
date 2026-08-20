/**
 * CASINOVOICECONTEXT — the design (not wiring) for how EyeOnPit will
 * eventually tell a hotword-capable SpeechProvider which words matter
 * most right now. See docs/EYEONPIT_VOICE_ARCHITECTURE.md for where this
 * sits in the pipeline (SpeechProvider -> CasinoVoiceContext -> EyeOnPit
 * Transcript Resolver -> ...).
 *
 * This module is inert: `buildHotwordList` is a pure function with no
 * caller anywhere in the app yet. It exists so a future round (explicitly
 * NOT this one — no 1.10 split/multi-hand logic is wired here) has a
 * ready-made seam, and so the hotword LIST ITSELF can already be reasoned
 * about and tested independently of any specific provider. The concrete
 * consumer would be a transducer-based SpeechProvider's own
 * `hotwords-file`/`hotwords-score` inference-time parameters (confirmed
 * real, working sherpa-onnx functionality — see
 * docs/EYEONPIT_VOICE_PROVIDER_RESEARCH.md — an Aho-corasick match against
 * the decoder's own token stream, no model retraining required); nothing
 * about this module assumes that specific engine, though.
 */

import type { GameFamily } from "@/lib/gold-standard/game/gameFamily";

/**
 * A single word or short phrase EyeOnPit wants a hotword-aware provider to
 * listen for more closely, with a BOOST SCORE, not a flat inclusion list —
 * "do not blindly bias every word equally." Higher score = stronger bias.
 * The exact numeric scale is provider-specific (sherpa-onnx's own
 * `hotwords-score` is an arbitrary positive number, typically single
 * digits) — `weight` here is a normalized 1-10 scale a concrete provider
 * adapter converts to its own units, so this module stays provider-
 * agnostic.
 */
export interface HotwordEntry {
  phrase: string;
  weight: number;
  /** Why this word is boosted right now — diagnostic-only, never consulted by any decision logic; lets a future debug view explain "why is 'five' boosted but not 'ten'." */
  reason: string;
}

/**
 * Everything that could eventually influence which hotwords matter most.
 * Every field is present in the TYPE now so a future caller has a stable
 * shape to build against; `buildHotwordList` below only actually USES a
 * subset today (see its own doc comment) — the rest are accepted and
 * silently ignored, not yet load-bearing. This is deliberate: the
 * interface is what 1.10 (and later work) needs to exist; the split/
 * multi-hand/legal-actions LOGIC that would consume it is explicitly out
 * of scope this round.
 */
export interface CasinoVoiceContext {
  /** Which game is being observed — non-blackjack families get none of the blackjack-specific action vocabulary (hit/stand/split/double/surrender/insurance) boosted, once a second GameFamily is actually implemented. Defaults to "blackjack". */
  gameFamily?: GameFamily;
  /** The currently active target, if any — its own position NUMBER gets a small extra boost (it's the most likely next-spoken number in continuation narration), the dealer target boosts dealer-relevant vocabulary instead. */
  activeTarget?: { kind: "dealer" } | { kind: "seat"; seat: 1 | 2 | 3 | 4 | 5 | 6 | 7 };
  /**
   * Reserved for 1.10 split/multi-hand state — e.g. "this spot currently
   * has an active split hand." NOT populated or consumed by anything
   * today; present so 1.10 does not need a breaking interface change to
   * start supplying it.
   */
  splitState?: { hasActiveSplit: boolean };
  /** Actions the current rules/round genuinely allow right now (e.g. a rule profile with no surrender offered) — when populated, an action NOT in this list is a candidate for future exclusion/de-prioritization rather than blanket-boosting every action word regardless of table rules. Not populated by any caller today. */
  legalNextActions?: ("hit" | "stand" | "split" | "double" | "surrender" | "insurance")[];
  /** "spot" or "seat" — the resolved property terminology preference (see lib/reporting/propertyMetadata.ts's resolveTerminology, 1.8). Defaults to "spot", matching 1.9's global operator-facing default. Boosts the PREFERRED synonym higher than the other, rather than weighting both equally. */
  terminology?: "spot" | "seat";
  /** BCP-47-ish locale tag (see lib/i18n/locale.ts, 1.8) — reserved for a future non-English hotword vocabulary. Not consulted today; `buildHotwordList` only ever produces English vocabulary regardless of this field's value, and says so explicitly if it's set to anything else (see that function's own doc comment). */
  locale?: string;
}

interface BaseVocabularyEntry {
  phrase: string;
  weight: number;
  category: "target-word" | "action-word" | "workflow-word" | "rank-word" | "position-number";
}

/**
 * The initial EyeOnPit casino vocabulary, weighted by how consequential a
 * misrecognition of each word actually is — never a flat list. Target
 * words and rank words are weighted highest: a misheard target silently
 * redirects a card to the wrong hand, and a misheard rank silently
 * corrupts the count — both are exactly the "false CardEvent" risk this
 * whole architecture exists to keep at zero. Workflow words are weighted
 * lower — "done"/"next hand" being slightly under-recognized costs a
 * repeated command, not a wrong one.
 */
const BASE_VOCABULARY: BaseVocabularyEntry[] = [
  // Target words — highest weight; wrong target = wrong hand entirely.
  { phrase: "dealer", weight: 10, category: "target-word" },
  { phrase: "player", weight: 9, category: "target-word" },
  { phrase: "spot", weight: 9, category: "target-word" },
  { phrase: "seat", weight: 7, category: "target-word" }, // lower than "spot" — see terminology preference below

  // Rank words — highest weight; a misheard rank silently corrupts the count.
  { phrase: "ace", weight: 10, category: "rank-word" },
  { phrase: "king", weight: 10, category: "rank-word" },
  { phrase: "queen", weight: 10, category: "rank-word" },
  { phrase: "jack", weight: 10, category: "rank-word" },
  { phrase: "ten", weight: 10, category: "rank-word" },
  { phrase: "nine", weight: 9, category: "rank-word" },
  { phrase: "eight", weight: 9, category: "rank-word" },
  { phrase: "seven", weight: 9, category: "rank-word" },
  { phrase: "six", weight: 9, category: "rank-word" },
  { phrase: "five", weight: 9, category: "rank-word" },
  { phrase: "four", weight: 9, category: "rank-word" },
  { phrase: "three", weight: 9, category: "rank-word" },
  { phrase: "two", weight: 9, category: "rank-word" },
  // "one" is deliberately excluded — it collides with Ace's own alias
  // (RANK_WORDS in parseVoiceCommand.ts maps "one" -> Ace already) and, as
  // a hotword, "one" is too short/common a token to safely bias without
  // risking oversensitizing the decoder to an extremely frequent ordinary
  // word — the exact "do not blindly bias every word equally" instruction
  // this module is built around.

  // Action words — real blackjack vocabulary, both imperative and the
  // natural third-person forms real narration actually uses (see
  // parseNarration.ts's own INERT_ACTION_WORDS, PC Field Test #2).
  { phrase: "hit", weight: 7, category: "action-word" },
  { phrase: "hits", weight: 7, category: "action-word" },
  { phrase: "stand", weight: 7, category: "action-word" },
  { phrase: "stands", weight: 7, category: "action-word" },
  { phrase: "split", weight: 7, category: "action-word" },
  { phrase: "splits", weight: 7, category: "action-word" },
  { phrase: "double", weight: 7, category: "action-word" },
  { phrase: "doubles", weight: 7, category: "action-word" },
  { phrase: "surrender", weight: 6, category: "action-word" },
  { phrase: "insurance", weight: 6, category: "action-word" },

  // Workflow words — lower weight; a miss costs a repeat, not a wrong entry.
  { phrase: "done", weight: 5, category: "workflow-word" },
  { phrase: "next hand", weight: 5, category: "workflow-word" },

  // Position numbers 1-7 (spoken digits, not word-forms already covered by
  // rank-word "two".."seven" above — sherpa-onnx's Aho-corasick hotword
  // matcher operates on the model's own BPE/token units, so both the
  // word-form and digit-form are listed where they're genuinely distinct
  // spoken tokens).
  { phrase: "one", weight: 5, category: "position-number" },
];

const DEFAULT_TERMINOLOGY: NonNullable<CasinoVoiceContext["terminology"]> = "spot";

/**
 * Builds a weighted hotword list from the given context. Pure and
 * deterministic — same context in, same list out, no I/O, no randomness.
 *
 * ONLY `terminology` and `activeTarget` are actually consulted today;
 * `gameFamily`/`splitState`/`legalNextActions`/`locale` are accepted
 * (per CasinoVoiceContext's own doc comment on why they're already part
 * of the type) but not yet load-bearing:
 *   - `gameFamily`: every base vocabulary entry is blackjack vocabulary
 *     already, and blackjack is the only IMPLEMENTED GameFamily (see
 *     lib/gold-standard/game/gameFamily.ts) — there is no second game's
 *     vocabulary to switch to yet.
 *   - `splitState`: reserved for 1.10; not consumed here by explicit
 *     instruction.
 *   - `legalNextActions`: would eventually de-prioritize/exclude actions
 *     the current rules don't offer — not implemented; every action word
 *     is included today regardless.
 *   - `locale`: only English vocabulary is ever produced; a non-English
 *     locale value is accepted without error but does not change the
 *     output (see lib/i18n's own "seed catalog, not a translation" note
 *     for the same honesty pattern elsewhere in this codebase).
 */
export function buildHotwordList(context: CasinoVoiceContext = {}): HotwordEntry[] {
  const terminology = context.terminology ?? DEFAULT_TERMINOLOGY;

  const entries: HotwordEntry[] = BASE_VOCABULARY.map((base) => {
    let weight = base.weight;
    let reason = `base ${base.category} vocabulary`;

    if (base.phrase === "spot" || base.phrase === "seat") {
      const isPreferred = base.phrase === terminology;
      weight = isPreferred ? base.weight : Math.max(1, base.weight - 3);
      reason = isPreferred ? `preferred property terminology ("${terminology}")` : `non-preferred terminology synonym`;
    }

    return { phrase: base.phrase, weight, reason };
  });

  if (context.activeTarget?.kind === "seat") {
    const seatWord = SEAT_NUMBER_WORDS[context.activeTarget.seat];
    const existing = entries.find((e) => e.phrase === seatWord);
    if (existing) {
      existing.weight = Math.min(10, existing.weight + 1);
      existing.reason = `${existing.reason} + active Spot ${context.activeTarget.seat} (most likely next-spoken number)`;
    }
  }

  return entries;
}

const SEAT_NUMBER_WORDS: Record<1 | 2 | 3 | 4 | 5 | 6 | 7, string> = {
  1: "one",
  2: "two",
  3: "three",
  4: "four",
  5: "five",
  6: "six",
  7: "seven",
};

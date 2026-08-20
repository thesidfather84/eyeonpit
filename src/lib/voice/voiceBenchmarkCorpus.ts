/**
 * VOICE BENCHMARK CORPUS — a reusable set of real field-captured phrases +
 * their EyeOnPit-specific expected outcomes, for comparing any current or
 * future SpeechProvider against the SAME fixed set of cases using metrics
 * that actually matter to a surveillance tool (never generic Word Error
 * Rate alone — see `BenchmarkMetrics`'s own doc comment).
 *
 * HONEST SCOPE: this module can only score a TRANSCRIPT (or a small set
 * of ASR alternatives) against EyeOnPit's own existing classification
 * pipeline — it does not, and cannot, capture real audio or run any ASR
 * engine itself. `evaluateTranscript`/`computeBenchmarkMetrics` are real,
 * working, and tested; what they measure is "given this text, does
 * EyeOnPit's parser produce the correct, safe outcome" — the SAME
 * question every other voice regression test in this codebase already
 * asks, just organized as a reusable corpus + aggregate-metrics shape a
 * future round can point a REAL provider's real transcript output at. See
 * docs/EYEONPIT_VOICE_PROVIDER_RESEARCH.md for why sherpa-onnx/whisper.cpp
 * numbers are not populated here — this environment has no microphone or
 * audio-file input, so no ASR engine (including Chrome) can actually be
 * RUN here; the entries with `capturedFrom: "real-mic"` reuse alternatives
 * arrays already captured during real PC field testing (see the voice
 * field test docs), not numbers invented for this file.
 */
import { classifyVoiceTranscript, type TranscriptClassification } from "./classifyVoiceTranscript";
import { resolveAlternatives, type ResolveResult } from "./nBestResolver";

export type ExpectedTargetKind = "dealer" | "seat" | "none";

export interface BenchmarkCorpusItem {
  id: string;
  /** The exact phrase (or, for multi-alternative items, the winning/primary phrase) — always real, either hand-authored from the product's own documented grammar or copied verbatim from a real captured field session. */
  transcript: string;
  /** When present, the FULL real captured N-best alternatives array this phrase came from (exact confidences included) — omitted for single-alternative corpus items. */
  alternatives?: { transcript: string; confidence: number | null }[];
  capturedFrom: "real-mic" | "documented-grammar";
  expected: {
    accepted: boolean;
    targetKind?: ExpectedTargetKind;
    /** Ordered card ranks EyeOnPit should record, when `accepted` is true and this is a card-narration item — omitted for workflow/query/target-only items. */
    ranks?: string[];
  };
  /** Free-text note on what real-world ASR/parser risk this item exercises — purely documentation, never consulted by scoring. */
  note: string;
}

/**
 * Every corpus item is either a REAL phrase captured during PC voice field
 * testing (Field Test #2 and its remediation rounds — see
 * docs/EYEONPIT_VOICE_FIELD_TEST_2.md) or a phrase directly from the
 * product's own documented grammar (the Voice Guide). Nothing here is
 * invented to pad the corpus.
 */
export const VOICE_BENCHMARK_CORPUS: BenchmarkCorpusItem[] = [
  {
    id: "dealer-has-five",
    transcript: "dealer has a five",
    capturedFrom: "documented-grammar",
    expected: { accepted: true, targetKind: "dealer", ranks: ["5"] },
    note: "Baseline — explicit, unambiguous dealer single-card narration.",
  },
  {
    id: "taylor-king-and-five",
    transcript: "Taylor has a king and a five",
    capturedFrom: "real-mic",
    expected: { accepted: true, targetKind: "dealer", ranks: ["10", "5"] },
    note: "Dealer-confusion recovery, multi-card, 'and' connector.",
  },
  {
    id: "taylor-king-in-five",
    transcript: "Taylor has a king in a five",
    capturedFrom: "real-mic",
    expected: { accepted: true, targetKind: "dealer", ranks: ["10", "5"] },
    note: 'Dealer-confusion recovery, multi-card, "in" -> "and" ASR artifact.',
  },
  {
    id: "spotify-five",
    transcript: "Spotify has a five",
    capturedFrom: "real-mic",
    expected: { accepted: true, targetKind: "dealer", ranks: ["5"] },
    note: "Dealer-confusion recovery, single card.",
  },
  {
    id: "player-three-hits-gets-four",
    transcript: "player three hits gets a four",
    capturedFrom: "real-mic",
    expected: { accepted: true, targetKind: "seat", ranks: ["4"] },
    note: "Compound narration: inert action word + connector, general parser-handoff fix.",
  },
  {
    id: "player-three-hits-of-four",
    transcript: "player 3 hits of 4",
    capturedFrom: "real-mic",
    expected: { accepted: true, targetKind: "seat", ranks: ["4"] },
    note: '"of" (Chrome mishearing of "gets") tolerated as ordinary noise.',
  },
  {
    id: "play-the-three-hits-gets-four",
    transcript: "play the 3 hits gets a 4",
    capturedFrom: "real-mic",
    expected: { accepted: true, targetKind: "seat", ranks: ["4"] },
    note: '"play the" -> "player" ASR recovery, narrow seat-number lookahead.',
  },
  {
    id: "players-that-down-spot-three",
    transcript: "players that down at spot three",
    capturedFrom: "real-mic",
    expected: { accepted: true, targetKind: "none" },
    note: 'Table-change: "that" -> "sat" ASR recovery. No card, no target op — occupancy change only.',
  },
  {
    id: "players-that-are-down-spot-three",
    transcript: "players that are down at spot three",
    capturedFrom: "real-mic",
    expected: { accepted: true, targetKind: "none" },
    note: 'Table-change: "that are" -> "sat" ASR recovery.',
  },
  {
    id: "current-player-is-player-one",
    transcript: "current player is player one",
    capturedFrom: "documented-grammar",
    expected: { accepted: true, targetKind: "seat" },
    note: "Natural target-setting intent — sets active target (SEAT1), creates no CardEvent (no ranks).",
  },
  {
    id: "player-five-has-a-incomplete",
    transcript: "player five has a",
    capturedFrom: "real-mic",
    expected: { accepted: false },
    note: "SAFETY: dangling connector, incomplete construction — must never downgrade to bare target-select.",
  },
  {
    id: "next-hand",
    transcript: "next hand",
    capturedFrom: "real-mic",
    expected: { accepted: true, targetKind: "none" },
    note: "Workflow alias for Done.",
  },
  {
    id: "time-355",
    transcript: "3:55",
    capturedFrom: "real-mic",
    expected: { accepted: false },
    note: "SAFETY: clock-time pattern must never decompose into two cards.",
  },
  {
    id: "spotify-is-dead",
    transcript: "Spotify is dead",
    capturedFrom: "real-mic",
    expected: { accepted: false },
    note: "SAFETY: the recovery grammar must never match ordinary unrelated speech.",
  },
  {
    id: "bare-seven",
    transcript: "seven",
    capturedFrom: "documented-grammar",
    expected: { accepted: true, targetKind: "none", ranks: ["7"] },
    note: "Bare single card — resolves against whatever target is live-active at commit time.",
  },
];

/**
 * The metrics this app actually cares about, per explicit instruction —
 * generic Word Error Rate alone is not on this list, because a
 * transcription can be 95% textually accurate and still produce a false
 * CardEvent or silently misdirect a card to the wrong hand. `falseCardEvents`
 * is the single most important field — see its own doc comment.
 */
export interface BenchmarkMetrics {
  providerId: string;
  totalItems: number;
  correctTarget: number;
  correctRanks: number;
  correctAction: number;
  /** Both target AND every rank correct, or (for non-card items) the right accept/reject outcome — the strictest, most meaningful single number. */
  completeCommandAccuracy: number;
  /** Fraction of items EyeOnPit correctly classified as valid (accepted) vs its own expectation, among items expected to be ACCEPTED. */
  validCommandAcceptanceRate: number;
  /** Fraction of items expected to REJECT that were correctly rejected — the safety-side counterpart to acceptance rate. */
  validRejectionRate: number;
  /**
   * THE MOST IMPORTANT METRIC. A false CardEvent is any item where
   * EyeOnPit's classification would write card data that does NOT match
   * the expected ranks/target — including accepting an item expected to
   * reject, or recording the wrong rank(s)/target for one expected to
   * accept. This benchmark's own pass/fail bar is exactly this number:
   * it must be 0 for a provider (or a codebase change) to be considered
   * safe, independent of every other metric.
   */
  falseCardEvents: number;
  /** ASR_NO_FINAL-equivalent rate — NOT measurable from transcript-only scoring; always null here. A real provider integration would populate this from actual session lifecycle data (see VoiceControl.tsx's own sessionsStarted/sessionsWithFinal/asrNoFinal counters for the Chrome baseline's real, already-measured version). */
  asrNoFinalRate: null;
  /** Not measurable without real audio timing — see this module's own doc comment. */
  averageLatencyMs: null;
  medianLatencyMs: null;
  /** Not measurable without a real running engine in a real browser. */
  cpuUsage: null;
  memoryUsageMb: null;
  modelDownloadSizeMb: null;
}

/**
 * Parses the classifier's own canonical `actionKey` (see
 * classifyVoiceTranscript.ts's `canonicalActionKey` — steps joined by "|",
 * each either "T:<target>", "C:<target>:<rank>", or "W:<action>") rather
 * than reading `narrationOps` directly, since `actionKey` is the ONE
 * representation guaranteed uniform across every source (narration, legacy,
 * dealer-confusion-recovery, set-active-target) by the classifier's own
 * canonicalization contract — see that module's doc comment.
 */
function extractActual(classification: TranscriptClassification): { targetKind: ExpectedTargetKind; ranks: string[] } {
  if (!classification.valid) return { targetKind: "none", ranks: [] };
  const steps = classification.actionKey.split("|").filter(Boolean);
  const ranks: string[] = [];
  let targetKind: ExpectedTargetKind = "none";
  for (const step of steps) {
    if (step.startsWith("C:")) {
      const [, target, rank] = step.split(":");
      ranks.push(rank);
      if (target === "DEALER") targetKind = "dealer";
      else if (target !== "active") targetKind = "seat";
    } else if (step.startsWith("T:")) {
      const target = step.slice(2);
      if (target === "DEALER") targetKind = "dealer";
      else targetKind = "seat";
    }
  }
  return { targetKind, ranks };
}

/** Scores one corpus item against EyeOnPit's real classification pipeline (optionally through full N-best resolution when `alternatives` is present) — real, deterministic, no network/audio involved. */
export function evaluateCorpusItem(item: BenchmarkCorpusItem): { correctTarget: boolean; correctRanks: boolean; falseCardEvent: boolean; accepted: boolean } {
  let classification: TranscriptClassification;
  if (item.alternatives) {
    const resolved: ResolveResult = resolveAlternatives(item.alternatives, { allowUnscopedContinuation: true });
    classification = resolved.accepted
      ? resolved.alternatives[resolved.winnerIndex].classification
      : { valid: false, code: resolved.code, reason: resolved.reason, appliedRules: [] };
  } else {
    classification = classifyVoiceTranscript(item.transcript, true, true);
  }

  const accepted = classification.valid;
  if (accepted !== item.expected.accepted) {
    return { correctTarget: false, correctRanks: false, falseCardEvent: true, accepted };
  }
  if (!item.expected.accepted) {
    return { correctTarget: true, correctRanks: true, falseCardEvent: false, accepted };
  }

  const actual = extractActual(classification);
  const correctTarget = item.expected.targetKind == null || actual.targetKind === item.expected.targetKind;
  const correctRanks = item.expected.ranks == null || JSON.stringify(actual.ranks) === JSON.stringify(item.expected.ranks);
  return { correctTarget, correctRanks, falseCardEvent: !correctRanks, accepted };
}

/** Aggregates `evaluateCorpusItem` across the whole corpus (or a subset) into the BenchmarkMetrics shape — the four hardware/timing fields are always null, honestly, per this module's own doc comment. */
export function computeBenchmarkMetrics(providerId: string, items: BenchmarkCorpusItem[] = VOICE_BENCHMARK_CORPUS): BenchmarkMetrics {
  const results = items.map(evaluateCorpusItem);
  const total = results.length;
  const correctTarget = results.filter((r) => r.correctTarget).length;
  const correctRanks = results.filter((r) => r.correctRanks).length;
  const falseCardEvents = results.filter((r) => r.falseCardEvent).length;

  const expectedAccept = items.filter((i) => i.expected.accepted);
  const expectedReject = items.filter((i) => !i.expected.accepted);
  const correctlyAccepted = expectedAccept.filter((i) => evaluateCorpusItem(i).accepted).length;
  const correctlyRejected = expectedReject.filter((i) => !evaluateCorpusItem(i).accepted).length;

  return {
    providerId,
    totalItems: total,
    correctTarget,
    correctRanks,
    correctAction: correctTarget, // no distinct "action" (hit/stand/etc.) is ever independently mutated — see parseNarration.ts's INERT_ACTION_WORDS doc comment — so action correctness is captured by target/ranks alone
    completeCommandAccuracy: total === 0 ? 0 : results.filter((r) => r.correctTarget && r.correctRanks).length / total,
    validCommandAcceptanceRate: expectedAccept.length === 0 ? 0 : correctlyAccepted / expectedAccept.length,
    validRejectionRate: expectedReject.length === 0 ? 0 : correctlyRejected / expectedReject.length,
    falseCardEvents,
    asrNoFinalRate: null,
    averageLatencyMs: null,
    medianLatencyMs: null,
    cpuUsage: null,
    memoryUsageMb: null,
    modelDownloadSizeMb: null,
  };
}

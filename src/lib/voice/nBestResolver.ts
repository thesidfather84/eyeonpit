/**
 * SAFE N-BEST RESOLVER — the fix for the root cause behind the "correct
 * result was FINAL alternative #2, but we only ever check alternatives[0]"
 * field failures (e.g. ALT1 "killer king" / ALT2 "dealer King"; ALT1
 * "Taylor has a king" / ALT2 "dealer has a king"). Before this module
 * existed, useVoiceRecognition surfaced every alternative for diagnostics
 * ONLY — VoiceControl.handleFinalResult always parsed `result.transcript`,
 * which is alternatives[0], full stop. This module is what actually looks
 * past index 0.
 *
 * Every alternative is classified in complete isolation by
 * classifyVoiceTranscript.ts (a pure function of the transcript text alone,
 * exactly like parseNarration.ts's own architecture) — this module's only
 * job is to SCORE those classifications and pick a winner, or explain why it
 * refuses to.
 *
 * DELIBERATELY NOT the first alternative that merely parses: see
 * `resolveAlternatives`'s own doc comment for the full winner-selection
 * algorithm, including how genuinely conflicting valid alternatives are
 * refused rather than guessed between.
 *
 * SCOPE: this resolver is used ONLY for the normal command-dispatch path in
 * VoiceControl — never while note-mode free dictation is capturing text,
 * and never while a New-Shoe/End-Investigation confirmation is pending.
 * Both of those are inherently about conversation HISTORY (what mode is the
 * app already in), which a transcript-only classifier has no access to and
 * must not guess at; VoiceControl keeps reading alternatives[0] verbatim for
 * those two modes, entirely unchanged from before this module existed.
 */
import { classifyVoiceTranscript, type TranscriptClassification } from "./classifyVoiceTranscript";
import type { RejectionCode } from "./voiceDiagnosticsTypes";

export interface AlternativeTrace {
  index: number;
  transcript: string;
  confidence: number | null;
  classification: TranscriptClassification;
  /** -Infinity for an invalid classification — never a candidate winner. */
  score: number;
}

export type ResolveResult =
  | {
      accepted: true;
      winnerIndex: number;
      /** Why this winner was chosen — "only valid alternative", "N alternatives agreed", or "resolved a conflict by decisive margin". Always logged alongside RESOLVE WINNER. */
      reason: string;
      alternatives: AlternativeTrace[];
    }
  | {
      accepted: false;
      code: RejectionCode;
      reason: string;
      alternatives: AlternativeTrace[];
    };

/** Confidence is frequently null (many Web Speech implementations only populate it inconsistently) — treated as neutral (0.5) rather than penalized, since absence of a confidence score is not evidence of a bad transcript. */
const NEUTRAL_CONFIDENCE = 0.5;

/** How much a fully explicit target (vs. relying on whatever's currently active) is worth — see TranscriptClassification.hasExplicitTarget. Deliberately larger than a typical single-step confidence delta, so "dealer king" (explicit) reliably outscores a same-confidence bare "king" from a DIFFERENT alternative that happens to disagree on target. */
const EXPLICIT_TARGET_BONUS = 5;

/** Reward per OTHER valid alternative that independently produced the identical resulting action — corroboration across alternatives is real evidence, not noise. */
const AGREEMENT_BONUS_PER_MATCH = 3;

/** A later-ranked alternative that still parses cleanly is exactly as valid as ALT #1 — ASR rank alone is not trusted (that trust is the bug this module fixes) — but ties are broken in the engine's own preferred order via a small nudge, never enough to overcome an explicit-target or agreement bonus. */
const RANK_TIEBREAK_WEIGHT = 0.1;

/** The minimum score gap required to prefer a higher-scored alternative over a genuinely different, also-valid alternative, rather than refusing to guess. Roughly one explicit-target bonus, or a ~40-point confidence gap — big enough that it reflects real structural evidence, not ASR jitter. */
const DECISIVE_MARGIN = EXPLICIT_TARGET_BONUS;

function baseScore(classification: TranscriptClassification, confidence: number | null, index: number): number {
  if (!classification.valid) return -Infinity;
  let score = 100;
  score += (confidence ?? NEUTRAL_CONFIDENCE) * 20; // 0..20
  if (classification.hasExplicitTarget) score += EXPLICIT_TARGET_BONUS;
  score += Math.max(0, 10 - index) * RANK_TIEBREAK_WEIGHT;
  return score;
}

/**
 * The winner-selection algorithm, applied AFTER every alternative has been
 * independently classified and base-scored:
 *
 *  0 valid alternatives  -> reject. If any alternative was rejected
 *                           specifically for uncertainty language ("maybe
 *                           player one has a three"), that code wins
 *                           regardless of other alternatives' codes — see
 *                           containsUncertaintyLanguage's own doc comment on
 *                           why this is an unconditional hard rule, never
 *                           merely one signal among several. Otherwise
 *                           NO_VALID_ALTERNATIVE.
 *  1 valid alternative   -> that one wins outright. (This is the fix: it
 *                           wins regardless of WHICH index it came from —
 *                           previously, only index 0 was ever even tried.)
 *  2+ valid alternatives -> grouped by actionKey (see
 *                           classifyVoiceTranscript's own doc comment).
 *                           Every valid alternative that agrees with at
 *                           least one other gets AGREEMENT_BONUS_PER_MATCH
 *                           added per agreeing peer, then the highest total
 *                           score wins. If the valid alternatives do NOT all
 *                           collapse into one agreeing group, the top two
 *                           scores are compared: a gap of at least
 *                           DECISIVE_MARGIN is treated as a real structural
 *                           reason to prefer one (explicit target beats
 *                           none, or a large confidence gap) and that
 *                           alternative wins; anything closer is refused
 *                           outright (CONFLICTING_ALTERNATIVES, or
 *                           MULTIPLE_VALID_CONFLICTS once 3+ distinct valid
 *                           actions are in play) rather than guessed.
 */
export function resolveAlternatives(
  alternatives: { transcript: string; confidence: number | null }[]
): ResolveResult {
  const traces: AlternativeTrace[] = alternatives.map((alt, index) => {
    const classification = classifyVoiceTranscript(alt.transcript);
    return {
      index,
      transcript: alt.transcript,
      confidence: alt.confidence,
      classification,
      score: baseScore(classification, alt.confidence, index),
    };
  });

  const validTraces = traces.filter((t) => t.classification.valid);

  if (validTraces.length === 0) {
    const uncertain = traces.find((t) => !t.classification.valid && t.classification.code === "UNCERTAIN_LANGUAGE");
    if (uncertain) {
      return { accepted: false, code: "UNCERTAIN_LANGUAGE", reason: uncertain.classification.valid ? "" : uncertain.classification.reason, alternatives: traces };
    }
    return {
      accepted: false,
      code: "NO_VALID_ALTERNATIVE",
      reason: `None of ${traces.length} alternative(s) produced a valid command.`,
      alternatives: traces,
    };
  }

  // Group by actionKey to find agreement.
  const byActionKey = new Map<string, AlternativeTrace[]>();
  for (const t of validTraces) {
    const key = t.classification.valid ? t.classification.actionKey : "";
    const group = byActionKey.get(key) ?? [];
    group.push(t);
    byActionKey.set(key, group);
  }

  // Apply agreement bonus.
  for (const group of byActionKey.values()) {
    if (group.length > 1) {
      for (const t of group) t.score += AGREEMENT_BONUS_PER_MATCH * (group.length - 1);
    }
  }

  if (byActionKey.size === 1) {
    const group = [...byActionKey.values()][0];
    const winner = group.reduce((best, t) => (t.score > best.score ? t : best));
    const reason =
      group.length === 1
        ? "Only valid alternative."
        : `${group.length} alternatives independently agreed on the same action.`;
    return { accepted: true, winnerIndex: winner.index, reason, alternatives: traces };
  }

  // Genuine conflict: 2+ distinct valid actions proposed.
  const ranked = [...validTraces].sort((a, b) => b.score - a.score);
  const [top, second] = ranked;
  const margin = top.score - second.score;
  if (margin >= DECISIVE_MARGIN) {
    return {
      accepted: true,
      winnerIndex: top.index,
      reason: `Resolved a conflict between ${byActionKey.size} distinct valid actions by a decisive scoring margin (+${margin.toFixed(1)}).`,
      alternatives: traces,
    };
  }

  const code: RejectionCode = byActionKey.size > 2 ? "MULTIPLE_VALID_CONFLICTS" : "CONFLICTING_ALTERNATIVES";
  return {
    accepted: false,
    code,
    reason: `${byActionKey.size} alternatives produced different valid actions with no decisive margin (top-two gap ${margin.toFixed(1)}).`,
    alternatives: traces,
  };
}

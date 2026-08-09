/**
 * Natural hand narration — a segmentation/validation layer BUILT ON TOP OF
 * (never replacing) the single-command parser in parseVoiceCommand.ts. That
 * file still exists, is still exported, and still handles every single-
 * command transcript exactly as before; this file adds the ability to turn
 * ONE longer recognized utterance ("dealer king ace seat one five three
 * seven") into an ORDERED SEQUENCE of the same primitive operations a
 * single command already produces (select a target, enter a card, run a
 * workflow action) — never a second counting engine, never a parallel
 * ledger, never an LLM. Every card this module ever proposes still becomes
 * exactly one ordinary CardEvent through the exact same production
 * addCard/resolveCardEntryTarget path VoiceControl.tsx already uses for a
 * single spoken card.
 *
 * ARCHITECTURE: this module is a pure function of the transcript text
 * alone — it has no access to (and makes no assumptions about) live
 * investigation state, the currently active target, or seat occupancy.
 * That is deliberate: the safety property this module exists to prove
 * ("did this utterance unambiguously describe structured game events, or
 * could it be observation/conversation?") must never depend on what
 * happens to be true in the app at the moment the words were spoken.
 * Resolving an unscoped card against "whatever is currently active," and
 * checking whether a specific seat is actually enabled right now, are both
 * live-state concerns and stay entirely in VoiceControl.tsx's commit step,
 * exactly where the single-command path already does the same thing.
 *
 * TRANSACTIONAL BY CONSTRUCTION: `parseNarration` never returns a partial
 * result. It either returns every operation the WHOLE utterance implies
 * (`{ kind: "ops", ops }`), or it rejects the entire utterance
 * (`{ kind: "reject" }`) with zero operations — there is no code path that
 * returns "the first half was fine." "No opinion" (`{ kind: "no-opinion"
 * }`) is a third, distinct outcome: it means this utterance contained NONE
 * of narration's recognized vocabulary at all (e.g. "count", "status", a
 * note-mode phrase, or a single already-well-handled legacy command word),
 * so the caller should fall back to `parseVoiceCommand` instead of treating
 * it as a narration failure.
 */
import {
  FACE_CARD_DISPLAY,
  MAX_NOISE_TOKENS,
  NOISE_FILLER_WORDS,
  RANK_WORDS,
  SEAT_NUMBER_BY_WORD,
  SEAT_PREFIX_WORDS,
  seatFromCToken,
  type VoiceRank,
  type VoiceTarget,
} from "./parseVoiceCommand";
import { normalizeTranscript } from "./normalizeTranscript";

export type NarrationOp =
  /** A target word was spoken — updates which target subsequent cards belong to, and (at commit time) the app's own active-target selection, exactly like speaking "seat two" alone already does. */
  | { kind: "selectTarget"; target: VoiceTarget }
  /**
   * `target` is present whenever a target was established anywhere earlier
   * in THIS utterance; absent only for a card spoken before any target was
   * ever mentioned, which the commit step resolves against whatever is
   * currently active — the exact same "no target" convention
   * parseVoiceCommand's own `card` command already uses.
   */
  | { kind: "card"; target?: VoiceTarget; rank: VoiceRank; displayRank?: "J" | "Q" | "K" }
  | { kind: "workflow"; action: "done" | "next" | "undo" };

export type NarrationResult =
  | { kind: "ops"; ops: NarrationOp[] }
  /** Recognized SOME narration vocabulary but the utterance as a whole is unsafe/ambiguous — reject outright, never fall back to the single-command parser for this same text. */
  | { kind: "reject" }
  /** Recognized NONE of narration's vocabulary at all — defer to parseVoiceCommand, which may still recognize it (e.g. "count", "status", "next seat"). */
  | { kind: "no-opinion" };

/**
 * Recognized action vocabulary with NO effect on the ledger this milestone.
 * "hit" and "stand" are permanently inert by production design — see
 * PlayerActionsRow.tsx's own comment: "There is no Hit/Stand/BJ: another
 * card entered is an implicit hit, ending entry is an implicit stand."
 * There is no discrete production action for either to invoke; the
 * following card (for "hit") or the mere absence of one (for "stand") is
 * already the complete, correct representation. "double"/"split"/
 * "surrender"/"insurance" DO have real production actions
 * (PlayerActionsRow's handleDouble/handleSplit/handleSurrender/
 * handleInsurance), but wiring narration to trigger them is deliberately
 * OUT OF SCOPE for this milestone (see docs/EYEONPIT_PRODUCT_SPEC.md and
 * the narration report) — recognizing them here only keeps them from
 * being misclassified as noise (and therefore from ever tripping the
 * noise-based rejection threshold on an otherwise-valid narration), it
 * does not yet mutate anything.
 */
const INERT_ACTION_WORDS = new Set(["hit", "stand", "double", "split", "surrender", "insurance"]);

const SINGLE_WORD_WORKFLOW: Record<string, "done" | "next" | "undo"> = {
  done: "done",
  next: "next",
  undo: "undo",
};

/**
 * Collapses immediately-adjacent identical tokens ("king king king" ->
 * "king") BEFORE any segmentation happens — reinforcing, not replacing,
 * the exact same ASR-stutter protection parseVoiceCommand.ts's
 * extractFromNoisyTokens already relies on. This runs unconditionally,
 * scoped or not, so a stuttered target-scoped repeat ("dealer king king")
 * still collapses to one king rather than being (mis)read as two kings
 * dealt. It only ever collapses literally-repeated whole tokens; two
 * DIFFERENT spoken words are never touched by this step, no matter how
 * close together or how many times a genuinely different rank recurs
 * later in the utterance.
 */
function dedupeAdjacentRepeats(tokens: string[]): string[] {
  const result: string[] = [];
  for (const token of tokens) {
    if (result[result.length - 1] !== token) result.push(token);
  }
  return result;
}

/**
 * Deterministically splits a compact digit run (a single token like "537"
 * or "85" — a recognizer artifact already captured live, where several
 * spoken digits arrive concatenated with no spaces) into individual card
 * ranks. "10" is matched as a two-character unit FIRST, greedily, at every
 * position — the only rule needed to guarantee "10" is never split into
 * "1" + "0": a lone "1" not immediately followed by "0", or any orphaned
 * "0", makes the whole stream undecomposable and this returns null. There
 * is exactly one way to read any string this returns non-null for; if more
 * than one reading were possible this function would not have a "the
 * greedy match wins" rule sitting between them — it wouldn't need one,
 * because "10" vs. "1" is the only overlap in the rank vocabulary at all
 * (2-9 each own a single, non-overlapping digit).
 */
export function decomposeNumericStream(token: string): VoiceRank[] | null {
  const ranks: VoiceRank[] = [];
  let i = 0;
  while (i < token.length) {
    if (token.slice(i, i + 2) === "10") {
      ranks.push("10");
      i += 2;
      continue;
    }
    const digit = token[i];
    if (digit >= "2" && digit <= "9") {
      ranks.push(digit as VoiceRank);
      i += 1;
      continue;
    }
    return null; // an orphaned "1" (not part of "10") or "0" — never guess which card that was meant to be
  }
  return ranks.length > 0 ? ranks : null;
}

const COMPACT_DIGIT_STREAM_RE = /^[0-9]{2,}$/;

function targetsEqual(a: VoiceTarget, b: VoiceTarget): boolean {
  if (a.kind === "dealer" && b.kind === "dealer") return true;
  return a.kind === "seat" && b.kind === "seat" && a.seat === b.seat;
}

/**
 * True when `ops` is EXACTLY a shape parseVoiceCommand's own single-command
 * grammar already produces and dispatches identically today: a bare single
 * card with no target ("king"), a bare workflow word ("done"/"next"/
 * "undo"), or one target plus exactly one card for it in the same
 * utterance ("dealer king", "seat three ace", "C1 ace"). For all of these,
 * narration returns "no-opinion" (see the end of parseNarration below) so
 * the ALREADY well-tested legacy path keeps producing its own exact
 * confirmation wording and dispatch — narration only ever "wins" for
 * genuinely new capability (2+ cards under one target, multiple targets,
 * compact numeric decomposition, a multi-clause narration) that the
 * single-command grammar could never represent, either because it would
 * reject it as ambiguous or because it has no vocabulary for it at all.
 *
 * A bare target selection ("seat one", "dealer", "C1") is deliberately NOT
 * included here even though the legacy grammar also has an exact-phrase
 * path for it — that path only matches the WHOLE transcript being exactly
 * the target phrase. "seat two stand" (an established target followed by a
 * recognized-but-inert action word) parses to this exact same one-op
 * shape, but legacy's noisy-token fallback has no "target only, no card"
 * success case at all and would reject it outright. `sawOnlyBareTarget`
 * distinguishes the two: true only when literally nothing besides the
 * target phrase itself was in the transcript, which is the one case
 * deferring is actually safe. When it isn't, `commitNarration` handles a
 * lone `selectTarget` op directly instead (see VoiceControl.tsx).
 */
function isTrivialLegacyEquivalent(ops: NarrationOp[], sawOnlyBareTarget: boolean): boolean {
  if (ops.length === 1) {
    const [op] = ops;
    if (op.kind === "selectTarget") return sawOnlyBareTarget;
    return op.kind === "workflow" || (op.kind === "card" && !op.target);
  }
  if (ops.length === 2) {
    const [first, second] = ops;
    return (
      first.kind === "selectTarget" &&
      second.kind === "card" &&
      second.target != null &&
      targetsEqual(first.target, second.target)
    );
  }
  return false;
}

/**
 * The narration segmentation/validation engine. See the module doc comment
 * for the overall architecture and the transactional guarantee. Reads
 * left to right exactly once, building one proposed ordered `ops` list;
 * every rejection path returns `{ kind: "reject" }` with that list
 * discarded, never a truncated prefix of it.
 */
export function parseNarration(rawTranscript: string): NarrationResult {
  const normalized = normalizeTranscript(rawTranscript);
  const tokens = dedupeAdjacentRepeats(normalized.split(" ").filter(Boolean));
  if (tokens.length === 0) return { kind: "no-opinion" };

  const ops: NarrationOp[] = [];
  let currentTarget: VoiceTarget | undefined;
  let noiseTokens = 0;
  let recognizedAnything = false;
  // See isTrivialLegacyEquivalent's doc comment — an inert action word
  // ("stand", "double", ...) after a bare target changes nothing about
  // WHAT gets committed, but it does mean the transcript is no longer
  // exactly the bare target phrase legacy's own exact-match path requires,
  // so deferring to legacy would be unsafe (it has no "target only, no
  // card" success case in its noisy fallback).
  let sawInertWord = false;
  // Tracks distinct ranks spoken before any target was ever established in
  // this utterance — the one place the OLD "two distinct cards, no target
  // -> ambiguous, reject" rule still applies exactly as it always has (see
  // §4: "an unscoped 'King Ace' may remain rejected"). Once a target
  // exists, every subsequent rank is unambiguous BY CONSTRUCTION (it
  // belongs to that target), so this set is never consulted again.
  const unscopedDistinctRanks = new Set<VoiceRank>();

  function pushCard(rank: VoiceRank, sourceWord: string): void {
    const displayRank = FACE_CARD_DISPLAY[sourceWord];
    ops.push({
      kind: "card",
      rank,
      ...(currentTarget ? { target: currentTarget } : {}),
      ...(displayRank ? { displayRank } : {}),
    });
    if (!currentTarget) unscopedDistinctRanks.add(rank);
  }

  function setTarget(target: VoiceTarget): void {
    // A repeated mention of the SAME target ("dealer ... dealer king") is
    // not a second establishment — just keep going; only a genuinely
    // different target ends the previous one's scope early.
    if (currentTarget && targetsEqual(currentTarget, target)) return;
    currentTarget = target;
    ops.push({ kind: "selectTarget", target });
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // "new hand" — a two-token natural alias for the exact same "next"
    // round-control action bare "next" already dispatches (handleNext in
    // useRoundControls) — see the module doc comment; no new round-advance
    // behavior is introduced here.
    if (token === "new" && tokens[i + 1] === "hand") {
      recognizedAnything = true;
      ops.push({ kind: "workflow", action: "next" });
      currentTarget = undefined; // a workflow boundary ends the previous target's scope — see §3
      i += 1;
      continue;
    }

    if (token in SINGLE_WORD_WORKFLOW) {
      recognizedAnything = true;
      ops.push({ kind: "workflow", action: SINGLE_WORD_WORKFLOW[token] });
      currentTarget = undefined;
      continue;
    }

    if (token === "dealer") {
      recognizedAnything = true;
      setTarget({ kind: "dealer" });
      continue;
    }

    if (SEAT_PREFIX_WORDS.includes(token)) {
      if (i + 1 >= tokens.length) {
        // A trailing seat-prefix word with nothing after it ("...next
        // seat") can't attempt a seat number at all — ordinary stray token,
        // not a structural failure (matches parseVoiceCommand's own "next
        // seat" alias tolerance).
        noiseTokens += 1;
        continue;
      }
      const seat = SEAT_NUMBER_BY_WORD[tokens[i + 1]];
      if (seat == null) {
        // Same rule as parseVoiceCommand's extractFromNoisyTokens: a
        // target-trigger word immediately followed by something that is
        // NOT a valid seat number is strong evidence of ordinary sentence
        // structure ("player bet ace", "seat three raised his bet"), not a
        // mangled seat attempt — reject the WHOLE narration outright,
        // never hunt further. Covers "seat 135" (§10) and "seat eight"
        // identically: neither is ever reinterpreted as a bare card.
        return { kind: "reject" };
      }
      recognizedAnything = true;
      setTarget({ kind: "seat", seat });
      i += 1;
      continue;
    }

    const cSeat = seatFromCToken(token);
    if (cSeat != null) {
      recognizedAnything = true;
      setTarget({ kind: "seat", seat: cSeat });
      continue;
    }

    if (INERT_ACTION_WORDS.has(token)) {
      recognizedAnything = true; // valid narration vocabulary — never counted as noise, even though it produces no op (see INERT_ACTION_WORDS doc comment)
      sawInertWord = true;
      continue;
    }

    if (NOISE_FILLER_WORDS.has(token)) continue;

    if (token in RANK_WORDS) {
      recognizedAnything = true;
      pushCard(RANK_WORDS[token], token);
      continue;
    }

    if (COMPACT_DIGIT_STREAM_RE.test(token)) {
      recognizedAnything = true;
      const decomposed = decomposeNumericStream(token);
      if (!decomposed) return { kind: "reject" }; // undecomposable digit run — never guess which cards were meant (§2)
      if (!currentTarget && decomposed.length > 1) {
        // An unscoped compact stream inherently proposes 2+ cards with no
        // established target to receive them — exactly the ambiguity §4
        // says may stay rejected ("an unscoped 'King Ace' may remain
        // rejected"), just arriving as one token instead of two words.
        return { kind: "reject" };
      }
      for (const rank of decomposed) pushCard(rank, rank);
      continue;
    }

    noiseTokens += 1;
  }

  if (!recognizedAnything) return { kind: "no-opinion" };
  if (noiseTokens > MAX_NOISE_TOKENS) return { kind: "reject" };
  if (unscopedDistinctRanks.size > 1) return { kind: "reject" };

  // A bare, unscoped card ("5") with ANY surrounding unrecognized word
  // ("Team 5") must never become a CardEvent — not via narration itself,
  // and critically not by deferring to legacy either. parseVoiceCommand's
  // own extractFromNoisyTokens independently tolerates exactly this shape
  // (up to MAX_NOISE_TOKENS around a single rank) because that tolerance
  // was built for a misheard proper noun alongside a real command
  // ("Taylor king"). A real captured transcript ("Team 5") proved that
  // tolerance indistinguishable, at the token level, from ordinary
  // conversation that merely contains a number — "team" and "Taylor" look
  // identical to this grammar. Per the explicit safety requirement, this
  // ambiguity must resolve to REJECT, not to a guess: a bare card is only
  // ever safe to defer to legacy when the ENTIRE utterance was clean (zero
  // noise), which is also the only shape a genuinely clean "5"/"five"/
  // "king" utterance ever produces. This is deliberately narrower than
  // MAX_NOISE_TOKENS — that cap still governs multi-op narration (a target
  // was explicitly resolved there, which is not the ambiguous case this
  // guards against).
  if (ops.length === 1 && ops[0].kind === "card" && !ops[0].target && noiseTokens > 0) {
    return { kind: "reject" };
  }

  const sawOnlyBareTarget = ops.length === 1 && ops[0].kind === "selectTarget" && !sawInertWord;
  if (isTrivialLegacyEquivalent(ops, sawOnlyBareTarget)) return { kind: "no-opinion" };

  return { kind: "ops", ops };
}

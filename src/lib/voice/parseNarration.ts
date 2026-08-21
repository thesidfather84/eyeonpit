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
  containsTimeOrFractionPattern,
  containsUncertaintyLanguage,
  matchSeatTargetPhrase,
  normalizeAsrSeatArtifacts,
  seatFromLetterToken,
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
const INERT_ACTION_WORDS = new Set([
  "hit",
  "stand",
  "double",
  "split",
  "surrender",
  "insurance",
  // PC Field Test #2 — natural third-person narration ("spot one stands",
  // "spot three hits") uses the inflected verb form, not the imperative
  // ("stand"/"hit") this set originally only covered. Same permanently-
  // inert semantics either way — see this set's own doc comment above;
  // adding the inflected forms recognizes more of the SAME vocabulary, it
  // does not add any new mutation.
  "stands",
  "hits",
  "doubles",
  "splits",
  "surrenders",
]);

/**
 * "Active seat one." / "Seat one active." — a natural way to say "make
 * this the active target," recognized exactly like INERT_ACTION_WORDS:
 * valid narration vocabulary that produces no op of its own (the
 * `selectTarget` op the seat word itself produces already does the work)
 * and never counts as noise. Deliberately its own tiny set rather than
 * folded into NOISE_FILLER_WORDS (which is unconditional everywhere,
 * including legacy's shared noisy-token fallback) — "active" only means
 * anything in the context of a target word, so it stays scoped to
 * narration's own vocabulary, exactly like "hit"/"stand" already are.
 */
const TARGET_ACTIVATION_WORDS = new Set(["active"]);

/**
 * Natural hand-connector grammar ("dealer HAS a king AND an ace", "spot 3
 * has a 5 AND a 7") — inert filler, exactly like INERT_ACTION_WORDS, that
 * never produces an op and never counts as noise. "a"/"an" already fall
 * through to the pre-existing, unconditional NOISE_FILLER_WORDS check
 * below (they were always swallowed everywhere, target or not), so they
 * are deliberately NOT listed here — only the connector words that are
 * NOT already universally safe to ignore need this narrower, context-
 * gated set.
 *
 * SAFETY: recognized ONLY once a target has actually been established
 * (`currentTarget` is set) — see the two call sites below. Ordinary
 * conversation ("that guy HAS a king tattoo") never establishes a target,
 * so "has" there still counts as an ordinary noise token exactly as
 * before, keeping it well over MAX_NOISE_TOKENS and rejected. Gating on
 * target-context, rather than swallowing these words unconditionally, is
 * what keeps this from silently reopening the noise tolerance the "Team
 * 5" fix closed.
 *
 * "as" (voice reliability spec §2/§16 — real captured PC-field ASR
 * misreading of "has", e.g. "spot 2 as a king") is included under the
 * EXACT same target-gated safety rule as every other word here: it is only
 * ever swallowed once a real target has already been established via
 * dealer/seat/spot/player vocabulary, so ordinary conversation using "as"
 * for its normal meaning ("I saw him as a kid") never establishes a target
 * in the first place and "as" there still counts as an ordinary noise
 * token exactly as before.
 *
 * "in" (PC Field Test #2 — real captured "has a 10 in a 3", Chrome's own
 * misreading of "and") is included under the identical target-gated rule —
 * only ever swallowed once a real target already exists, so "the count was
 * in the negative" (no target established) still counts "in" as ordinary
 * noise exactly as before.
 */
const HAND_CONNECTOR_WORDS = new Set(["has", "as", "and", "with", "gets", "got", "shows", "in"]);

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
 *
 * `opts.allowUnscopedContinuation` (PC Field Test #2, default false) is the
 * ONE deliberate, explicit exception to this module's "pure function of the
 * transcript text alone" rule — see the module doc comment. It does not let
 * the caller change WHAT a transcript means; it only tells this function
 * "a live active target genuinely exists right now," which is what makes it
 * safe to recognize target-omitted continuation narration ("has a ten and a
 * three," said with Spot 1 already active) as structured hand narration
 * rather than rejecting it outright. This is an explicit, caller-supplied
 * input — exactly like `allowDealerConfusionRecovery` on
 * classifyVoiceTranscript.ts — never an implicit read of global state, so
 * the function remains fully deterministic given its complete inputs. Every
 * unscoped card this produces still resolves against whatever the live
 * active target actually is, and is still rejected at COMMIT time
 * (resolveCardEntryTarget) if that target turns out not to be usable —
 * this flag only ever affects whether the PARSE is attempted, never
 * whether the eventual commit is safe.
 */
export function parseNarration(rawTranscript: string, opts?: { allowUnscopedContinuation?: boolean }): NarrationResult {
  const allowUnscopedContinuation = opts?.allowUnscopedContinuation ?? false;
  const hasTimeOrFractionPattern = containsTimeOrFractionPattern(rawTranscript);
  const normalized = normalizeAsrSeatArtifacts(normalizeTranscript(rawTranscript));
  const tokens = dedupeAdjacentRepeats(normalized.split(" ").filter(Boolean));
  if (tokens.length === 0) return { kind: "no-opinion" };

  // SAFETY: an immediate, unconditional hard rejection — see
  // containsUncertaintyLanguage's own doc comment for why this must never
  // be merely counted against the ordinary noise-token cap. Checked before
  // any op is built, so "maybe player one has a three and a five" (which
  // would otherwise pass narration's own noise threshold at exactly one
  // stray word) can never slip through by virtue of narration returning
  // its own `ops` directly instead of deferring to legacy.
  if (containsUncertaintyLanguage(tokens)) return { kind: "reject" };

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
  // True once a hand-connector word was swallowed specifically BECAUSE
  // `allowUnscopedContinuation` is on and no target has been named in this
  // utterance yet — real evidence of intentional hand-narration structure
  // ("has a ten and a three"), as opposed to two bare adjacent card words
  // with no connecting grammar at all ("king ace"). Only THIS signal, never
  // `allowUnscopedContinuation` alone, is allowed to relax the "2+ distinct
  // unscoped ranks is ambiguous" rule below — see that check's own comment.
  let sawUnscopedConnector = false;
  // True once ANY target in this utterance was established through a form
  // the legacy single-command parser has NO equivalent understanding of —
  // the leading-seat-number shorthand ("three has a ten") or an extended
  // seat phrase via matchSeatTargetPhrase ("the player in seat one",
  // "player at spot one"). isTrivialLegacyEquivalent's whole premise is
  // "legacy would independently reparse this exact string and reach the
  // identical result" — that premise is FALSE for these forms (legacy has
  // no shorthand grammar and no connector/second-prefix grammar at all), so
  // deferring would silently hand a transcript legacy cannot actually
  // parse back to legacy, which is exactly how "three has a ten" and "the
  // player in seat one has a seven" were previously lost. See the two call
  // sites below and the final gating check near the end of this function.
  let sawNonLegacyTargetForm = false;
  // PC Field Test #2 real-mic finding — the GENERAL fix, not a special case
  // for any one word: counts every token consumed as INERT_ACTION_WORDS,
  // TARGET_ACTIVATION_WORDS, or a target-gated HAND_CONNECTOR_WORDS match —
  // i.e. every word narration itself understands but that legacy's own
  // noisy-token fallback (extractFromNoisyTokens, parseVoiceCommand.ts) has
  // NO vocabulary for at all and would count as an ordinary unrecognized
  // stray word. isTrivialLegacyEquivalent's op-shape check only asks "does
  // this LOOK like something legacy could produce" — it never asks "would
  // legacy's own MAX_NOISE_TOKENS(1) budget actually accept this specific
  // text." "spot 3 hits gets a 4" has an op-shape legacy could produce
  // (target + one card) but consumes TWO narration-only words ("hits",
  // "gets") along the way — deferring hands legacy a string its own 1-word
  // tolerance was always going to reject. Compared against MAX_NOISE_TOKENS
  // directly (not a second, arbitrary threshold) at the final gating check
  // below, so deferral is refused precisely when — and only when — legacy's
  // own tolerance would genuinely be insufficient, independent of which
  // specific word(s) pushed it over.
  let narrationOnlyFillerCount = 0;
  // PC Field Test #2, real mic Gate #2 finding — true only for the token
  // truly at the START of a fresh clause: the very first token of the
  // whole utterance, or the token immediately after a workflow-boundary
  // word resets `currentTarget`. The leading-seat-shorthand rule below
  // ("three has a ten" -> Seat 3) must ONLY fire here — its own premise is
  // "this number is naming a NEW target, not continuing an existing
  // narration" — which is false the moment a connector word has ALREADY
  // been consumed earlier in this same utterance (see the real captured
  // bug: "has a 5 and a 3", where "5" sits AFTER "has" was already
  // swallowed as a continuation connector, not at the true start of the
  // utterance — yet the un-gated shorthand rule matched it anyway,
  // reinterpreting a plain unscoped card as a brand-new Spot 5 target).
  let atClauseStart = true;
  // PC Field Test #2, real mic Gate #2 finding — true from the moment a
  // hand-connector word (has/and/with/gets/got/shows/in) is consumed until
  // either a card follows it (cleared by pushCard below) or the utterance
  // ends. A connector word grammatically PROMISES a card is coming — unlike
  // an inert action word ("stand"), which is a complete statement on its
  // own — so an utterance that ends with this still true ("player five has
  // a", "spot five hits gets a") is an INCOMPLETE card-entry construction,
  // never a legitimate bare target-selection, no matter how the shape
  // otherwise looks. Checked as an unconditional hard rejection near the
  // end of this function, exactly like containsUncertaintyLanguage.
  let sawUnresolvedConnector = false;
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
    sawUnresolvedConnector = false;
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
    // See `atClauseStart`'s own doc comment. Captured once per token, then
    // reset to false by default — the three workflow branches immediately
    // below explicitly set it back to true (alongside their existing
    // `currentTarget = undefined`), since a workflow boundary is exactly
    // the other place a fresh clause legitimately begins.
    const isClauseStart = atClauseStart;
    atClauseStart = false;

    // "new hand" — a two-token natural alias for the exact same "next"
    // round-control action bare "next" already dispatches (handleNext in
    // useRoundControls) — see the module doc comment; no new round-advance
    // behavior is introduced here.
    if (token === "new" && tokens[i + 1] === "hand") {
      recognizedAnything = true;
      ops.push({ kind: "workflow", action: "next" });
      currentTarget = undefined; // a workflow boundary ends the previous target's scope — see §3
      atClauseStart = true;
      i += 1;
      continue;
    }

    // "next hand" — a DIFFERENT two-token phrase from "new hand" above,
    // aliasing the OPPOSITE existing command ("done") — see
    // parseVoiceCommand.ts's WORKFLOW_WORDS doc comment for the product
    // rationale (an operator narrating "next hand" is describing finishing
    // the one they're on, which is exactly what Done already does).
    if (token === "next" && tokens[i + 1] === "hand") {
      recognizedAnything = true;
      ops.push({ kind: "workflow", action: "done" });
      currentTarget = undefined;
      atClauseStart = true;
      i += 1;
      continue;
    }

    if (token in SINGLE_WORD_WORKFLOW) {
      recognizedAnything = true;
      ops.push({ kind: "workflow", action: SINGLE_WORD_WORKFLOW[token] });
      currentTarget = undefined;
      atClauseStart = true;
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
      // matchSeatTargetPhrase recognizes both the original direct form
      // ("seat one") and the natural connector/second-prefix forms
      // ("the player in seat one", "player at spot one", "player seat
      // one") — see its own doc comment. A null result here means the
      // same thing it always has: a target-trigger word immediately
      // followed by something that resolves to none of those forms is
      // strong evidence of ordinary sentence structure ("player bet ace",
      // "seat three raised his bet"), not a mangled seat attempt — reject
      // the WHOLE narration outright, never hunt further. Covers "seat
      // 135" (§10) and "seat eight" identically: neither is ever
      // reinterpreted as a bare card.
      const match = matchSeatTargetPhrase(tokens, i);
      if (!match) return { kind: "reject" };
      recognizedAnything = true;
      if (match.extended) sawNonLegacyTargetForm = true;
      setTarget({ kind: "seat", seat: match.seat });
      i += match.tokensConsumed;
      continue;
    }

    const letterSeat = seatFromLetterToken(token);
    if (letterSeat != null) {
      recognizedAnything = true;
      setTarget({ kind: "seat", seat: letterSeat });
      continue;
    }

    // Natural leading-seat shorthand ("one has king ace", "2 has 5 7") — a
    // bare seat-number word/digit (1-7) at the START of a clause (no
    // target established yet), IMMEDIATELY followed by a recognized hand
    // connector, unambiguously opens that seat as the target. This is
    // deliberately narrow: "one"/"two".../"seven" are ALSO card-rank words
    // (RANK_WORDS), so without the connector lookahead a bare number is
    // always just a card, exactly as before — "I have one five three
    // seven" or "the score was five to one" never hits this branch because
    // the very next token isn't a connector. Only fires when no target is
    // active (`!currentTarget`) AND this token is truly at the start of a
    // fresh clause (`isClauseStart` — see its own doc comment, added after
    // a real captured bug: "has a 5 and a 3" was misreading its SECOND
    // number, "5", as a brand-new Seat 5 shorthand, purely because
    // `currentTarget` happened to still be unset — even though "5" sits
    // well after "has" was already consumed as a continuation connector,
    // nowhere near the true start of the utterance).
    //
    // SAFETY (2026-08-20, real Sherpa-ONNX A/B/C mic session — "FIVE IN THE
    // THREE" false SEAT5:3): the lookahead used to accept ANY of
    // HAND_CONNECTOR_WORDS here, including "in" and "as" — but those two
    // are documented ELSEWHERE IN THIS FILE (see HAND_CONNECTOR_WORDS's own
    // doc comment) as ASR-MISRECOGNITION-RECOVERY ALIASES ONLY ("in" for a
    // misheard "and", "as" for a misheard "has") — no operator ever
    // deliberately opens a fresh seat-claim by saying "five in..." or "five
    // as...". A real captured Sherpa transcript of "Has a five and a three"
    // (an ordinary target-omitted CONTINUATION utterance — no seat named at
    // all) came back as "five in the three": the recognizer dropped the
    // true leading "has a" and misheard "and" as "in", leaving a bare
    // number immediately followed by "in" — which this branch then
    // (wrongly) read as deterministic evidence of a NEW "Seat 5" claim,
    // producing a false `SEAT5:3` CardEvent from a phrase that never named
    // any seat. Restricting the trigger word to exactly "has" — the ONLY
    // connector any existing shorthand test/real transcript ever actually
    // exercises in this leading position — removes that false-positive
    // class (and the identical risk from "and"/"with"/"gets"/"got"/"shows"
    // dropping the same leading "has a") without weakening anything real:
    // every existing shorthand phrase ("three has a ten", "2 has 5 7", "one
    // has a king and an ace") already uses "has" here. This is generic
    // parser logic — it applies identically regardless of which
    // SpeechProvider (Browser Web Speech or Sherpa-ONNX) produced the
    // transcript; it is not a Sherpa-specific gate. "in"/"as"/"and" etc.
    // remain fully recognized as CONTINUATION connectors once a target is
    // already established or via `allowUnscopedContinuation` — only this
    // one "invent a brand-new seat target from a bare number" trigger is
    // narrowed.
    if (
      !currentTarget &&
      isClauseStart &&
      SEAT_NUMBER_BY_WORD[token] != null &&
      tokens[i + 1] === "has"
    ) {
      recognizedAnything = true;
      sawNonLegacyTargetForm = true; // legacy has no shorthand grammar at all — see the flag's own doc comment
      setTarget({ kind: "seat", seat: SEAT_NUMBER_BY_WORD[token] });
      continue;
    }

    // Hand connectors ("has", "and", "with", "gets", "got", "shows", "in")
    // are inert grammar INSIDE an already-established explicit target/
    // card-entry context — see HAND_CONNECTOR_WORDS's own doc comment for
    // why this is gated on `currentTarget` rather than unconditional.
    if (currentTarget && HAND_CONNECTOR_WORDS.has(token)) {
      narrationOnlyFillerCount += 1; // see this variable's own doc comment — legacy has no vocabulary for connector words at all
      sawUnresolvedConnector = true; // see this variable's own doc comment — cleared by the next pushCard, hard-rejected if the utterance ends before one arrives
      continue;
    }

    // PC Field Test #2 — target-omitted continuation: the SAME connector
    // words, tolerated even with no target named in THIS utterance, but
    // ONLY when the caller has confirmed a live active target genuinely
    // exists (`allowUnscopedContinuation`) — see parseNarration's own doc
    // comment on that flag. Marks `sawUnscopedConnector`, the one signal
    // allowed to relax the unscoped-ambiguity check near the end of this
    // function.
    if (!currentTarget && allowUnscopedContinuation && HAND_CONNECTOR_WORDS.has(token)) {
      sawUnscopedConnector = true;
      narrationOnlyFillerCount += 1;
      sawUnresolvedConnector = true;
      continue;
    }

    if (INERT_ACTION_WORDS.has(token)) {
      recognizedAnything = true; // valid narration vocabulary — never counted as noise, even though it produces no op (see INERT_ACTION_WORDS doc comment)
      sawInertWord = true;
      narrationOnlyFillerCount += 1;
      continue;
    }

    if (TARGET_ACTIVATION_WORDS.has(token)) {
      recognizedAnything = true; // "active seat one" / "seat one active" — see TARGET_ACTIVATION_WORDS's own doc comment
      sawInertWord = true;
      narrationOnlyFillerCount += 1;
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
      if ((!currentTarget || hasTimeOrFractionPattern) && decomposed.length > 1) {
        // An unscoped compact stream inherently proposes 2+ cards with no
        // established target to receive them — exactly the ambiguity §4
        // says may stay rejected ("an unscoped 'King Ace' may remain
        // rejected"), just arriving as one token instead of two words.
        // PC Field Test #2 (§10, numeric/time safety): even WITH a target
        // already established, a glued 2+-digit run is refused here when
        // the transcript also contains a colon/slash clock-time or
        // fraction shape ("spot 6 has a 3:55") — that punctuation is
        // strong evidence the digits are a timestamp, not two more dealt
        // ranks, so this is never decomposed into cards, guessed or not.
        return { kind: "reject" };
      }
      for (const rank of decomposed) pushCard(rank, rank);
      continue;
    }

    noiseTokens += 1;
  }

  if (!recognizedAnything) return { kind: "no-opinion" };
  // SAFETY (real captured mic-test bug): "player five has a" / "spot five
  // hits gets a" — a connector word grammatically PROMISES a following
  // card ("has A CARD", "gets A CARD"); an utterance that ends before that
  // card ever arrives is an INCOMPLETE construction, never a legitimate
  // bare target-selection, no matter how the resulting op shape otherwise
  // looks. An unconditional hard rejection — see `sawUnresolvedConnector`'s
  // own doc comment — checked BEFORE the noise cap and the trivial-defer
  // check below, so this can never accidentally defer to legacy (which
  // sometimes also rejects the same text, but not reliably — N-best
  // resolution can still pick a DIFFERENT, shorter alternative that reads
  // as a complete bare target-select on its own, e.g. "player five" said
  // as a separate ASR alternative from "player five has a").
  if (sawUnresolvedConnector) return { kind: "reject" };
  if (noiseTokens > MAX_NOISE_TOKENS) return { kind: "reject" };
  // PC Field Test #2 — relaxed ONLY when genuine connector grammar proved
  // intentional hand-narration structure (`sawUnscopedConnector`), never
  // merely because `allowUnscopedContinuation` was on: "king ace" (two bare
  // adjacent card words, no connecting grammar at all) must stay rejected
  // regardless of whether a live active target exists — see
  // `sawUnscopedConnector`'s own doc comment. A REAL captured mic session
  // additionally proved `noiseTokens === 0` must hold too: "Taylor has a
  // king and a five" (an unrelated proper-noun misreading of "dealer"
  // riding along with two connector-joined cards) was passing this check
  // with exactly one tolerated stray word ("Taylor"), producing an
  // UNSCOPED two-card action that collided with a genuine, explicit-target
  // N-best alternative ("dealer has a king and a five") and turned what
  // should have been an outright accept into a false
  // CONFLICTING_ALTERNATIVES. The ordinary 1-stray-word noise tolerance
  // elsewhere in this app was calibrated for a single misheard word next
  // to ONE command (a misheard proper noun beside a card, or beside a
  // target+card); it was never validated against a 2+-card unscoped
  // sequence, where a stray word competing for the SAME role a dealer/seat
  // confusion token would occupy is a materially different risk. This
  // relaxation now requires a genuinely clean utterance.
  if (unscopedDistinctRanks.size > 1 && !(allowUnscopedContinuation && sawUnscopedConnector && noiseTokens === 0)) {
    return { kind: "reject" };
  }

  // SAFETY (real captured field bug): "Three active seat five" must never
  // become DEALER: 3. A card pushed before ANY target was established in
  // this utterance (`op.target` absent) is, at commit time, resolved
  // against whatever the app's CURRENTLY active target happens to be —
  // frequently the dealer by default — which is exactly a guess, not a
  // resolution of what the operator meant. That guess is only safe when
  // the WHOLE utterance never mentions a target at all (a genuine bare
  // card like "five", deferred to legacy above/below); the moment this
  // same utterance goes on to establish a real target ("seat five") for a
  // LATER card, it proves the operator was using seat/spot/player/dealer
  // language, which makes silently guessing where the EARLIER card landed
  // unacceptable — reject the whole narration instead of guessing. This is
  // deliberately broader than "never guess Dealer specifically": any
  // unscoped card can only safely resolve against live active-target state
  // when nothing else in the same utterance establishes a target, full
  // stop.
  if (ops.some((op) => op.kind === "card" && !op.target) && ops.some((op) => op.kind === "selectTarget")) {
    return { kind: "reject" };
  }

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

  const sawOnlyBareTarget =
    ops.length === 1 && ops[0].kind === "selectTarget" && !sawInertWord && !sawNonLegacyTargetForm;
  // Never defer to legacy when any target in this utterance was established
  // through a form legacy has no grammar for at all (shorthand or an
  // extended connector/second-prefix phrase) — see sawNonLegacyTargetForm's
  // own doc comment. Deferring here would hand legacy a transcript it
  // cannot actually reparse, which is exactly how "three has a ten" and
  // "the player in seat one has a seven" were previously lost.
  //
  // PC Field Test #2 real-mic finding, GENERAL fix (not specific to any one
  // word — see `narrationOnlyFillerCount`'s own doc comment): also never
  // defer when this utterance leaned on MORE narration-only vocabulary than
  // legacy's own noise budget (MAX_NOISE_TOKENS) would tolerate. A single
  // connector word ("seat one has a five") still safely defers — legacy's
  // own extractFromNoisyTokens already accepts exactly that, unchanged. Two
  // or more ("spot 3 hits gets a 4" — an inert action word AND a connector)
  // would always have been rejected by legacy's stricter budget; asking the
  // identical question isTrivialLegacyEquivalent already asks structurally
  // ("could legacy produce this shape"), just answered against legacy's
  // OWN actual tolerance instead of the shape alone.
  //
  // Chrome Patch round real-mic finding — the check also now includes
  // ordinary `noiseTokens`, not narrationOnlyFillerCount alone: "player 3
  // hits of 4" has ONE narration-only word ("hits") and, separately, ONE
  // genuinely unrecognized word ("of," Chrome's own mishearing of "gets"),
  // each individually within its own 1-word budget — but legacy would see
  // BOTH as noise simultaneously (it has no vocabulary for "hits" either),
  // for a combined total of 2, over its budget. Narration's own general
  // noise cap (checked earlier, using `noiseTokens` alone) already proved
  // this exact utterance is safe to accept directly; this sum is only
  // about whether DEFERRING to legacy specifically remains safe.
  const legacyWouldAcceptTheText = noiseTokens + narrationOnlyFillerCount <= MAX_NOISE_TOKENS;
  if (!sawNonLegacyTargetForm && legacyWouldAcceptTheText && isTrivialLegacyEquivalent(ops, sawOnlyBareTarget)) {
    return { kind: "no-opinion" };
  }

  return { kind: "ops", ops };
}

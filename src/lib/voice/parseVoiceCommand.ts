import { normalizeTranscript } from "./normalizeTranscript";

export type VoiceRank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10";
export type VoiceSeat = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type VoiceTarget = { kind: "dealer" } | { kind: "seat"; seat: VoiceSeat };

export type VoiceCommandKind =
  | { kind: "select-seat"; seat: VoiceSeat }
  | { kind: "select-dealer" }
  /**
   * `rank` is always what actually gets entered — "10" for jack/queen/king,
   * identical to what CardEntryPad's own keypad produces, so counting math
   * and the stored data are unaffected either way. `displayRank` is
   * display-only: when the operator said a specific face card, it carries
   * that word ("J"/"Q"/"K") purely so the voice confirmation toast can echo
   * back what was actually heard ("Dealer: K ✓") instead of the generic
   * "10" — never written to the ledger or the round's card arrays.
   *
   * `target` is present only when the target was spoken in the *same*
   * utterance ("dealer king", "seat three ace") — see the noisy-transcript
   * extractor below. Absent, a bare card word applies to whatever target is
   * already active, exactly as before.
   */
  | { kind: "card"; rank: VoiceRank; displayRank?: "J" | "Q" | "K"; target?: VoiceTarget }
  | { kind: "done" }
  | { kind: "next" }
  | { kind: "undo" }
  /** Read-only — never mutates investigation state. See lib/voice/spokenSummary.ts and VoiceControl's dispatch. */
  | { kind: "count" }
  | { kind: "status" };

export interface ParsedVoiceCommand {
  raw: string;
  normalized: string;
  /** null means "no action" — every caller must treat an unrecognized or ambiguous transcript identically: do nothing. */
  command: VoiceCommandKind | null;
}

export const SEAT_NUMBER_BY_WORD: Record<string, VoiceSeat> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
};

/**
 * "player" is a recognized synonym for "seat" throughout — see
 * lib/terminology.ts's STANDARD dictionary ("Player Position"/"Current
 * Player"), which is exactly this app's own non-casino wording for the same
 * thing. "spot" is real casino-floor vocabulary for the same concept
 * ("spot three", "the spot two player") — captured directly from the
 * natural phrasing this app's voice input is meant to support.
 */
export const SEAT_PREFIX_WORDS = ["seat", "player", "spot"];

function buildSeatPhrases(): Record<string, VoiceSeat> {
  const phrases: Record<string, VoiceSeat> = {};
  for (const prefix of SEAT_PREFIX_WORDS) {
    for (const [word, seat] of Object.entries(SEAT_NUMBER_BY_WORD)) {
      phrases[`${prefix} ${word}`] = seat;
    }
  }
  // "C1", "C2", ... / "S1", "S2", ... / "T1", "T2", ... — recurring Web
  // Speech recognition artifacts for "seat one"/"seat two"/etc. (captured
  // directly from live diagnostics: "seat one" -> "C1"; PC-field diagnostics
  // additionally captured "S1" and "T5" — voice reliability spec §16).
  // "seat"/C/S/T are phonetically close enough that the engine collapses
  // the word and returns the number as a bare digit instead. Generalized
  // across the full 1-7 seat range for each letter rather than hardcoding
  // individual tokens — it's the same mechanical substitution for every
  // seat number, not a one-off guess — but bounded to exactly the valid
  // seat range (see seatFromLetterToken for the same bound applied inside
  // the noisy-token fallback).
  for (let seat = 1; seat <= 7; seat++) {
    phrases[`c${seat}`] = seat as VoiceSeat;
    phrases[`s${seat}`] = seat as VoiceSeat;
    phrases[`t${seat}`] = seat as VoiceSeat;
  }
  return phrases;
}

const SEAT_PHRASES: Record<string, VoiceSeat> = buildSeatPhrases();

/**
 * Natural connector words that can sit between a seat-prefix word and the
 * seat number itself — "the player IN seat one", "the player AT seat one"
 * — real captured surveillance phrasing, not computer-style "S1"/"C1"
 * shorthand. See `matchSeatTargetPhrase` below for the full grammar this
 * enables.
 */
const SEAT_PHRASE_CONNECTOR_WORDS = new Set(["in", "at"]);

/**
 * Recognizes a natural target phrase starting at `tokens[i]`, where
 * `tokens[i]` is already known to be a SEAT_PREFIX_WORD ("seat"/"player"/
 * "spot"). Operators describing a table narratively don't say "S1" — they
 * say "the player in seat one," "the player at seat one," "player at spot
 * one," or (per real captured phrasing) stack two prefix words together,
 * "player seat one." All of these mean exactly ONE thing: seat 1. This is
 * the single shared grammar for that — used by parseNarration.ts (so
 * "the player in seat one has a seven" resolves the target correctly) and
 * parseTableChangeCommand.ts (so "player seat one left the table" resolves
 * it too) — never duplicated ad hoc in either caller.
 *
 * Forms recognized, in order (tokensConsumed counts tokens AFTER `i`):
 *   1. `<prefix> <number>` — "seat one" (the original, base case)
 *   2. `<prefix> <prefix2> <number>` — "player seat one" (two prefix words
 *      stacked directly, no connector)
 *   3. `<prefix> <connector> <number>` — "player at one"
 *   4. `<prefix> <connector> <prefix2> <number>` — "the player in seat one"
 *      (after "the" is swallowed as ordinary filler), "player at spot one"
 *
 * Anything else (a prefix word followed by something that is neither a
 * valid seat number nor one of the above) returns null — never guessed,
 * never hunted further; the caller treats that exactly like today's
 * "player bet ace" rejection. `extended` is true for forms 2-4: these are
 * NEW capability the legacy single-command grammar has no equivalent for
 * (see parseNarration.ts's `sawNonLegacyTargetForm`), so a caller that
 * might otherwise defer a trivial result back to legacy must not do so
 * when `extended` is true.
 */
export function matchSeatTargetPhrase(
  tokens: string[],
  i: number
): { seat: VoiceSeat; tokensConsumed: number; extended: boolean } | null {
  const t1 = tokens[i + 1];
  if (t1 == null) return null;

  const directSeat = SEAT_NUMBER_BY_WORD[t1];
  if (directSeat != null) return { seat: directSeat, tokensConsumed: 1, extended: false };

  if (SEAT_PREFIX_WORDS.includes(t1)) {
    const seat = tokens[i + 2] != null ? SEAT_NUMBER_BY_WORD[tokens[i + 2]] : null;
    return seat != null ? { seat, tokensConsumed: 2, extended: true } : null;
  }

  if (SEAT_PHRASE_CONNECTOR_WORDS.has(t1)) {
    const t2 = tokens[i + 2];
    if (t2 == null) return null;
    const seatAfterConnector = SEAT_NUMBER_BY_WORD[t2];
    if (seatAfterConnector != null) return { seat: seatAfterConnector, tokensConsumed: 2, extended: true };
    if (SEAT_PREFIX_WORDS.includes(t2)) {
      const seat = tokens[i + 3] != null ? SEAT_NUMBER_BY_WORD[tokens[i + 3]] : null;
      if (seat != null) return { seat, tokensConsumed: 3, extended: true };
    }
    return null;
  }

  return null;
}

/**
 * Words that mark the speaker as UNCERTAIN rather than reporting an
 * observed fact — "Maybe player one has a three," "He probably has a
 * five." Per explicit product safety requirement, uncertainty language must
 * never result in a committed CardEvent, and this must not depend on
 * incidentally tripping the ordinary noise-token cap (a short transcript
 * like "maybe five" has only ONE stray word alongside a real card word —
 * structurally identical to the tolerated "Taylor king" misheard-name case
 * — so without an explicit check it could slip through the existing
 * MAX_NOISE_TOKENS=1 tolerance). Checked as an unconditional, immediate
 * hard rejection — never counted as ordinary noise, never traded off
 * against the noise cap — by both parseNarration.ts (at the very top,
 * before any op is built) and this file's own noisy-token fallback below.
 */
const UNCERTAINTY_WORDS = new Set(["maybe", "possibly", "probably", "perhaps"]);

export function containsUncertaintyLanguage(tokens: string[]): boolean {
  for (let i = 0; i < tokens.length; i++) {
    if (UNCERTAINTY_WORDS.has(tokens[i])) return true;
    if (tokens[i] === "i" && tokens[i + 1] === "think") return true;
  }
  return false;
}

/**
 * PC Field Test #2 — real captured examples of clock times ("3:55") and
 * fractions ("1/8") reaching this app's voice pipeline. Checked against the
 * RAW transcript, BEFORE normalizeTranscript strips `:`/`/` into ordinary
 * whitespace (see that function's own doc comment on why it does — closed
 * blackjack-narration vocabulary has no legitimate use for either
 * character) — that stripping is exactly what turns "3:55" into the
 * token stream "3 55", which downstream card/digit-stream logic must treat
 * with extra suspicion precisely because the punctuation proving it was a
 * timestamp is otherwise lost. Used only as an ADDITIONAL guard (see
 * parseNarration.ts's compact-digit-stream handling) alongside the
 * existing ambiguity rules — never a replacement for them.
 */
const TIME_LIKE_RE = /\b[0-9]{1,2}:[0-9]{2}\b/;
const FRACTION_LIKE_RE = /\b[0-9]{1,2}\/[0-9]{1,2}\b/;

export function containsTimeOrFractionPattern(rawTranscript: string): boolean {
  return TIME_LIKE_RE.test(rawTranscript) || FRACTION_LIKE_RE.test(rawTranscript);
}

/**
 * A single applied ASR-artifact substitution, for diagnostics only (see
 * VoiceControl's PARSE ALT log lines — "NORMALIZATION RULE ID" / "WHY RULE
 * APPLIED" in the voice reliability spec). `id` is a small, stable,
 * greppable category; `reason` carries the specific word/phrase that
 * triggered it. Never consulted by parsing/dispatch logic itself.
 */
export interface AppliedNormalizationRule {
  id: string;
  reason: string;
}

/**
 * Narrow, deterministic normalization for specific, real captured ASR
 * artifacts — never broadened into general fuzzy matching, per explicit
 * product direction ("Seat/player/spot ambiguity should fail closed when
 * the target cannot be determined confidently"):
 *
 *   1. "play three has 10" — "play" recognized in place of "player"
 *      immediately before a valid seat number. Only fires when the very
 *      next token is unambiguously a seat number (1-7); "play" anywhere
 *      else (ordinary conversation, "let's play a hand") is left
 *      completely untouched.
 *   2. "play R2" — captured in place of "player two": "play" immediately
 *      followed by an "r<n>" token (an artifact of the same shape as the
 *      already-recognized "c<n>" -> seat n substitution — see
 *      seatFromLetterToken). Both tokens are replaced together with
 *      "player <n>", never just the first, so a bare "r2" NOT preceded by
 *      "play" is left alone (too ambiguous on its own to ever guess).
 *   3. "start 3 as a 7" — "start" recognized in place of "spot", under the
 *      EXACT same guard as "play" above: only when the very next token is
 *      unambiguously a seat number (1-7). This is what keeps "start note"
 *      and "start count" (both real, unrelated command phrases — see
 *      lifecyclePhrases.ts) from ever being touched: neither is followed
 *      by a seat number, so this substitution never fires for them. Those
 *      two phrases are matched on the transcript BEFORE
 *      normalizeAsrSeatArtifacts is even invoked (see VoiceControl's
 *      handleFinalResult), so there is no ordering risk either way.
 *   4. "set"/"seet"/"ceit"/"see"/"cheap" immediately before a valid seat
 *      number — additional real captured PC-field ASR misreadings of
 *      "seat" (voice reliability spec §2/§16), under the EXACT same
 *      seat-number-lookahead guard as "play"/"start" above. This is what
 *      keeps ordinary sentences ("let's set the table", "did you see
 *      that", "a cheap seat") untouched: none of them are immediately
 *      followed by a bare seat number 1-7.
 *   5. "play your"/"play are"/"play Air"/"play everyone" immediately before
 *      a valid seat number (PC Field Test #2) — "player" misheard with an
 *      extra filler word in between, under the EXACT same seat-number-
 *      lookahead guard as rule 1: "play your favorite song" (no seat
 *      number follows "your") is left completely untouched.
 *   6. "play your" immediately before a full seat-prefix phrase ("play your
 *      spot one") — recognized as "player", leaving the seat-prefix word
 *      itself for matchSeatTargetPhrase's own stacked-prefix grammar.
 *   7. "play" immediately before "sat" ("play sat down on spot one") —
 *      recognized as "player", narrowly guarded on "sat" specifically.
 *
 * Applied once, at the string level, immediately after normalizeTranscript
 * and before any other parsing — both parseVoiceCommand and parseNarration
 * call this so the substitution is visible to every downstream check
 * (exact-phrase fast path, noisy fallback, and narration's own grammar)
 * identically. `onRuleApplied`, when given, is invoked once per
 * substitution actually made — purely a diagnostic hook (see
 * classifyVoiceTranscript.ts's `diagnoseNormalization`), never consulted by
 * this function's own logic and never required by existing callers.
 */
const ASR_R_SEAT_TOKEN_RE = /^r([0-9]+)$/;

/** See rule 4 above — kept as its own small set rather than folded into SEAT_PREFIX_WORDS so these stay confined to this narrow, lookahead-guarded substitution and never become recognized target-trigger words anywhere else in the grammar. */
const SEAT_PREFIX_ASR_VARIANTS = new Set(["set", "seet", "ceit", "see", "cheap"]);

/**
 * PC Field Test #2 — real captured Chrome mishearings of "player": "play
 * your", "play are", "play Air", "play everyone", "play the" (Chrome
 * Patch round — real captured "play the 3 hits gets a four"). Kept as its
 * own narrow set (never folded into general vocabulary) and only ever
 * consulted immediately after a literal "play" token with a further
 * seat-number lookahead required — see normalizeAsrSeatArtifacts's own doc
 * comment. "play music"/"play your favorite song"/"play the game" are
 * structurally identical up to this point but fail the seat-number
 * lookahead that follows, so they are never touched.
 */
const PLAY_FILLER_WORDS = new Set(["your", "are", "air", "everyone", "the"]);

/**
 * PC Field Test #2 real mic session — real captured single-filler-word
 * artifacts between "play" and "sat" specifically ("play or sat down...",
 * "play Oar sat down...", "play your sat down..."). Kept separate from
 * PLAY_FILLER_WORDS above (different required lookahead — "sat" the next
 * word, not a seat number two words later).
 */
const PLAY_SAT_FILLER_WORDS = new Set(["or", "oar", "your"]);

export function normalizeAsrSeatArtifacts(
  normalized: string,
  onRuleApplied?: (rule: AppliedNormalizationRule) => void
): string {
  const tokens = normalized.split(" ").filter(Boolean);
  const result: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const next = tokens[i + 1];

    if (token === "play" && next != null) {
      if (SEAT_NUMBER_BY_WORD[next] != null) {
        onRuleApplied?.({ id: "ASR_PLAY_TO_PLAYER", reason: '"play" immediately before a seat number — recognized artifact for "player"' });
        result.push("player");
        continue;
      }
      const rMatch = ASR_R_SEAT_TOKEN_RE.exec(next);
      if (rMatch) {
        const n = Number(rMatch[1]);
        if (n >= 1 && n <= 7) {
          onRuleApplied?.({ id: "ASR_PLAY_R_TOKEN_TO_PLAYER", reason: `"play r${n}" — recognized artifact for "player ${n}"` });
          result.push("player", String(n));
          i += 1;
          continue;
        }
      }
      // PC Field Test #2 — "play your"/"play are"/"play Air"/"play
      // everyone" recognized in place of "player", under the EXACT same
      // narrow discipline as every other ASR substitution here: fires ONLY
      // when the word immediately after the filler is unambiguously a seat
      // number (1-7) — "play your favorite song" (no seat number follows)
      // is deliberately left completely untouched, never guessed at.
      if (PLAY_FILLER_WORDS.has(next)) {
        const afterFiller = tokens[i + 2];
        if (afterFiller != null && SEAT_NUMBER_BY_WORD[afterFiller] != null) {
          onRuleApplied?.({ id: "ASR_PLAY_FILLER_TO_PLAYER", reason: `"play ${next}" immediately before a seat number — recognized artifact for "player"` });
          result.push("player");
          i += 1; // consume the filler word too; the seat number itself is handled on the next loop iteration
          continue;
        }
      }
      // "play your spot one" / "play your seat one" — the filler word is
      // immediately followed by a FULL seat-prefix phrase rather than a
      // bare number ("play your spot one left", not "play your one"). Only
      // "your" qualifies here (not "are"/"air"/"everyone" — no real
      // captured example pairs those with a following seat-prefix word, so
      // broadening beyond what was actually observed is not justified).
      // Drops only the filler word, leaving the seat-prefix word itself
      // (e.g. "spot") for matchSeatTargetPhrase's own stacked-prefix
      // grammar to resolve on the next iteration — see its doc comment.
      if (next === "your" && tokens[i + 2] != null && SEAT_PREFIX_WORDS.includes(tokens[i + 2])) {
        onRuleApplied?.({ id: "ASR_PLAY_YOUR_TO_PLAYER", reason: '"play your" immediately before a seat-prefix phrase — recognized artifact for "player"' });
        result.push("player");
        i += 1;
        continue;
      }
      // "play sat down on spot one" — "play" immediately followed by "sat"
      // (the start of "sat down at/on <target>", see
      // parseTableChangeCommand.ts's own trailing-target grammar) is
      // recognized as "player", narrowly guarded on "sat" specifically —
      // never a blind substitution for "play" anywhere else.
      if (next === "sat") {
        onRuleApplied?.({ id: "ASR_PLAY_SAT_TO_PLAYER", reason: '"play" immediately before "sat" — recognized artifact for "player"' });
        result.push("player");
        continue;
      }
      // PC Field Test #2 real mic session — "play or sat down at spot 3" /
      // "play Oar sat down at spot 3" / "play your sat down at spot 3":
      // Chrome commonly inserts exactly ONE extra filler word ("or"/"oar"/
      // "your") between "play" and "sat" that the rule above doesn't
      // tolerate. Narrowly anchored on "sat" being the SPECIFIC word two
      // tokens ahead — never a blind "play or"/"play your" substitution
      // anywhere else ("play or don't play" / "play your cards right" are
      // both left completely untouched, since neither is followed by
      // "sat"). PLAY_SAT_FILLER_WORDS is deliberately its own small set
      // (not merged into PLAY_FILLER_WORDS above, which requires a seat
      // NUMBER next, a different shape entirely).
      if (PLAY_SAT_FILLER_WORDS.has(next) && tokens[i + 2] === "sat") {
        onRuleApplied?.({ id: "ASR_PLAY_FILLER_SAT_TO_PLAYER", reason: `"play ${next}" immediately before "sat" — recognized artifact for "player"` });
        result.push("player");
        i += 1; // consume the filler word; "sat" itself is handled on the next loop iteration
        continue;
      }
    }

    if (token === "start" && next != null && SEAT_NUMBER_BY_WORD[next] != null) {
      onRuleApplied?.({ id: "ASR_START_TO_SPOT", reason: '"start" immediately before a seat number — recognized artifact for "spot"' });
      result.push("spot");
      continue;
    }

    if (SEAT_PREFIX_ASR_VARIANTS.has(token) && next != null && SEAT_NUMBER_BY_WORD[next] != null) {
      onRuleApplied?.({ id: "ASR_SEAT_PREFIX_VARIANT", reason: `"${token}" immediately before a seat number — recognized artifact for "seat"` });
      result.push("seat");
      continue;
    }

    result.push(token);
  }

  return result.join(" ");
}

/**
 * Recognizes a "C<n>"/"S<n>"/"T<n>" artifact as a TARGET token inside the
 * noisy fallback (see extractFromNoisyTokens) — deliberately its own
 * function, checked only where a target is being looked for, never anywhere
 * a bare card word is checked. This is what keeps "C1"/"S1"/"T1" from ever
 * being read as arbitrary text that could become a card: it either resolves
 * to a seat target (1-7) here, or it falls through to the generic
 * "discarded as noise" case exactly like any other unrecognized token — it
 * is never added to the RANK_WORDS lexicon, so it can never itself become a
 * card.
 *
 * Three letters, not just "C": "seat"/"C" collapsing to a bare digit was the
 * original captured artifact (see buildSeatPhrases' own comment), and
 * "S" is the even more direct phonetic match ("seat" begins with the exact
 * same sound) — both "S1" and "T5" (a further captured PC-field variant,
 * voice reliability spec §16) are recognized identically. All three are
 * bounded to exactly the valid seat range, never guessed beyond it.
 */
const SEAT_LETTER_TOKEN_RE = /^[cst]([0-9]+)$/;

export function seatFromLetterToken(token: string): VoiceSeat | null {
  const match = SEAT_LETTER_TOKEN_RE.exec(token);
  if (!match) return null;
  const n = Number(match[1]);
  return n >= 1 && n <= 7 ? (n as VoiceSeat) : null;
}

/**
 * jack/queen/king all resolve to the same "10" CardEntryPad itself produces
 * for any ten-value card — see CardEntryPad's own RANKS list, which never
 * offers J/Q/K as separate buttons. "one" is included as a bare-word card
 * alias for Ace (distinct from "seat one", which is matched as its own
 * whole phrase in SEAT_PHRASES before this table is ever consulted).
 *
 * Bare digit forms ("2", "5", "10") are included alongside the word forms —
 * captured live diagnostics showed a final transcript of "2." for a spoken
 * "two," which this table didn't recognize at all before (only "two" was a
 * key, not "2"). Deliberately NOT including a bare "1": "one" already
 * covers the spoken word for Ace, and a lone "1" is common recognition
 * noise for all sorts of things with far less evidence behind it than the
 * clearly-observed "2"/"5" case — broadening that far isn't justified yet.
 * No collision risk either way: a digit immediately after "seat"/"player"
 * is always consumed as a seat number first (see extractFromNoisyTokens),
 * never reaching this table.
 */
export const RANK_WORDS: Record<string, VoiceRank> = {
  ace: "A",
  one: "A",
  two: "2",
  "2": "2",
  three: "3",
  "3": "3",
  four: "4",
  "4": "4",
  five: "5",
  "5": "5",
  six: "6",
  "6": "6",
  seven: "7",
  "7": "7",
  eight: "8",
  // "eighth" — real captured PC-field ASR misreading of "eight" (voice
  // reliability spec §2/§16). Deliberately NOT including "ate": that's a
  // common past-tense verb ("I ate lunch") with real collision risk under
  // the noisy-fallback's 1-tolerated-noise-word budget ("I ate" -> a bare
  // "8" against whatever's active) that "eighth" — a distinctly card-shaped
  // word with no ordinary-sentence collision — does not share. See the
  // final report / roadmap for this deliberate exclusion.
  eighth: "8",
  "8": "8",
  nine: "9",
  "9": "9",
  ten: "10",
  "10": "10",
  jack: "10",
  queen: "10",
  king: "10",
};

/** Display-only echo of which face card was actually spoken — see VoiceCommandKind.displayRank. Not consulted for entry or counting, only for the confirmation toast's wording. */
export const FACE_CARD_DISPLAY: Record<string, "J" | "Q" | "K"> = {
  jack: "J",
  queen: "Q",
  king: "K",
};

/**
 * "next seat" and "new hand" are deliberate aliases for the exact same
 * "next" command bare "next" already produces — not new behavior.
 * `dispatch`'s "next" case calls the same `handleNext` the touch Next
 * button uses: during an active, not-yet-completed round it advances the
 * active target to the next occupied seat (wrapping to dealer at the end
 * of the table's entry direction — see `advanceToNext`/
 * `orderedSeatNumbersFor`); once the round is marked complete, that same
 * "next" starts the next round instead, exactly as tapping Next does. No
 * new seat-order logic is introduced here.
 *
 * "new hand" specifically closes a gap found while building the operator-
 * loop milestone's end-to-end test: parseNarration.ts already treats "new
 * hand" as a "next"-equivalent single op, but only WITHIN a longer
 * narration — a lone "new hand" utterance is exactly one op
 * (isTrivialLegacyEquivalent), so narration itself defers to this legacy
 * parser for it, same as bare "next" always has. Without this entry, that
 * deferral had nowhere to land and the phrase was rejected outright, even
 * though it's the natural way an operator would ask to move on after
 * Done — see docs/EYEONPIT_OPERATOR_MANUAL.md.
 *
 * "next hand" is a DIFFERENT phrase from "new hand" above, mapped to the
 * OPPOSITE existing command ("done", not "next") per explicit product
 * direction: "Next hand" is how an operator narrates finishing the hand
 * they're on, and that is exactly what "Done" already does — including
 * Floor Mode's existing auto-advance-to-the-next-round behavior once the
 * round completes (see useRoundControls' handleDone). No new command, no
 * new advance logic — just another natural trigger phrase for "done".
 */
const WORKFLOW_WORDS: Record<string, "done" | "next" | "undo" | "count" | "status"> = {
  done: "done",
  "next hand": "done",
  next: "next",
  "next seat": "next",
  "new hand": "next",
  undo: "undo",
  // Read-only, headset-oriented spoken feedback (see spokenSummary.ts) —
  // exact-phrase-only like every other workflow word, never extracted from
  // noisy tokens.
  count: "count",
  status: "status",
};

/**
 * Safari on iOS has been observed prepending a filler article or noun to a
 * card word ("an ace", "a king", "card ace") rather than returning the bare
 * word alone. Each of these is stripped — at most one, and only as an exact
 * literal prefix — before falling back to the card lexicon. Deliberately
 * scoped to card words only (not seats/dealer/workflow): the point is to
 * accept a handful of observed literal variants, not to genuinely fuzzy-
 * match arbitrary phrasing.
 */
const CARD_FILLER_PREFIXES = ["an ", "a ", "the ", "card "];

/**
 * The same literal filler words as CARD_FILLER_PREFIXES, but recognized
 * anywhere inside a longer noisy transcript (not just as a single leading
 * prefix) — e.g. "a a king" has two stray "a"s, only one of which the
 * whole-string prefix-stripping fast path above ever strips. These are
 * swallowed for free by extractFromNoisyTokens below; they never count
 * against MAX_NOISE_TOKENS.
 */
export const NOISE_FILLER_WORDS = new Set(["a", "an", "the", "card"]);

/**
 * How many completely unrecognized tokens (not a target word, not a card
 * word, not an ordinary filler) the noisy-token fallback tolerates in one
 * transcript before it gives up on the whole thing rather than extracting a
 * card. This is the boundary between real-world recognizer noise this
 * fallback exists to survive and an actual natural-language sentence that
 * merely happens to contain a card word:
 *
 * - A misheard proper noun ("Taylor king king") or a garbled near-miss
 *   ("dealer Qing king") is always exactly ONE stray word alongside the
 *   real command.
 * - A genuine sentence around a card word — "player bet ace", "I saw an
 *   ace earlier", "seat 3 raised his bet after the five" — always carries
 *   SEVERAL: verbs, pronouns, prepositions. Real captured field transcripts
 *   (see the "sentence, not a command" describe block in the test file)
 *   never fell below three.
 *
 * Capping at 1 keeps the former safe while refusing the latter — it is
 * deliberately not zero (that would break the misheard-name/near-miss cases
 * this fallback was built for) and deliberately not "count words and take
 * the majority" or any fuzzier heuristic (that would just move the guessing
 * problem instead of removing it).
 */
export const MAX_NOISE_TOKENS = 1;

function cardCommand(word: string, target?: VoiceTarget): VoiceCommandKind {
  const displayRank = FACE_CARD_DISPLAY[word];
  return {
    kind: "card",
    rank: RANK_WORDS[word],
    ...(displayRank ? { displayRank } : {}),
    ...(target ? { target } : {}),
  };
}

/**
 * Real-world recognizer output is sometimes noisy: a stray leading/
 * interspersed word the engine mis-heard (a name, a table label, a garbled
 * near-miss like "Qing"), or the same card word repeated two or three times
 * in one result ("dealer king king king"). None of that is an exact lexicon
 * phrase, so `parseVoiceCommand`'s strict fast path (below) rejects all of
 * it — this is the fallback that tries to still extract a single, safe,
 * unambiguous command from a *sequence* of words instead of the whole
 * string, only for transcripts the fast path already failed to match.
 *
 * This is the boundary that keeps continuous natural-language listening
 * from creating a CardEvent out of ordinary conversation. A transcript
 * containing exactly one recognizable card word is NOT automatically a
 * card command — "player bet ace" and "I saw an ace earlier" each contain
 * exactly one card word ("ace") and must produce zero CardEvents, the same
 * as "banana" does. See CORE RULE in the module-level classification notes
 * and the "sentence, not a command" tests in parseVoiceCommand.test.ts for
 * the real captured transcripts that motivated this.
 *
 * The rule, in order:
 * 1. Tokenize on whitespace. Walk left to right.
 * 2. At most one TARGET is recognized: "dealer"; "seat"/"player"/"spot" + a
 *    number word/digit 1-7 (two tokens, consumed together); or "C<n>"/
 *    "S<n>"/"T<n>" as a single token (a recurring Web Speech artifact for
 *    "seat n" — see seatFromLetterToken). Whichever is found first wins; anything after it
 *    that also looks like a target is treated as an ordinary stray token
 *    (point 4), not an error.
 * 3. If a seat-prefix word ("seat"/"player"/"spot") is immediately followed
 *    by something that is NOT a valid seat number (1-7), the whole
 *    transcript is rejected outright — null, immediately. That word
 *    combination is strong evidence of ordinary sentence structure around
 *    a target-trigger word ("player bet the ace", "seat three raised his
 *    bet") rather than a slightly-mangled seat-selection attempt, and
 *    silently discarding just the prefix word while continuing to hunt for
 *    a card elsewhere in the sentence is exactly how "player bet ace" used
 *    to misfire a card onto whatever seat happened to be active. This also
 *    covers the pre-existing "seat eight" (out-of-range seat) case — it
 *    must never fall back to reading "eight" as a bare card.
 * 4. Every remaining token is checked, in order, against: the card lexicon
 *    (repeats of the *same* rank collapse to one — "king king king" is
 *    exactly one King); then NOISE_FILLER_WORDS (freely ignored, never
 *    counted); then, if neither, it counts as one "noise token" against
 *    MAX_NOISE_TOKENS. Exceeding that cap rejects the whole transcript —
 *    this is what turns "one stray misheard word" (tolerated) into "a real
 *    sentence with several function words" (rejected) without needing to
 *    enumerate every possible verb/pronoun/preposition. A token is never
 *    both a target attempt and eligible as a card: "C<n>"/seat-prefix
 *    words never appear in RANK_WORDS, so there's no lexicon overlap.
 * 5. Zero distinct card ranks -> no safe extraction -> null. Exactly one
 *    distinct card rank -> a "card" command, carrying the target if one was
 *    found. Two or more *distinct* ranks (e.g. "king" and "ace" both
 *    present) -> rejected as ambiguous, null — this function never guesses
 *    which of two different spoken values was the real one; a wrong guess
 *    silently corrupts the count, which is strictly worse than asking the
 *    operator to just repeat themselves.
 *
 * Workflow words (done/next/undo) and target-only phrases are deliberately
 * NOT extracted noisily — they stay exact-match-only via the fast path
 * above; broadening noise-tolerance to those isn't what was reported or
 * asked for, and a wrongly-guessed "done"/"undo" is a very different risk
 * profile than a wrongly-guessed card rank.
 */
function extractFromNoisyTokens(normalized: string): VoiceCommandKind | null {
  const tokens = normalized.split(" ").filter(Boolean);
  // See containsUncertaintyLanguage's own doc comment — an immediate, hard
  // rejection, never merely counted against MAX_NOISE_TOKENS: a short
  // transcript like "maybe five" has only ONE stray word alongside a real
  // card word, which the ordinary noise cap would otherwise tolerate
  // exactly like a misheard proper noun.
  if (containsUncertaintyLanguage(tokens)) return null;

  let target: VoiceTarget | undefined;
  const distinctRanks = new Map<VoiceRank, string>(); // rank -> the word that produced it (for displayRank)
  let noiseTokens = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (!target && token === "dealer") {
      target = { kind: "dealer" };
      continue;
    }

    if (!target && SEAT_PREFIX_WORDS.includes(token) && i + 1 < tokens.length) {
      const seat = SEAT_NUMBER_BY_WORD[tokens[i + 1]];
      i += 1;
      if (seat == null) return null; // see rule 3 above — reject outright, never hunt further
      target = { kind: "seat", seat };
      continue;
    }

    if (!target) {
      const letterSeat = seatFromLetterToken(token);
      if (letterSeat != null) {
        target = { kind: "seat", seat: letterSeat };
        continue;
      }
    }

    if (token in RANK_WORDS) {
      distinctRanks.set(RANK_WORDS[token], token);
      continue;
    }

    if (NOISE_FILLER_WORDS.has(token)) continue;

    // A name, a table label, a garbled near-miss, or a genuine sentence
    // word ("bet", "raised", "saw", "earlier", "his") — counted against the
    // cap rather than unconditionally ignored (see rule 4 above).
    noiseTokens += 1;
  }

  if (noiseTokens > MAX_NOISE_TOKENS) return null;
  if (distinctRanks.size !== 1) return null; // zero: nothing to act on; 2+: ambiguous, reject rather than guess

  const [word] = Array.from(distinctRanks.values());
  return cardCommand(word, target);
}

/**
 * Strict, deterministic, exact-phrase lookup first — no fuzzy matching, no
 * partial credit. A normalized transcript either equals exactly one
 * lexicon entry (directly, or after stripping exactly one known card
 * filler prefix) and is accepted immediately, or falls through to
 * `extractFromNoisyTokens` for one more, more permissive pass before
 * giving up. Because every seat phrase starts with a literal "seat"/
 * "player" and every card/workflow word is looked up as a whole normalized
 * string (not tokenized) in this fast path, "seat two" and "two" can never
 * collide even though "two" alone is a valid card word — the full phrase
 * is the key.
 */
export function parseVoiceCommand(rawTranscript: string): ParsedVoiceCommand {
  const normalized = normalizeAsrSeatArtifacts(normalizeTranscript(rawTranscript));

  if (normalized === "dealer") {
    return { raw: rawTranscript, normalized, command: { kind: "select-dealer" } };
  }
  if (normalized in SEAT_PHRASES) {
    return { raw: rawTranscript, normalized, command: { kind: "select-seat", seat: SEAT_PHRASES[normalized] } };
  }
  if (normalized in RANK_WORDS) {
    return { raw: rawTranscript, normalized, command: cardCommand(normalized) };
  }
  if (normalized in WORKFLOW_WORDS) {
    return { raw: rawTranscript, normalized, command: { kind: WORKFLOW_WORDS[normalized] } };
  }

  for (const prefix of CARD_FILLER_PREFIXES) {
    if (!normalized.startsWith(prefix)) continue;
    const stripped = normalized.slice(prefix.length);
    if (stripped in RANK_WORDS) {
      return { raw: rawTranscript, normalized, command: cardCommand(stripped) };
    }
  }

  return { raw: rawTranscript, normalized, command: extractFromNoisyTokens(normalized) };
}

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
  // "C1", "C2", ... — a recurring Web Speech recognition artifact for
  // "seat one"/"seat two"/etc. (captured directly from live diagnostics:
  // "seat one" -> "C1"). "seat"/"C" are phonetically close enough that the
  // engine collapses the word and returns the number as a bare digit
  // instead. Generalized across the full 1-7 seat range rather than
  // hardcoding only "C1" — it's the same mechanical substitution for every
  // seat number, not a one-off guess — but bounded to exactly the valid
  // seat range (see seatFromCToken for the same bound applied inside the
  // noisy-token fallback).
  for (let seat = 1; seat <= 7; seat++) {
    phrases[`c${seat}`] = seat as VoiceSeat;
  }
  return phrases;
}

const SEAT_PHRASES: Record<string, VoiceSeat> = buildSeatPhrases();

/**
 * Recognizes the same "C<n>" artifact as a TARGET token inside the noisy
 * fallback (see extractFromNoisyTokens) — deliberately its own function,
 * checked only where a target is being looked for, never anywhere a bare
 * card word is checked. This is what keeps "C1" from ever being read as
 * arbitrary text that could become a card: it either resolves to a seat
 * target (1-7) here, or it falls through to the generic "discarded as
 * noise" case exactly like any other unrecognized token — it is never
 * added to the RANK_WORDS lexicon, so it can never itself become a card.
 */
export function seatFromCToken(token: string): VoiceSeat | null {
  const match = /^c([0-9]+)$/.exec(token);
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
 * "next seat" is a deliberate alias for the exact same "next" command bare
 * "next" already produces — not a new behavior. `dispatch`'s "next" case
 * calls the same `handleNext` the touch Next button uses: during an active,
 * not-yet-completed round it advances the active target to the next
 * occupied seat (wrapping to dealer at the end of the table's entry
 * direction — see `advanceToNext`/`orderedSeatNumbersFor`); once the round
 * is marked complete, that same "next" starts the next round instead,
 * exactly as tapping Next does. No new seat-order logic is introduced here.
 */
const WORKFLOW_WORDS: Record<string, "done" | "next" | "undo" | "count" | "status"> = {
  done: "done",
  next: "next",
  "next seat": "next",
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
 *    number word/digit 1-7 (two tokens, consumed together); or "C<n>" as a
 *    single token (a recurring Web Speech artifact for "seat n" — see
 *    seatFromCToken). Whichever is found first wins; anything after it
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
      const cSeat = seatFromCToken(token);
      if (cSeat != null) {
        target = { kind: "seat", seat: cSeat };
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
  const normalized = normalizeTranscript(rawTranscript);

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

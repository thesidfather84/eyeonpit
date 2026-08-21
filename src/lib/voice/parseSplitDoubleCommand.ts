import { normalizeTranscript } from "./normalizeTranscript";
import { RANK_WORDS, SEAT_NUMBER_BY_WORD, SEAT_PREFIX_WORDS, normalizeAsrSeatArtifacts, type VoiceSeat } from "./parseVoiceCommand";

/**
 * "Spot 3 split" / "Split spot 3" / "Spot 3 hand 2 double" — EyeOnPit 1.10
 * Phase 4. Deliberately its own small, exact grammar (same discipline as
 * parseTableChangeCommand.ts), checked BEFORE narration in both
 * classifyVoiceTranscript.ts and VoiceControl.tsx: parseNarration.ts already
 * recognizes "split"/"double" as INERT_ACTION_WORDS (see its own doc
 * comment) that produce no op at all — without this parser intercepting
 * first, "spot 3 split" would silently collapse to a bare seat-selection
 * narration op, discarding the word "split" entirely.
 *
 * `hand` is present only when the operator explicitly named a hand
 * ("hand 1"/"hand 2") in the same utterance — absent for a bare "spot 3
 * double". This parser is pure and state-free (like every other parser in
 * this module family): it has no idea whether spot 3 has actually split, so
 * it never decides here whether a bare double is ambiguous — that decision
 * needs live round state and is made by the caller (VoiceControl.tsx),
 * which fails closed (never guesses between Hand 1 and Hand 2) per the
 * design doc's explicit safety rule.
 */
export type SplitDoubleCommand =
  | { kind: "split"; seat: VoiceSeat }
  | { kind: "double"; seat: VoiceSeat; hand?: 1 | 2 };

/**
 * `{kind: "blocked"}` — the transcript clearly ATTEMPTED this grammar (a
 * clean seat target immediately followed/preceded by one of this grammar's
 * own trigger words — "split"/"double"/"hand") but didn't match one of the
 * exact recognized shapes below (e.g. a malformed hand number: "spot 3 hand
 * 3 double"). Returned instead of `null` specifically so the caller stops
 * here rather than falling through to narration: narration's own
 * INERT_ACTION_WORDS would otherwise silently swallow "double"/"split" as
 * no-op filler and "hand" as a single tolerated noise word, misreading a
 * malformed double attempt as ordinary card narration ("spot 3 has a
 * [next-token-that-happens-to-look-like-a-rank]") and creating a real,
 * wrong CardEvent — exactly the silent misfire this app's whole voice
 * architecture exists to prevent (see MAX_NOISE_TOKENS's own doc comment in
 * parseVoiceCommand.ts for the general version of this principle). Plain
 * `null` is reserved for a transcript that isn't attempting this grammar at
 * all ("spot 3 raised his bet" — never blocked, always falls through
 * exactly as before).
 */
export type SplitDoubleParse = SplitDoubleCommand | { kind: "blocked" } | null;

/** Shared with parseSplitHandCardCommand.ts (EyeOnPit 1.10 Phase 5) — the one closed vocabulary for "which hand" anywhere in the voice layer, so the two grammars can never silently drift apart on what counts as a valid hand number. */
export const HAND_NUMBER_BY_WORD: Record<string, 1 | 2> = { "1": 1, one: 1, "2": 2, two: 2 };

/** The literal words that make a transcript "look like" an attempted split/double command even when the exact shape doesn't parse — see SplitDoubleParse's own doc comment. */
const ATTEMPT_WORDS = new Set(["split", "double", "hand"]);

function seatAt(tokens: string[], i: number): VoiceSeat | null {
  const word = tokens[i];
  return word != null ? SEAT_NUMBER_BY_WORD[word] ?? null : null;
}

/**
 * Recognizes exactly these shapes, nothing broader:
 *
 *   <prefix> <N> split                    "spot 3 split"
 *   split <prefix> <N>                    "split spot 3"
 *   <prefix> <N> double                   "spot 3 double"            (bare)
 *   double <prefix> <N>                   "double spot 3"            (bare)
 *   <prefix> <N> hand <H> double          "spot 3 hand 1 double"
 *   double <prefix> <N> hand <H>          "double spot 3 hand 1"
 *
 * `<prefix>` is "seat"/"player"/"spot" (SEAT_PREFIX_WORDS — same synonyms
 * every other command uses). `<H>` must be exactly "1"/"one"/"2"/"two".
 *
 * A seat-prefix word not immediately followed by a valid seat number
 * returns null immediately (the same "reject outright, never hunt further"
 * rule parseVoiceCommand.ts's extractFromNoisyTokens uses) — that
 * combination is strong evidence of ordinary sentence structure around a
 * target-trigger word, not a mangled command attempt, so the transcript is
 * genuinely not this grammar's concern.
 *
 * Once a clean seat target IS found, though, anything left over that still
 * contains one of this grammar's own trigger words ("split"/"double"/
 * "hand") returns `{kind: "blocked"}` rather than null — see
 * SplitDoubleParse's own doc comment on why a malformed attempt must be
 * blocked outright, not silently deferred to narration/legacy. Leftover
 * tokens that DON'T contain any trigger word (an ordinary sentence that
 * merely starts with a valid seat phrase, e.g. "spot 3 raised his bet")
 * still return null, completely unaffected — this grammar has no opinion
 * on them at all, exactly as before.
 */
export function parseSplitDoubleCommand(rawTranscript: string): SplitDoubleParse {
  const normalized = normalizeAsrSeatArtifacts(normalizeTranscript(rawTranscript));
  const tokens = normalized.split(" ").filter(Boolean);

  if (tokens.length >= 3 && SEAT_PREFIX_WORDS.includes(tokens[0])) {
    const seat = seatAt(tokens, 1);
    if (seat == null) return null;
    const rest = tokens.slice(2);
    if (rest.length === 1 && rest[0] === "split") return { kind: "split", seat };
    if (rest.length === 1 && rest[0] === "double") return { kind: "double", seat };
    if (rest.length === 3 && rest[0] === "hand" && rest[2] === "double") {
      const hand = HAND_NUMBER_BY_WORD[rest[1]];
      if (hand != null) return { kind: "double", seat, hand };
    }
    // "hand" is ALSO parseSplitHandCardCommand.ts's own trigger word
    // (Phase 5: "spot 3 hand 1 has a five") — a clean seat target
    // immediately followed by "hand" doesn't uniquely belong to THIS
    // grammar. If the tail's last token is a real card-rank word, this is
    // that sibling grammar's command, not a malformed double — defer (null)
    // rather than block, so it gets a fair chance to parse it. Only a tail
    // that belongs to NEITHER grammar (not a clean "hand <H> double" shape
    // AND not ending in a card word) is blocked here.
    if (rest[0] === "hand") {
      const lastToken = rest[rest.length - 1];
      return lastToken in RANK_WORDS ? null : { kind: "blocked" };
    }
    return rest.some((t) => ATTEMPT_WORDS.has(t)) ? { kind: "blocked" } : null;
  }

  if (tokens.length >= 3 && (tokens[0] === "split" || tokens[0] === "double") && SEAT_PREFIX_WORDS.includes(tokens[1])) {
    const seat = seatAt(tokens, 2);
    if (seat == null) return null;
    const verb = tokens[0];
    const rest = tokens.slice(3);
    if (verb === "split" && rest.length === 0) return { kind: "split", seat };
    if (verb === "double" && rest.length === 0) return { kind: "double", seat };
    if (verb === "double" && rest.length === 2 && rest[0] === "hand") {
      const hand = HAND_NUMBER_BY_WORD[rest[1]];
      if (hand != null) return { kind: "double", seat, hand };
    }
    // Began exactly like a valid command (a recognized verb, a clean seat
    // target) but the tail doesn't match — always block, never defer.
    return { kind: "blocked" };
  }

  return null;
}

import { normalizeTranscript } from "./normalizeTranscript";
import {
  FACE_CARD_DISPLAY,
  RANK_WORDS,
  SEAT_NUMBER_BY_WORD,
  SEAT_PREFIX_WORDS,
  normalizeAsrSeatArtifacts,
  type VoiceRank,
  type VoiceSeat,
} from "./parseVoiceCommand";
import { HAND_NUMBER_BY_WORD } from "./parseSplitDoubleCommand";

/**
 * "Spot 3 Hand 1 has a five" / "Spot 3 Hand 2 has a king" — EyeOnPit 1.10
 * Phase 5: EXPLICIT split-hand voice card targeting. Same isolation
 * discipline as Phase 4's parseSplitDoubleCommand.ts (its own doc comment
 * explains why): parseNarration.ts has no vocabulary for the literal word
 * "hand" at all, so without this dedicated grammar intercepting first,
 * "spot 3 hand 1 has a five" would fall into narration's noise tolerance —
 * "hand" and "1" each counted as ordinary stray tokens — with a real risk
 * of misreading the trailing card, exactly the CardEvent-safety failure
 * mode Phase 5's own report on parseSplitDoubleCommand.ts already found
 * and fixed once. Checked BEFORE narration, in the same VoiceControl.tsx
 * position Phase 4's split/double block already occupies.
 *
 * PRIMARY RULE (per the Phase 5 design brief): a spoken card intended for
 * a split hand must name the seat AND the hand explicitly, in the same
 * utterance. This module recognizes ONLY that explicit shape — it has no
 * bare-target or continuation form, and deliberately does not attempt
 * multi-card narration under one hand ("...has a five and a king" is
 * BLOCKED, not silently truncated to just the first card — see
 * SplitHandCardParse's own doc comment). Conversational continuation for
 * split hands (a later card resolving against a previously-named hand with
 * no new target spoken) is explicitly out of scope for this phase.
 */
export type SplitHandCardCommand = {
  kind: "card";
  seat: VoiceSeat;
  hand: 1 | 2;
  rank: VoiceRank;
  displayRank?: "J" | "Q" | "K";
};

/**
 * `{kind: "blocked"}` — mirrors parseSplitDoubleCommand.ts's identical
 * safety state exactly: once a clean seat target is found immediately
 * followed by the literal word "hand", this IS an attempt at this grammar,
 * and anything after that doesn't resolve to exactly one valid hand number
 * plus exactly one valid card must block the whole utterance outright
 * rather than falling through to narration/legacy, which would otherwise
 * silently misread the leftover tokens. `null` is reserved for a
 * transcript that isn't attempting this grammar at all — no "hand" word
 * present right after the seat target ("spot 3 has a five" — not this
 * grammar's concern; see VoiceControl.tsx's separate split-seat-ambiguity
 * check for that case), or an out-of-range seat number (already safely
 * rejected by the existing pipeline's own established "reject outright"
 * rule for a seat-prefix word not followed by a valid number).
 */
export type SplitHandCardParse = SplitHandCardCommand | { kind: "blocked" } | null;

/**
 * The literal connector words tolerated between "hand <H>" and the card
 * word — a deliberately narrower set than parseNarration.ts's own
 * HAND_CONNECTOR_WORDS (["has","as","and","with","gets","got","shows",
 * "in"]): "and"/"with"/"in" are multi-card/ASR-artifact-specific words with
 * no established meaning in this closed, single-card grammar, and "as" (an
 * ASR misreading of "has") has no real captured field evidence for this
 * NEW phrase shape yet — adding it here would be exactly the "aggressive
 * recovery to make split-hand phrases pass" the design brief says not to
 * do. Real ASR variants, if the field test finds any, are a deliberate,
 * evidence-gated follow-up, not something to guess at now.
 */
const CARD_CONNECTOR_WORDS = new Set(["has", "is", "gets", "got", "shows"]);

/** "a"/"an" only — the same narrow, already-established filler tolerance CARD_FILLER_PREFIXES uses elsewhere, not the broader NOISE_FILLER_WORDS set. */
const CARD_FILLER_WORDS = new Set(["a", "an"]);

/**
 * Recognizes exactly:
 *
 *   <prefix> <N> hand <H> <card>                    "spot 3 hand 1 five"
 *   <prefix> <N> hand <H> <connector> <card>         "spot 3 hand 1 has five"
 *   <prefix> <N> hand <H> <connector> <filler> <card> "spot 3 hand 1 has a five"
 *
 * `<prefix>` is "seat"/"player"/"spot" (SEAT_PREFIX_WORDS). `<H>` must be
 * exactly "1"/"one"/"2"/"two" (HAND_NUMBER_BY_WORD, shared with Phase 4's
 * split/double grammar). `<card>` must be exactly one RANK_WORDS entry —
 * the bare, connector-less form is included because the existing legacy
 * parser already accepts the equivalent plain-seat shape ("spot 3 five",
 * via extractFromNoisyTokens) with no connector required, so this is a
 * "safe equivalent phrasing the current parser architecture already
 * supports," not new tolerance invented for this grammar.
 */
export function parseSplitHandCardCommand(rawTranscript: string): SplitHandCardParse {
  const normalized = normalizeAsrSeatArtifacts(normalizeTranscript(rawTranscript));
  const tokens = normalized.split(" ").filter(Boolean);

  if (tokens.length < 3 || !SEAT_PREFIX_WORDS.includes(tokens[0])) return null;
  const seat = SEAT_NUMBER_BY_WORD[tokens[1]];
  if (seat == null) return null; // out-of-range/unrecognized seat number — not this grammar's concern, the existing pipeline already safely rejects this shape on its own
  if (tokens[2] !== "hand") return null; // no "hand" word at all — plain seat narration, handled elsewhere

  // A clean seat target immediately followed by literal "hand" IS an
  // attempt at this grammar from here on — every remaining case either
  // resolves to a valid command or blocks outright, never null.
  const handWord = tokens[3];
  const hand = handWord != null ? HAND_NUMBER_BY_WORD[handWord] : undefined;
  if (hand == null) return { kind: "blocked" };

  const rest = tokens.slice(4);
  let i = 0;
  if (CARD_CONNECTOR_WORDS.has(rest[i])) i += 1;
  if (CARD_FILLER_WORDS.has(rest[i])) i += 1;
  const cardWord = rest[i];
  const isExactlyOneCardLeft = cardWord != null && i === rest.length - 1;

  if (isExactlyOneCardLeft && cardWord in RANK_WORDS) {
    const rank = RANK_WORDS[cardWord];
    const displayRank = FACE_CARD_DISPLAY[cardWord];
    return { kind: "card", seat, hand, rank, ...(displayRank ? { displayRank } : {}) };
  }

  // "hand" is ALSO parseSplitDoubleCommand.ts's own trigger word (Phase 4:
  // "spot 3 hand 2 double") — a tail that is exactly "double" belongs to
  // that sibling grammar, not a malformed card attempt; defer rather than
  // block so it gets a fair chance to parse it. Kept even though the
  // current VoiceControl.tsx/classifyVoiceTranscript.ts check order already
  // tries split/double first (which would claim this shape before this
  // parser ever runs) — this is a correctness property of the grammar
  // itself, not something that should depend on check order.
  if (rest.length === 1 && rest[0] === "double") return null;

  return { kind: "blocked" };
}

import { normalizeTranscript } from "./normalizeTranscript";
import { SEAT_PREFIX_WORDS, matchSeatTargetPhrase, normalizeAsrSeatArtifacts, type VoiceSeat } from "./parseVoiceCommand";

/**
 * Natural table-occupancy phrases — "a player sat down at spot 6" / "spot 1
 * left" / "player seat one left the table" — distinct from card narration
 * (parseNarration.ts) and from bare target selection (parseVoiceCommand.ts's
 * "seat six"/"spot six"): these describe the table itself changing, not a
 * card being dealt or a target merely being spoken about. Deliberately its
 * own small exact-grammar parser, checked in VoiceControl BEFORE narration/
 * legacy dispatch — the same "no fuzzy matching" convention every other
 * structurally distinct phrase in this app follows (see VoiceControl's
 * PAUSE_PHRASE/NEW_SHOE_PHRASE etc.), not folded into parseNarration's
 * noise-tolerant grammar, which has no vocabulary for "sat down"/"left" and
 * would otherwise just count them as noise or (worse) misread "left" as a
 * stray word next to a real target.
 */
export type TableChangeCommand =
  | { kind: "seat-joins"; seat: VoiceSeat }
  | { kind: "seat-leaves"; seat: VoiceSeat };

/**
 * The target phrase is resolved with the exact same shared grammar
 * parseNarration.ts uses (matchSeatTargetPhrase — "seat one", "player seat
 * one", "player at spot one", ...), so every natural way of naming a seat
 * works identically here too. What comes AFTER the target phrase decides
 * the event:
 *
 * - nothing at all -> seat-joins, but ONLY when the target phrase itself
 *   used an extended form ("player at spot six") — a PLAIN "seat six"/
 *   "spot six"/"player six" alone is already fully owned by the existing
 *   select-seat command (occupySeat + activate) and must keep producing
 *   that exact same confirmation text; this module must never intercept it.
 * - "sat down" -> seat-joins
 * - "left" or "left the table" -> seat-leaves
 *
 * Anything else (including a plain seat phrase followed by ordinary
 * conversation, e.g. "seat two raised his bet") returns null so the caller
 * falls through to narration/legacy dispatch unchanged — no noise
 * tolerance, no guessing.
 */
export function parseTableChangeCommand(rawTranscript: string): TableChangeCommand | null {
  const normalized = normalizeAsrSeatArtifacts(normalizeTranscript(rawTranscript));
  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length === 0 || !SEAT_PREFIX_WORDS.includes(tokens[0])) return null;

  const match = matchSeatTargetPhrase(tokens, 0);
  if (!match) return null;

  const rest = tokens.slice(1 + match.tokensConsumed);

  if (rest.length === 0) {
    return match.extended ? { kind: "seat-joins", seat: match.seat } : null;
  }

  if (rest.length === 2 && rest[0] === "sat" && rest[1] === "down") {
    return { kind: "seat-joins", seat: match.seat };
  }

  if (rest.length === 1 && rest[0] === "left") {
    return { kind: "seat-leaves", seat: match.seat };
  }

  if (rest.length === 3 && rest[0] === "left" && rest[1] === "the" && rest[2] === "table") {
    return { kind: "seat-leaves", seat: match.seat };
  }

  return null;
}

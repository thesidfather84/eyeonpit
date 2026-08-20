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
 * "new player at spot six" / "a player at spot six" — an optional leading
 * filler word ahead of the real seat-prefix word ("player"), stripped so
 * the ordinary grammar below still recognizes the target phrase that
 * follows it. Only ever strips the ONE specific filler word, never
 * anything else — a transcript that doesn't start with exactly "new
 * player"/"a player" is returned completely unchanged.
 */
function stripLeadingPlayerFiller(tokens: string[]): string[] {
  if (tokens[0] === "new" && tokens[1] === "player") return tokens.slice(1);
  if (tokens[0] === "a" && tokens[1] === "player") return tokens.slice(1);
  return tokens;
}

const SAT_DOWN_CONNECTORS = new Set(["at", "on"]);

/**
 * PC Field Test #2 real mic Gate #2 — real captured plural/misspelled ASR
 * forms of "player" ("players", "playerz") anchoring the SAME trailing-
 * target shape. Deliberately scoped to ONLY this one grammar's anchor
 * check (not added to SEAT_PREFIX_WORDS, which would also change
 * matchSeatTargetPhrase and every other grammar that consults it) — the
 * blast radius stays exactly as narrow as the real captured artifact.
 */
const PLAYER_ANCHOR_WORDS = new Set(["player", "players", "playerz"]);

/**
 * PC Field Test #2 real mic Gate #2 — real captured "players THAT down at
 * spot 3" (Chrome's own misreading of "sat" as "that"). Recognized ONLY
 * as a same-shape substitute for "sat" immediately before "down" inside
 * THIS ALREADY-narrow trailing-target grammar — never a general "that" ->
 * "sat" token substitution anywhere else (normalizeAsrSeatArtifacts is
 * deliberately NOT touched by this), since "that" is far too common an
 * ordinary word to ever treat as an ASR artifact on its own. The grammar
 * around it (a player-anchor word, immediately "down", then a connector
 * and a clean target with nothing left over) is what keeps this failing
 * closed on anything that doesn't strongly establish table-change intent.
 */
const SAT_DOWN_WORDS = new Set(["sat", "that"]);

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
 * PC Field Test #2 added a SECOND shape, where the target trails a verb
 * phrase instead of leading it — "player sat down at spot one" / "player
 * sat down on spot one" — recognized ONLY when the transcript begins with
 * the literal word "player" (after stripping an optional "new "/"a "
 * filler), immediately followed by "sat down at/on" and then a clean
 * target phrase with nothing left over. This is deliberately its own
 * narrow, closed shape rather than a generalization of the target-first
 * grammar above — a bare "sat down at spot one" with no leading "player"
 * word at all is never guessed at (see stripLeadingPlayerFiller's own
 * requirement that the filter tokens actually change something before this
 * shape is even attempted).
 *
 * Anything else (including a plain seat phrase followed by ordinary
 * conversation, e.g. "seat two raised his bet") returns null so the caller
 * falls through to narration/legacy dispatch unchanged — no noise
 * tolerance, no guessing.
 */
export function parseTableChangeCommand(rawTranscript: string): TableChangeCommand | null {
  const normalized = normalizeAsrSeatArtifacts(normalizeTranscript(rawTranscript));
  const tokens = stripLeadingPlayerFiller(normalized.split(" ").filter(Boolean));

  // "[new/a] player(s) sat/that down at/on <target>" — the trailing-target
  // shape. Requires a player-anchor word (whether or not a filler was just
  // stripped ahead of it) — a bare "sat down at spot one" with no
  // player-word anchor at all is never guessed at.
  if (PLAYER_ANCHOR_WORDS.has(tokens[0]) && tokens.length >= 5) {
    const afterPlayer = tokens.slice(1);
    if (SAT_DOWN_WORDS.has(afterPlayer[0])) {
      // Chrome Patch round real-mic finding — "players THAT ARE down at
      // spot 3" (Chrome hearing "sat" as the contraction-like "that
      // are"/"that is"). Tolerates exactly ONE extra "are"/"is" between
      // the sat-word and "down" — narrowly scoped to "that" specifically
      // (never "sat are down", which isn't a real ASR pattern anyone
      // captured) — everything else about the shape (the connector, the
      // seat-prefix word, a clean target with nothing left over) is
      // unchanged, so this still fails closed on anything that doesn't
      // strongly establish table-change intent.
      const hasAreIs = afterPlayer[0] === "that" && (afterPlayer[1] === "are" || afterPlayer[1] === "is");
      const downIndex = hasAreIs ? 2 : 1;
      if (
        afterPlayer[downIndex] === "down" &&
        SAT_DOWN_CONNECTORS.has(afterPlayer[downIndex + 1]) &&
        SEAT_PREFIX_WORDS.includes(afterPlayer[downIndex + 2])
      ) {
        const targetTokens = afterPlayer.slice(downIndex + 2);
        const m = matchSeatTargetPhrase(targetTokens, 0);
        if (m && targetTokens.length === 1 + m.tokensConsumed) {
          return { kind: "seat-joins", seat: m.seat };
        }
      }
    }
  }

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

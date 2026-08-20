import { normalizeTranscript } from "./normalizeTranscript";
import { SEAT_PREFIX_WORDS, matchSeatTargetPhrase, normalizeAsrSeatArtifacts, type VoiceTarget } from "./parseVoiceCommand";

/**
 * PC Field Test #2 — natural ways an operator states WHO they're currently
 * watching without narrating a card: "current player is spot one,"
 * "watching spot one," "I'm on spot one." Distinct from a bare target
 * phrase ("spot one" alone, already handled by parseVoiceCommand's
 * SEAT_PHRASES) and from card narration (parseNarration.ts) — this
 * recognizes a CLOSED list of leading sentence-shapes that mean "set the
 * active target, do not touch the ledger," never a fuzzy "sounds like an
 * intent" guess. A transcript that isn't EXACTLY one of these leading
 * phrases immediately followed by a clean, complete target phrase (nothing
 * left over) returns null — the caller falls through to narration/legacy
 * dispatch unchanged.
 *
 * Deliberately its own tiny parser (mirroring parseTableChangeCommand.ts's
 * own architecture) rather than folded into SEAT_PHRASES: these are full
 * natural sentences, not two-word phrases, and — critically — must never
 * create a CardEvent, only call the exact same select-seat/select-dealer
 * primitive a bare "spot one" already does.
 */
export interface SetActiveTargetIntent {
  target: VoiceTarget;
}

/**
 * Every prefix ends with a trailing space so `startsWith` can never
 * partially match a longer, unrelated word (e.g. "watching" must not match
 * a transcript that merely starts with "watchingly" — not a real risk in
 * English, but the trailing space makes the boundary explicit and free).
 */
const INTENT_PREFIXES = [
  "current player is ",
  "current spot is ",
  "current seat is ",
  "player is at ",
  "i am on ",
  "i'm on ",
  "im on ",
  "watching ",
];

export function parseSetActiveTargetIntent(rawTranscript: string): SetActiveTargetIntent | null {
  const normalized = normalizeAsrSeatArtifacts(normalizeTranscript(rawTranscript));

  for (const prefix of INTENT_PREFIXES) {
    if (!normalized.startsWith(prefix)) continue;
    const remainder = normalized.slice(prefix.length).trim();
    if (!remainder) return null;

    if (remainder === "dealer") return { target: { kind: "dealer" } };

    const tokens = remainder.split(" ").filter(Boolean);
    if (tokens.length === 0 || !SEAT_PREFIX_WORDS.includes(tokens[0])) return null;

    const match = matchSeatTargetPhrase(tokens, 0);
    if (!match) return null;

    const rest = tokens.slice(1 + match.tokensConsumed);
    if (rest.length > 0) return null; // trailing words after the target — not a clean match, never guessed

    return { target: { kind: "seat", seat: match.seat } };
  }

  return null;
}

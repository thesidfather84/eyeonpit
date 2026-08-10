import { activeEventsInOrder, calculateCountSnapshot } from "@/lib/counting-engine/calculateCounts";
import { roundTrueCountForDisplay } from "@/lib/counting-engine/calculateTrueCount";
import { COUNTING_SYSTEMS } from "@/lib/counting-engine/countTags";
import { eventsInShoe } from "@/lib/counting-engine/ledger";
import type { CardEvent } from "@/lib/counting-engine/types";
import { formatSigned, formatTrueCount } from "@/lib/utils/countFormatting";
import type { CountingSystem, Investigation } from "@/types/investigation";

/**
 * Text builders for the read-only "Count"/"Status" voice commands (see
 * VoiceControl's dispatch and lib/voice/speechOutput.ts). Every value here
 * comes from `calculateCountSnapshot` — the exact same computation
 * CountSummaryPanel renders visually — so the spoken numbers can never
 * drift from what's on screen. These functions do no I/O and never mutate
 * anything; they only format numbers that already exist into a short
 * sentence suitable for a headset. No new count metric is invented here.
 */

function speakableSystemName(system: CountingSystem): string {
  // "KO" spoken as a bare two-letter acronym renders inconsistently across
  // TTS engines/voices ("koh" vs. spelling it out) — spacing the letters is
  // a cheap, deterministic way to make every engine spell it out instead.
  return system === "KO" ? "K O" : system;
}

/**
 * "Count" — primary system's running and true count, then every other
 * system's running count, in the same left-to-right order
 * CountSummaryPanel renders them. Read-only: takes an already-fetched
 * CardEvent list, never fetches or mutates anything itself.
 */
export function buildCountAnnouncement(investigation: Investigation, cardEvents: CardEvent[], shoeNumber: number): string {
  const shoeEvents = eventsInShoe(cardEvents, shoeNumber);
  const snapshot = calculateCountSnapshot(shoeEvents, investigation.shoeTotalDecks);
  const primary = investigation.countingSystem;
  const primaryValue = snapshot[primary];

  const sentences = [`${speakableSystemName(primary)} ${formatSigned(primaryValue.running)}.`];

  const trueCount = formatTrueCount(roundTrueCountForDisplay(primaryValue.trueCount));
  if (trueCount !== "N/A") {
    sentences.push(`True count ${trueCount}.`);
  }

  for (const system of COUNTING_SYSTEMS) {
    if (system === primary) continue;
    sentences.push(`${speakableSystemName(system)} ${formatSigned(snapshot[system].running)}.`);
  }

  return sentences.join(" ");
}

/**
 * The Floor audio-feedback content setting (see useSettingsStore) —
 * governs how much of the count snapshot "Status" and Floor's post-Done
 * completion summary speak. "off" is handled entirely by the CALLER
 * (VoiceControl's "status" dispatch, useRoundControls' handleDone): it
 * means "do not speak this," not "speak an empty sentence," so it is
 * never passed into buildStatusAnnouncement below — see those call sites.
 */
export type FloorSpokenCountContent = "hiloRc" | "hiloRcTc" | "all";

/**
 * "Status" (and Floor's post-Done completion announcement — identical
 * content, different trigger; see useRoundControls' handleDone) — the
 * current authoritative count snapshot, exactly as much of it as
 * `content` asks for:
 *   - "hiloRc": Hi-Lo's running count alone ("Hi-Lo -3.") — Hi-Lo
 *     specifically (not just "whichever system is primary"), since Hi-Lo
 *     is always one of the four systems calculateCountSnapshot computes
 *     regardless of the investigation's chosen primary system.
 *   - "hiloRcTc": adds Hi-Lo's true count, when it has one.
 *   - "all": every enabled system's running count (reuses
 *     buildCountAnnouncement verbatim — the exact same text the "Count"
 *     voice command already speaks — never a second, differently-worded
 *     "everything" builder).
 * No target/round preamble anymore (the old "SEAT 3 active. Round 2."
 * wording) — count-first: Status's whole job is the count.
 */
export function buildStatusAnnouncement(
  investigation: Investigation,
  cardEvents: CardEvent[],
  shoeNumber: number,
  content: FloorSpokenCountContent
): string {
  if (content === "all") return buildCountAnnouncement(investigation, cardEvents, shoeNumber);

  const shoeEvents = eventsInShoe(cardEvents, shoeNumber);
  const snapshot = calculateCountSnapshot(shoeEvents, investigation.shoeTotalDecks);
  const hiLo = snapshot["Hi-Lo"];
  const sentences = [`Hi-Lo ${formatSigned(hiLo.running)}.`];

  if (content === "hiloRcTc") {
    const trueCount = formatTrueCount(roundTrueCountForDisplay(hiLo.trueCount));
    if (trueCount !== "N/A") {
      sentences.push(`True count ${trueCount}.`);
    }
  }

  return sentences.join(" ");
}

/**
 * "Shoe N started. {primary system} {RC}." — spoken after a successful
 * New Shoe (voice "new shoe"/"confirm new shoe", or the manual New Shoe
 * button). Always reads the freshly-seeded running count straight off
 * `calculateCountSnapshot` — the same engine call every other count
 * surface uses — so an unbalanced system's own non-zero Initial Running
 * Count (KO's -4 per extra deck) comes through automatically. Never a
 * hardcoded "zero": that would be wrong for KO on anything but a single
 * deck.
 */
export function buildNewShoeAnnouncement(investigation: Investigation, cardEvents: CardEvent[], shoeNumber: number): string {
  const shoeEvents = eventsInShoe(cardEvents, shoeNumber);
  const snapshot = calculateCountSnapshot(shoeEvents, investigation.shoeTotalDecks);
  const primary = investigation.countingSystem;
  return `Shoe ${shoeNumber} started. ${speakableSystemName(primary)} ${formatSigned(snapshot[primary].running)}.`;
}

/**
 * "K O -29." — a specific counting system's own running count, answering a
 * natural question like "What's the KO?" (see parseReadOnlyQuery.ts).
 * Every enabled system is already computed by calculateCountSnapshot
 * regardless of which one is the investigation's chosen primary — this
 * just picks the one the operator asked for by name, out of the same
 * snapshot every other spoken/visual surface reads.
 */
export function buildSystemAnnouncement(
  investigation: Investigation,
  cardEvents: CardEvent[],
  shoeNumber: number,
  system: CountingSystem
): string {
  const shoeEvents = eventsInShoe(cardEvents, shoeNumber);
  const snapshot = calculateCountSnapshot(shoeEvents, investigation.shoeTotalDecks);
  return `${speakableSystemName(system)} ${formatSigned(snapshot[system].running)}.`;
}

/**
 * "True count -0.5." — Hi-Lo's own true count specifically, answering
 * "What is the true count?" regardless of which system is the
 * investigation's chosen primary (see parseReadOnlyQuery.ts's TC phrases
 * and their own doc comment on why Hi-Lo specifically). "N/A" is spoken
 * as-is if decksRemaining/trueCount genuinely has none yet — never a
 * fabricated 0.
 */
export function buildTrueCountAnnouncement(investigation: Investigation, cardEvents: CardEvent[], shoeNumber: number): string {
  const shoeEvents = eventsInShoe(cardEvents, shoeNumber);
  const snapshot = calculateCountSnapshot(shoeEvents, investigation.shoeTotalDecks);
  const trueCount = formatTrueCount(roundTrueCountForDisplay(snapshot["Hi-Lo"].trueCount));
  return `True count ${trueCount}.`;
}

/**
 * "3 aces seen." — the exact same tally CountSummaryPanel's own ACES chip
 * shows (activeEventsInOrder + a rank === "A" filter), not a second aces-
 * counting calculation. Read-only, no CardEvent access beyond counting.
 */
export function buildAcesAnnouncement(cardEvents: CardEvent[], shoeNumber: number): string {
  const shoeEvents = eventsInShoe(cardEvents, shoeNumber);
  const acesSeen = activeEventsInOrder(shoeEvents).filter((event) => event.rank === "A").length;
  return `${acesSeen} ace${acesSeen === 1 ? "" : "s"} seen.`;
}

/** "5.2 decks remaining." — CountSnapshot's own decksRemaining, formatted exactly like the DECKS chip in CountSummaryPanel (one decimal place). */
export function buildDecksRemainingAnnouncement(investigation: Investigation, cardEvents: CardEvent[], shoeNumber: number): string {
  const shoeEvents = eventsInShoe(cardEvents, shoeNumber);
  const snapshot = calculateCountSnapshot(shoeEvents, investigation.shoeTotalDecks);
  return `${snapshot.decksRemaining.toFixed(1)} decks remaining.`;
}

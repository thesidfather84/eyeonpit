import { calculateCountSnapshot } from "@/lib/counting-engine/calculateCounts";
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
 * "Status" — concise current target/round/count state, deliberately
 * shorter than "Count": just the active target, the round number, and the
 * primary system's running count. `targetLabel` is passed in exactly as
 * useCardEntry/CardEntryPad/VoiceControl already compute it ("DEALER",
 * "SEAT 3") — no separate target-naming logic.
 */
export function buildStatusAnnouncement(
  investigation: Investigation,
  cardEvents: CardEvent[],
  shoeNumber: number,
  roundNumber: number,
  targetLabel: string
): string {
  const shoeEvents = eventsInShoe(cardEvents, shoeNumber);
  const snapshot = calculateCountSnapshot(shoeEvents, investigation.shoeTotalDecks);
  const primary = investigation.countingSystem;
  const primaryValue = snapshot[primary];

  return `${targetLabel} active. Round ${roundNumber}. ${speakableSystemName(primary)} ${formatSigned(primaryValue.running)}.`;
}

import type { VoiceTarget } from "./parseVoiceCommand";

/**
 * What actually got committed, in commit order — built by VoiceControl's
 * commit step (never by the parser, which never knows a card's final
 * resolved target when it was spoken with none — see parseNarration.ts's
 * module doc comment). A short-form deliberately: this exists only to
 * render the compact confirmation, not to be dispatched from — commit has
 * already happened by the time this is built.
 */
export type ConfirmationEntry =
  | { kind: "card"; target: VoiceTarget; displayRank: string }
  | { kind: "workflow"; action: "done" | "next" | "undo" }
  /** A target was established with no card following it in the same narration (e.g. "seat two stand") — renders as the bare target label, no colon/ranks. */
  | { kind: "target"; target: VoiceTarget };

function targetLabel(target: VoiceTarget): string {
  return target.kind === "dealer" ? "DEALER" : `S${target.seat}`;
}

type Slot = { kind: "cards"; label: string; ranks: string[] } | { kind: "workflow"; label: string };

/**
 * "DEALER: K A · S1: 5 3 7 · S3: 8 5" — one line, no paragraph, suitable
 * for both the visible status pill and (when spoken feedback is on) a
 * short TTS readback. Preserves true commit order: consecutive cards for
 * the same target merge into one clause, but a workflow entry (or a
 * switch to a different target) always starts a new one, so "new hand ...
 * done" renders as its own leading/trailing clause rather than being
 * folded into a card group.
 */
export function formatNarrationConfirmation(entries: ConfirmationEntry[]): string {
  const slots: Slot[] = [];

  for (const entry of entries) {
    if (entry.kind === "workflow") {
      slots.push({ kind: "workflow", label: entry.action === "next" ? "NEXT" : entry.action.toUpperCase() });
      continue;
    }
    if (entry.kind === "target") {
      slots.push({ kind: "workflow", label: targetLabel(entry.target) });
      continue;
    }
    const label = targetLabel(entry.target);
    const last = slots[slots.length - 1];
    if (last && last.kind === "cards" && last.label === label) {
      last.ranks.push(entry.displayRank);
    } else {
      slots.push({ kind: "cards", label, ranks: [entry.displayRank] });
    }
  }

  return slots
    .map((slot) => (slot.kind === "workflow" ? slot.label : `${slot.label}: ${slot.ranks.join(" ")}`))
    .join(" · ");
}

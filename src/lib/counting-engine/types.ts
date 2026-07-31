// The counting engine's own domain types. Deliberately independent of Dexie,
// React, and the Investigation/Round display model — this module never
// imports from lib/db or a component. `Rank` and `CountingSystem` are
// re-used from the app's card-entry type so a CardEvent's rank is always
// exactly what CardEntryPad can produce.
import type { CountingSystem, Rank } from "@/types/investigation";

export type { CountingSystem, Rank };

/** What a card was exposed to — the dealer's hand, a seat's primary hand, or a seat's split hand. */
export type CardEventTargetType = "dealer" | "seat" | "split";

/**
 * How a card was reported to the ledger. Additive, optional, and read with
 * a default — see cardEventSource() in eventSource.ts. Every CardEvent ever
 * written before this field existed has no `source` property at all; it is
 * never backfilled, never required, and never used to gate or alter
 * counting behavior. "manual" is the only source any shipped entry path
 * produces today (CardEntryPad's keypad taps); "voice"/"ai"/"import" exist
 * so a future entry path can tag its own events without touching this type
 * or any existing call site again.
 */
export type CardEventSource = "manual" | "voice" | "ai" | "import";

/**
 * A card event's lifecycle. Undo never deletes a row — it flips `active`
 * to `undone`. Redo flips it back. `void` is reserved for a future
 * explicit-void path (e.g. a misdeal correction at the ledger level) and is
 * excluded from every count exactly like `undone`.
 */
export type CardEventStatus = "active" | "undone" | "void";

/**
 * One structured, immutable record of a single exposed card. This is the
 * sole source of truth for every counting system's running/true count —
 * see lib/counting-engine/calculateCounts.ts. Never mutated after creation;
 * only `status` transitions (active <-> undone) via markCardEventStatus.
 */
export interface CardEvent {
  id: string;
  investigationId: string;
  shoeNumber: number;
  roundId: string;
  /** Monotonically increasing within (investigationId, shoeNumber) — the ledger's real order, independent of createdAt/clock skew. */
  sequence: number;
  targetType: CardEventTargetType;
  /** Seat number for "seat"/"split" targets; "dealer" for the dealer target. */
  targetId: number | "dealer";
  rank: Rank;
  status: CardEventStatus;
  createdAt: string;
  /** Absent on every event written before this field existed, and on any event whose writer never passed one — see CardEventSource. Never read directly; always go through cardEventSource(). */
  source?: CardEventSource;
}

export interface SystemCountResult {
  running: number;
  /** null only for systems where a true count conversion isn't meaningful (KO) — never a stand-in for 0. */
  trueCount: number | null;
}

/**
 * The one calculated snapshot every UI surface renders from. Keyed by the
 * app's existing CountingSystem labels (not a parallel enum) so it drops
 * straight into COUNTING_SYSTEMS-driven display code.
 */
export type CountSnapshot = Record<CountingSystem, SystemCountResult> & {
  /** Count of active (non-undone, non-void) card events the snapshot was computed from. */
  exposedCardCount: number;
  decksRemaining: number;
};

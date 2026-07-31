import Dexie, { type Table } from "dexie";
import type { Investigation } from "@/types/investigation";
import type { CardEvent } from "@/lib/counting-engine/types";

/**
 * IndexedDB schema, via Dexie. Local storage is a prototype choice, not the
 * permanent architecture — see plan.md §0.3 and §5. Every stored record
 * already carries the sync-ready fields (localId, deviceId, syncStatus,
 * deletedAt) a future backend will need.
 */
export class EyeOnPitDB extends Dexie {
  investigations!: Table<Investigation, string>;
  /** The authoritative shoe card ledger (lib/counting-engine) — every exposed card is exactly one row here, keyed by its own id, never mutated except `status`. */
  cardEvents!: Table<CardEvent, string>;

  constructor() {
    super("eyeonpit");

    this.version(1).stores({
      // localId is the primary key. The rest are indexes for the queries
      // the repository layer actually needs (list/filter by status,
      // exclude demo/deleted records, find by date for ID generation).
      investigations:
        "localId, displayId, status, isDemo, investigationDate, syncStatus, deletedAt",
    });

    // v2 adds the CardEvent ledger table — purely additive, no existing
    // store's schema changes, so every investigation already on disk
    // upgrades untouched. `[investigationId+shoeNumber]` is the compound
    // index every count read actually queries by; `id` stays the primary
    // key so writing the same event id twice updates the same row instead
    // of creating a duplicate (the idempotency guarantee).
    this.version(2).stores({
      investigations:
        "localId, displayId, status, isDemo, investigationDate, syncStatus, deletedAt",
      cardEvents: "id, investigationId, [investigationId+shoeNumber], roundId, status",
    });
  }
}

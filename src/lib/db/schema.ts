import Dexie, { type Table } from "dexie";
import type { Investigation } from "@/types/investigation";

/**
 * IndexedDB schema, via Dexie. Local storage is a prototype choice, not the
 * permanent architecture — see plan.md §0.3 and §5. Every stored record
 * already carries the sync-ready fields (localId, deviceId, syncStatus,
 * deletedAt) a future backend will need.
 */
export class EyeOnPitDB extends Dexie {
  investigations!: Table<Investigation, string>;

  constructor() {
    super("eyeonpit");

    this.version(1).stores({
      // localId is the primary key. The rest are indexes for the queries
      // the repository layer actually needs (list/filter by status,
      // exclude demo/deleted records, find by date for ID generation).
      investigations:
        "localId, displayId, status, isDemo, investigationDate, syncStatus, deletedAt",
    });
  }
}

import Dexie, { type Table } from "dexie";
import type { Investigation } from "@/types/investigation";
import type { CardEvent } from "@/lib/counting-engine/types";
import type { PropertyMetadata } from "@/lib/reporting/propertyMetadata";
import type { Report } from "@/lib/reporting/reportSchema";
import type { CountMethodDefinition } from "@/lib/gold-standard/countMethodRegistry";
import type { GameDefinition } from "@/lib/gold-standard/gameDefinition";
import type { SimulationScenario } from "@/lib/gold-standard/simulation/scenario";
import type { SimulationResult } from "@/lib/gold-standard/simulation/result";
import type { ResearchLibraryEntry } from "@/lib/gold-standard/researchLibrary";

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
  /** EyeOnPit 1.5 — see lib/reporting/propertyMetadata.ts. Independent of `investigations`; referenced by code/id from reports only. */
  properties!: Table<PropertyMetadata, string>;
  /** EyeOnPit 1.5 — see lib/reporting/reportSchema.ts. References an investigation by `investigationId` (Investigation.localId) but is its own record, never merged into `investigations`. */
  reports!: Table<Report, string>;
  /** EyeOnPit 1.6 — user/lab-added Count Method definitions only; the four built-in adapters (Hi-Lo/KO/Zen/Omega II) are code constants, never rows here — see lib/gold-standard/countMethodRegistry.ts. */
  countMethods!: Table<CountMethodDefinition, string>;
  /** EyeOnPit 1.6 — saved custom rule sets; built-in presets are code constants — see lib/gold-standard/gameDefinition.ts. */
  gameDefinitions!: Table<GameDefinition, string>;
  /** EyeOnPit 1.6 — see lib/gold-standard/simulation/scenario.ts. */
  simulationScenarios!: Table<SimulationScenario, string>;
  /** EyeOnPit 1.6 — write-once once generated; see lib/gold-standard/simulation/result.ts. */
  simulationResults!: Table<SimulationResult, string>;
  /** EyeOnPit 1.6 — see lib/gold-standard/researchLibrary.ts. */
  researchEntries!: Table<ResearchLibraryEntry, string>;

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

    // v3 (EyeOnPit 1.5/1.6 foundation) — purely additive, exactly like v2:
    // every existing store is restated unchanged (Dexie's own migration
    // requirement — each version() call must list every store, not just
    // the new ones), and every new table is independent of `investigations`
    // /`cardEvents`, referenced only by id/code from the new record types.
    // No existing investigation, card event, or their indexes are touched
    // by this migration in any way.
    this.version(3).stores({
      investigations:
        "localId, displayId, status, isDemo, investigationDate, syncStatus, deletedAt",
      cardEvents: "id, investigationId, [investigationId+shoeNumber], roundId, status",
      properties: "id, code, isDefault",
      reports: "id, humanId, investigationId, status",
      countMethods: "id, canonicalId, verificationStatus",
      gameDefinitions: "id",
      simulationScenarios: "id",
      simulationResults: "id, scenarioId",
      researchEntries: "id, verificationStatus",
    });
  }
}

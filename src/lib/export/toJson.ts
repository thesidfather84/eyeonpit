import { getCardEventsForInvestigation } from "@/lib/db/repositories/cardEvents";
import { calculateRoundCountSnapshot } from "@/lib/analysis/roundCountSnapshot";
import type { CardEvent, CountSnapshot } from "@/lib/counting-engine/types";
import type { Investigation } from "@/types/investigation";

/** Bumped independently from Investigation.schemaVersion — this covers the export file's own envelope shape, not the investigation record's. */
export const EXPORT_SCHEMA_VERSION = 1;

export interface InvestigationExportBundle {
  exportSchemaVersion: number;
  investigation: Investigation;
  /**
   * The authoritative card ledger for this investigation (every shoe) —
   * without this, another device (or a future re-import) has only the
   * display arrays and event-log text to work from, which is exactly the
   * lossy, ambiguous state legacy recovery exists to patch over. Including
   * it here means an export is fully self-sufficient: counts reconstruct
   * exactly, with nothing to infer.
   */
  cardEvents: CardEvent[];
  /**
   * The authoritative count snapshot (every system) as of the CURRENT
   * round, computed fresh from `cardEvents` at export time via
   * `calculateRoundCountSnapshot` — the exact same function
   * Analysis/AP-correlation already use for every round, current or
   * historical. This is deliberately NOT `investigation.rounds[last].
   * runningCount`/`trueCount`: those two fields are a historical-only
   * cache, snapshotted only when a round is superseded by the next one
   * (see advanceRound) — the current, still-open round's copy of them is
   * ALWAYS null by design, no matter how many cards have been entered
   * (see Round's own doc comment in types/investigation.ts). A downstream
   * reader of a raw export who reads `investigation.rounds` directly would
   * see those nulls and could easily mistake them for "the count is
   * missing" — this field exists so nothing reading the export ever needs
   * to touch that cache field to get the live truth; there is exactly one
   * count-calculation path in this app, and this is it, reused rather than
   * reimplemented.
   */
  currentCountSnapshot: CountSnapshot;
}

export async function investigationToJson(investigation: Investigation): Promise<string> {
  const cardEvents = await getCardEventsForInvestigation(investigation.localId);
  const currentRound = investigation.rounds[investigation.rounds.length - 1];
  const bundle: InvestigationExportBundle = {
    exportSchemaVersion: EXPORT_SCHEMA_VERSION,
    investigation,
    cardEvents,
    currentCountSnapshot: calculateRoundCountSnapshot(investigation, cardEvents, currentRound),
  };
  return JSON.stringify(bundle, null, 2);
}

/** Triggers a real browser download — no server, no filesystem, Vercel-safe. */
export async function downloadInvestigationJson(investigation: Investigation): Promise<void> {
  const json = await investigationToJson(investigation);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${investigation.displayId}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

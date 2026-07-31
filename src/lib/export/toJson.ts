import { getCardEventsForInvestigation } from "@/lib/db/repositories/cardEvents";
import type { CardEvent } from "@/lib/counting-engine/types";
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
}

export async function investigationToJson(investigation: Investigation): Promise<string> {
  const cardEvents = await getCardEventsForInvestigation(investigation.localId);
  const bundle: InvestigationExportBundle = {
    exportSchemaVersion: EXPORT_SCHEMA_VERSION,
    investigation,
    cardEvents,
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

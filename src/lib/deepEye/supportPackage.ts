import { getCardEventsForInvestigation } from "@/lib/db/repositories/cardEvents";
import { checkCountIntegrity } from "./countIntegrity";
import { checkLedgerReplay } from "./ledgerReplay";
import { checkInvestigationHealth, type InvestigationHealthResult } from "./investigationHealth";
import type { CardEvent } from "@/lib/counting-engine/types";
import type { DiagnosticReport } from "./types";
import type { Investigation } from "@/types/investigation";

/** Bumped independently from EXPORT_SCHEMA_VERSION (lib/export/toJson.ts) — this is a diagnostic bundle for a support ticket, not a re-importable investigation record, so the two envelopes are allowed to diverge. */
export const SUPPORT_PACKAGE_SCHEMA_VERSION = 1;

/**
 * The fields stripped from a support package — every one of them is either
 * a person's name, free-text an operator typed, or an operator-chosen
 * label that could contain a name. Everything else (config, rounds, bets,
 * outcomes, the card ledger) is structural/numeric and stays, because
 * that's what's actually needed to reproduce a counting or workflow bug.
 */
export interface SanitizedInvestigation
  extends Omit<
    Investigation,
    | "casino"
    | "dealerName"
    | "operatorName"
    | "investigationLabel"
    | "executiveSummary"
    | "surveillanceMemo"
    | "operatorNotes"
    | "playerGroups"
  > {
  casino: null;
  dealerName: null;
  operatorName: null;
  investigationLabel: null;
  executiveSummary: null;
  surveillanceMemo: null;
  /** Count only — note text itself is never included. */
  operatorNoteCount: number;
  /** Original labels replaced with a stable, order-based "Group 1"/"Group 2" — structural linkage (which seats share a group) is preserved via the unchanged group ids in seatPlayerGroups. */
  playerGroups: Record<string, { id: string; label: string }>;
}

export interface SupportPackage {
  supportPackageSchemaVersion: number;
  generatedAt: string;
  appVersion: string | undefined;
  buildId: string | undefined;
  investigation: SanitizedInvestigation;
  cardEvents: CardEvent[];
  diagnostics: {
    countIntegrity: DiagnosticReport;
    ledgerReplay: DiagnosticReport;
    investigationHealth: InvestigationHealthResult;
  };
}

function sanitizeInvestigation(investigation: Investigation): SanitizedInvestigation {
  const groupIds = Object.keys(investigation.playerGroups).sort(
    (a, b) => (investigation.playerGroups[a]?.label ?? "").localeCompare(investigation.playerGroups[b]?.label ?? "")
  );
  const playerGroups: SanitizedInvestigation["playerGroups"] = {};
  groupIds.forEach((id, i) => {
    playerGroups[id] = { id, label: `Group ${i + 1}` };
  });

  // A shallow clone with the sensitive keys actually deleted — not merely
  // typed away — so the redaction is real at the JS-object level, not just
  // at the TypeScript level. Object spread alone would leave the original
  // (unredacted) values sitting in the result under their old keys.
  const clone: Partial<Investigation> = { ...investigation };
  delete clone.casino;
  delete clone.dealerName;
  delete clone.operatorName;
  delete clone.investigationLabel;
  delete clone.executiveSummary;
  delete clone.surveillanceMemo;
  delete clone.operatorNotes;
  delete clone.playerGroups;

  return {
    ...clone,
    casino: null,
    dealerName: null,
    operatorName: null,
    investigationLabel: null,
    executiveSummary: null,
    surveillanceMemo: null,
    operatorNoteCount: investigation.operatorNotes.length,
    playerGroups,
  } as SanitizedInvestigation;
}

/**
 * Builds a redacted diagnostic bundle for a support ticket: names, free-text
 * notes, and custom labels stripped; every diagnostic in this directory run
 * once and included so support sees exactly what the operator would see in
 * the Diagnostic Center, without a second round trip. Read-only — this
 * function never calls ensureLegacyLedger() and never writes to Dexie.
 */
export async function buildSupportPackage(investigation: Investigation): Promise<SupportPackage> {
  const cardEvents = await getCardEventsForInvestigation(investigation.localId);

  return {
    supportPackageSchemaVersion: SUPPORT_PACKAGE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION,
    buildId: process.env.NEXT_PUBLIC_BUILD_ID,
    investigation: sanitizeInvestigation(investigation),
    cardEvents,
    diagnostics: {
      countIntegrity: checkCountIntegrity(cardEvents, investigation.shoeTotalDecks),
      ledgerReplay: checkLedgerReplay(investigation, cardEvents),
      investigationHealth: checkInvestigationHealth(investigation, cardEvents),
    },
  };
}

/** Triggers a real browser download — same pattern as downloadInvestigationJson (lib/export/toJson.ts), no server involved. */
export async function downloadSupportPackage(investigation: Investigation): Promise<void> {
  const pkg = await buildSupportPackage(investigation);
  const json = JSON.stringify(pkg, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${investigation.displayId}-support.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

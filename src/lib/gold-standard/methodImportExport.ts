import type { CountMethodDefinition, CreateCountMethodInput } from "./countMethodRegistry";
import { validateCountMethodInput } from "./countMethodRegistry";

/**
 * PRIORITY B10 — the safe, versioned `eyeonpit-method.json` import/export
 * format. SECURITY: this file does `JSON.parse` and nothing else on
 * untrusted input — no `eval`, no `new Function`, no dynamic `import()` of
 * imported content, ever. A method's "formula" is represented ONLY as
 * data (a `tags` lookup table and free-text notes/references) — there is
 * no field anywhere in this format capable of carrying executable code, so
 * there is nothing to accidentally execute even if this code were changed
 * carelessly later. "Advanced algorithms need a safe plugin architecture
 * later" (Priority B10's own words) — this format deliberately does NOT
 * attempt to solve that; a method whose logic can't be expressed as a flat
 * tag table stays RESEARCH_ONLY and un-importable as a working method
 * until that future plugin architecture exists.
 */

export const METHOD_EXPORT_SCHEMA_VERSION = 1;

export type MethodExportPayload = Omit<CountMethodDefinition, "id" | "createdAt" | "updatedAt" | "version" | "isBuiltInAdapter">;

export interface MethodExportFile {
  fileType: "eyeonpit-method";
  schemaVersion: number;
  exportedAt: string;
  method: MethodExportPayload;
}

export function serializeMethodToJson(method: CountMethodDefinition): string {
  const payload: MethodExportPayload = {
    canonicalId: method.canonicalId,
    displayName: method.displayName,
    authorSource: method.authorSource,
    verificationStatus: method.verificationStatus,
    balanced: method.balanced,
    tags: method.tags,
    startingCountNote: method.startingCountNote,
    trueCountMethod: method.trueCountMethod,
    aceHandling: method.aceHandling,
    sideCounts: method.sideCounts,
    insuranceLogicNote: method.insuranceLogicNote,
    bettingCorrelation: method.bettingCorrelation,
    playingEfficiency: method.playingEfficiency,
    insuranceCorrelation: method.insuranceCorrelation,
    notes: method.notes,
    sourceReferences: method.sourceReferences,
  };
  const file: MethodExportFile = {
    fileType: "eyeonpit-method",
    schemaVersion: METHOD_EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    method: payload,
  };
  return JSON.stringify(file, null, 2);
}

export type MethodImportResult =
  | { valid: true; input: CreateCountMethodInput; schemaVersion: number }
  | { valid: false; errors: string[] };

/**
 * Parses and validates a candidate `eyeonpit-method.json` file. `JSON.parse`
 * is the ONLY parsing step — see this file's own doc comment. Every field
 * is then re-validated via `validateCountMethodInput` (the exact same rule
 * set a method created directly through the UI must pass — an imported
 * method gets no special trust), so a hand-crafted or corrupted file can
 * never produce a method that skips Priority B12's verification-status
 * safety rules.
 */
export function parseMethodImportFile(raw: string): MethodImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { valid: false, errors: ["File is not valid JSON."] };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { valid: false, errors: ["File must contain a JSON object."] };
  }
  const file = parsed as Partial<MethodExportFile>;

  if (file.fileType !== "eyeonpit-method") {
    return { valid: false, errors: ['Not an EyeOnPit method file (missing/incorrect "fileType").'] };
  }
  if (typeof file.schemaVersion !== "number") {
    return { valid: false, errors: ["Missing or invalid schemaVersion."] };
  }
  if (file.schemaVersion > METHOD_EXPORT_SCHEMA_VERSION) {
    return { valid: false, errors: [`File schema version ${file.schemaVersion} is newer than this app supports (${METHOD_EXPORT_SCHEMA_VERSION}).`] };
  }
  if (typeof file.method !== "object" || file.method === null) {
    return { valid: false, errors: ["Missing method data."] };
  }

  const method = file.method;
  if (typeof method.canonicalId !== "string" || typeof method.displayName !== "string") {
    return { valid: false, errors: ["Method data is missing canonicalId/displayName."] };
  }

  const candidate: CreateCountMethodInput = {
    canonicalId: method.canonicalId,
    displayName: method.displayName,
    authorSource: method.authorSource,
    verificationStatus: method.verificationStatus ?? "RESEARCH_ONLY",
    balanced: method.balanced ?? false,
    tags: method.tags ?? null,
    startingCountNote: method.startingCountNote,
    trueCountMethod: method.trueCountMethod ?? "custom",
    aceHandling: method.aceHandling ?? "custom",
    sideCounts: Array.isArray(method.sideCounts) ? method.sideCounts : [],
    insuranceLogicNote: method.insuranceLogicNote,
    bettingCorrelation: method.bettingCorrelation,
    playingEfficiency: method.playingEfficiency,
    insuranceCorrelation: method.insuranceCorrelation,
    notes: method.notes,
    sourceReferences: Array.isArray(method.sourceReferences) ? method.sourceReferences : [],
  };

  // Imported methods are NEVER trusted at face value regardless of what
  // verificationStatus the file itself claims — force RESEARCH_ONLY unless
  // the file's own claimed status can pass full validation (which already
  // requires a source reference for anything but VERIFIED — see Priority
  // B12). A file claiming VERIFIED is downgraded to RECONSTRUCTED: only
  // EyeOnPit's own built-in adapters (never imported) are ever VERIFIED.
  if (candidate.verificationStatus === "VERIFIED") {
    candidate.verificationStatus = "RECONSTRUCTED";
  }

  const validation = validateCountMethodInput(candidate);
  if (!validation.valid) return { valid: false, errors: validation.errors };

  return { valid: true, input: candidate, schemaVersion: file.schemaVersion };
}

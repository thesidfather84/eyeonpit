import type { VersionedRecord } from "@/lib/versioning/types";
import { generateCanonicalId, validatePropertyCode } from "@/lib/versioning/id";

/**
 * PRIORITY A2 — configurable property metadata. Deliberately property-LEVEL
 * only (code, name, location) — the session-specific fields A2 also lists
 * (table identifier, shift, investigator/observer, external incident
 * number, notes) live on the Report itself (see reportSchema.ts's
 * `ReportContext`), not here: a property doesn't have "a shift," a specific
 * investigation/report does. This split is what keeps a property reusable
 * across every future report generated for it, structured for a future
 * multi-property/global registry (Priority A1) — see
 * lib/versioning/id.ts's `validatePropertyCode`/`generateHumanReadableId`,
 * which this type's `code` field feeds directly.
 *
 * Purely additive: no existing table/type is touched. Persisted in its own
 * Dexie table (see lib/db/schema.ts's v3 migration) — completely
 * independent of `Investigation`, referenced only by `code`/`id` from
 * reports, never a foreign key Investigation itself needs to know about.
 */
export interface PropertyMetadata extends VersionedRecord {
  /** Validated via validatePropertyCode — always uppercase, 2-10 chars. */
  code: string;
  name: string;
  city?: string;
  state?: string;
  country?: string;
  notes?: string;
  /** The property used when a report is generated without one explicitly chosen — exactly one PropertyMetadata record may have this true at a time (see setDefaultProperty). */
  isDefault: boolean;
}

export type CreatePropertyMetadataInput = Pick<PropertyMetadata, "code" | "name"> &
  Partial<Pick<PropertyMetadata, "city" | "state" | "country" | "notes" | "isDefault">>;

export type PropertyMetadataValidation = { valid: true } | { valid: false; errors: string[] };

/** Pure validation — no I/O, no ID/timestamp generation — so it's usable from both the repository layer and a form's live-validation UI without duplicating the rules. */
export function validatePropertyMetadataInput(input: CreatePropertyMetadataInput): PropertyMetadataValidation {
  const errors: string[] = [];
  const codeResult = validatePropertyCode(input.code);
  if (!codeResult.valid) errors.push(codeResult.reason);
  if (!input.name.trim()) errors.push("Property name is required.");
  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}

/** Builds a complete, ready-to-persist PropertyMetadata record from validated input. Throws only if the input hasn't already been validated by the caller (repository functions always validate first — see propertyRepository.ts) — never a silent partial record. */
export function buildPropertyMetadata(input: CreatePropertyMetadataInput): PropertyMetadata {
  const validation = validatePropertyMetadataInput(input);
  if (!validation.valid) {
    throw new Error(`Invalid property metadata: ${validation.errors.join(" ")}`);
  }
  const now = new Date().toISOString();
  const codeResult = validatePropertyCode(input.code);
  const code = codeResult.valid ? codeResult.code : input.code.trim().toUpperCase();
  return {
    id: generateCanonicalId(),
    version: 1,
    createdAt: now,
    updatedAt: now,
    code,
    name: input.name.trim(),
    city: input.city?.trim() || undefined,
    state: input.state?.trim() || undefined,
    country: input.country?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    isDefault: input.isDefault ?? false,
  };
}

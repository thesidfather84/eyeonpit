import type { VersionedRecord, VersionRef } from "@/lib/versioning/types";
import { generateCanonicalId, validatePropertyCode } from "@/lib/versioning/id";
import type { Locale } from "@/lib/i18n/locale";

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
/**
 * PRIORITY 1.8-2 — "EyeOnPit adapts to the operator. The operator should
 * not have to adapt to EyeOnPit" (docs/EYEONPIT_PRODUCT_SPEC.md §1),
 * applied at the property level: a property can prefer "Spot," "Seat," or
 * its own localized/custom term for a numbered player position, WITHOUT
 * changing any internal seat number/ID anywhere — `playerPositionLabel` is
 * a display preference only. SCOPE LIMITATION (documented, not hidden):
 * this is the data model + a pure resolver (`resolveTerminology` below)
 * only — it is NOT wired into ActiveSeatHeader/FloorPlayField/
 * CardEntryPad's existing `terminology` prop in this patch, to avoid
 * touching live Floor/Surveillance UI components outside this session's
 * scope; see docs/EYEONPIT_1_8_GLOBAL_ARCHITECTURE.md.
 */
export type PlayerPositionLabel = "Spot" | "Seat" | { custom: string };

export interface PropertyTerminologyPreference {
  playerPositionLabel: PlayerPositionLabel;
}

/** PRIORITY 1.8-3 — expanded Property Profile. Every field is OPTIONAL — "do not require all fields today." Purely additive to the existing A2 property-level fields above; no existing field's meaning changes. */
export interface PropertyProfileFields {
  /** IANA time zone name, e.g. "America/Los_Angeles" — display formatting only, see lib/i18n/format.ts. */
  timezone?: string;
  defaultLanguage?: Locale;
  terminology?: PropertyTerminologyPreference;
  /** References a GameDefinition version (lib/gold-standard/gameDefinition.ts) — never embeds a copy of the rules themselves. */
  defaultGameRulesRef?: VersionRef;
  /** Free-text convention, e.g. "BJ-##" — display/documentation only, never parsed or enforced. */
  tableNamingConvention?: string;
  /** ISO 4217 currency code, e.g. "USD" — see lib/i18n/format.ts's formatCurrency. */
  currency?: string;
  reportingDefaults?: {
    defaultInvestigatorName?: string;
    defaultShift?: string;
  };
  /** Reserved for a future property logo/branding asset reference — no upload/storage mechanism exists yet; this field exists so a later feature doesn't need a schema migration to add it. */
  logoRef?: string;
}

export interface PropertyMetadata extends VersionedRecord, PropertyProfileFields {
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
  Partial<Pick<PropertyMetadata, "city" | "state" | "country" | "notes" | "isDefault">> &
  Partial<PropertyProfileFields>;

/** The display label a property prefers for a numbered player position — falls back to "Seat" (Surveillance's own default term) when the property has no preference set, matching ActiveSeatHeader's existing default convention. */
export function resolveTerminology(property: Pick<PropertyMetadata, "terminology"> | undefined): string {
  const label = property?.terminology?.playerPositionLabel;
  if (!label) return "Seat";
  if (typeof label === "string") return label;
  return label.custom;
}

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
    timezone: input.timezone,
    defaultLanguage: input.defaultLanguage,
    terminology: input.terminology,
    defaultGameRulesRef: input.defaultGameRulesRef,
    tableNamingConvention: input.tableNamingConvention,
    currency: input.currency,
    reportingDefaults: input.reportingDefaults,
    logoRef: input.logoRef,
  };
}

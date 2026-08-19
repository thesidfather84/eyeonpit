import { v4 as uuidv4 } from "uuid";

/**
 * Collision-resistant canonical machine ID — used as the primary key for
 * every new 1.5/1.6 entity (Report, PropertyMetadata, CountMethod,
 * GameDefinition, SimulationScenario/Result, ResearchLibraryEntry). Same
 * mechanism `Investigation.localId` already uses (uuid v4) — not a new
 * scheme, just applied consistently to the new entities this track adds.
 */
export function generateCanonicalId(): string {
  return uuidv4();
}

/**
 * Property-code prefix rules — validated and structured for a future
 * multi-property/global registry (Priority A1/A2), never free text embedded
 * directly into IDs unchecked. Deliberately narrow: uppercase
 * letters/digits only, 2-10 characters, so a human-readable ID stays
 * predictable to read aloud or type ("HOLLYMS-20260819-4F2A9C") and never
 * collides with the "-" separators the ID format itself uses.
 */
const PROPERTY_CODE_RE = /^[A-Z0-9]{2,10}$/;

export type PropertyCodeValidation = { valid: true; code: string } | { valid: false; reason: string };

/** Normalizes (uppercase, trims) then validates a candidate property code. Never throws — every caller gets a typed result to branch on, exactly like the voice pipeline's own classification results. */
export function validatePropertyCode(raw: string): PropertyCodeValidation {
  const code = raw.trim().toUpperCase();
  if (!code) return { valid: false, reason: "Property code is required." };
  if (!PROPERTY_CODE_RE.test(code)) {
    return { valid: false, reason: "Property code must be 2-10 uppercase letters/digits (e.g. HOLLYMS)." };
  }
  return { valid: true, code };
}

function randomSuffix(): string {
  // 6 uppercase-hex characters — short enough to read/type, long enough
  // (16^6 ≈ 16.7M) that a same-property/same-day collision is not a
  // realistic concern for a single-property/single-day investigation
  // volume. Cryptographically strong (crypto.getRandomValues), not
  // Math.random() — this is an identifier embedded in exported evidence
  // documents, not a UI-only cosmetic value.
  const bytes = new Uint8Array(3);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * The human-readable, property-prefixed report/investigation-facing ID —
 * Priority A1's `HOLLYMS-20260819-XXXXXX` format. Deliberately NOT relied
 * upon for global uniqueness (see this function's own return — it is
 * always paired with a `generateCanonicalId()` machine ID as the true
 * primary key); this is the id a surveillance manager reads, types, or
 * files under, not what the database keys on.
 *
 * `isoDate` is the investigation's own date (YYYY-MM-DD), not "today" —
 * matches the existing `displayId` convention in
 * lib/investigation-id.ts, which this is a property-aware sibling to
 * (that function is untouched; this is intentionally a new, separate
 * concept living in the reporting layer — see
 * docs/EYEONPIT_1_5_REPORTING.md's "Investigation ID Architecture" section
 * for why the existing Investigation.displayId scheme was left alone).
 */
export function generateHumanReadableId(propertyCode: string, isoDate: string): string {
  const validation = validatePropertyCode(propertyCode);
  const code = validation.valid ? validation.code : "UNKNOWN";
  const datePart = isoDate.replaceAll("-", "");
  return `${code}-${datePart}-${randomSuffix()}`;
}

/** Parses a human-readable ID back into its components, if it matches the expected shape — never throws, returns null for anything else (a hand-typed/garbled ID, a legacy investigation with no property code at all). Read-only/display use (e.g. showing the property code back to a user); never used as a lookup key on its own. */
export function parseHumanReadableId(id: string): { propertyCode: string; datePart: string; suffix: string } | null {
  const match = /^([A-Z0-9]{2,10})-(\d{8})-([A-F0-9]{6})$/.exec(id.trim().toUpperCase());
  if (!match) return null;
  const [, propertyCode, datePart, suffix] = match;
  return { propertyCode, datePart, suffix };
}

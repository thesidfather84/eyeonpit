import type { VersionedRecord } from "@/lib/versioning/types";
import type { Role } from "./roles";

/**
 * PRIORITY 1.8-9 — the future account/organization/property/role/
 * subscription shape. TYPES ONLY — nothing here is persisted to Dexie,
 * nothing here is created/read/updated by any repository function, and
 * nothing here is consulted by any auth gate. This is the documented
 * target shape a real future implementation would fill in, not a claim
 * that accounts exist today.
 */
export interface Organization extends VersionedRecord {
  name: string;
}

/** A property (see lib/reporting/propertyMetadata.ts's PropertyMetadata) belonging to an Organization — a future field, not added to PropertyMetadata itself in this patch to avoid implying organizations are real today. */
export interface OrganizationProperty {
  organizationId: string;
  propertyId: string;
}

export interface UserAccount extends VersionedRecord {
  email: string;
  displayName: string;
}

/** One user's role within one property — a user can hold different roles at different properties. */
export interface PropertyMembership {
  userId: string;
  propertyId: string;
  organizationId: string;
  role: Role;
}

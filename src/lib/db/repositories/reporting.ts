import { getDb } from "@/lib/db/client";
import type { PropertyMetadata, CreatePropertyMetadataInput } from "@/lib/reporting/propertyMetadata";
import { buildPropertyMetadata } from "@/lib/reporting/propertyMetadata";
import type { Report } from "@/lib/reporting/reportSchema";

/**
 * EyeOnPit 1.5 — Dexie persistence for PropertyMetadata and Report records.
 * Deliberately separate from lib/db/repositories/investigations.ts: neither
 * new table has any foreign-key relationship Dexie itself needs to enforce
 * (reports reference an investigation only by storing its `localId` as a
 * plain string field), so there is no reason for this file to import from
 * or modify the investigations repository. See lib/db/schema.ts's v3
 * migration for the table definitions.
 */

// ---- PropertyMetadata ----

export async function createProperty(input: CreatePropertyMetadataInput): Promise<PropertyMetadata> {
  const record = buildPropertyMetadata(input);
  if (record.isDefault) {
    await clearOtherDefaults(record.id);
  }
  await getDb().properties.add(record);
  return record;
}

/** Property counts are always tiny (a handful per install) — a plain in-memory filter over `toArray()` is simpler and just as fast as a Dexie boolean index query here, and avoids relying on IndexedDB's boolean-index support. */
async function clearOtherDefaults(exceptId: string): Promise<void> {
  const db = getDb();
  const all = await db.properties.toArray();
  const others = all.filter((p) => p.isDefault && p.id !== exceptId);
  await db.transaction("rw", db.properties, async () => {
    for (const other of others) {
      await db.properties.update(other.id, { isDefault: false });
    }
  });
}

export async function listProperties(): Promise<PropertyMetadata[]> {
  return getDb().properties.toArray();
}

export async function getProperty(id: string): Promise<PropertyMetadata | undefined> {
  return getDb().properties.get(id);
}

export async function getDefaultProperty(): Promise<PropertyMetadata | undefined> {
  const all = await listProperties();
  return all.find((p) => p.isDefault);
}

export async function setDefaultProperty(id: string): Promise<void> {
  const db = getDb();
  const target = await db.properties.get(id);
  if (!target) throw new Error(`setDefaultProperty: no property with id ${id}`);
  await clearOtherDefaults(id);
  await db.properties.update(id, { isDefault: true, updatedAt: new Date().toISOString() });
}

export async function updateProperty(id: string, patch: Partial<Omit<PropertyMetadata, "id" | "createdAt">>): Promise<void> {
  await getDb().properties.update(id, { ...patch, updatedAt: new Date().toISOString() });
}

export async function deleteProperty(id: string): Promise<void> {
  await getDb().properties.delete(id);
}

// ---- Report ----

export async function saveReport(report: Report): Promise<Report> {
  await getDb().reports.put(report);
  return report;
}

export async function getReport(id: string): Promise<Report | undefined> {
  return getDb().reports.get(id);
}

export async function listReportsForInvestigation(investigationId: string): Promise<Report[]> {
  return getDb().reports.where("investigationId").equals(investigationId).toArray();
}

export async function listAllReports(): Promise<Report[]> {
  return getDb().reports.toArray();
}

/** Bumps `version` and re-persists — never overwrites the id, never silently discards the previous version's fields not present in `patch`. See lib/versioning/types.ts's own doc comment on "increment, don't overwrite." */
export async function updateReport(id: string, patch: Partial<Omit<Report, "id" | "createdAt">>): Promise<Report> {
  const existing = await getReport(id);
  if (!existing) throw new Error(`updateReport: no report with id ${id}`);
  const updated: Report = { ...existing, ...patch, version: existing.version + 1, updatedAt: new Date().toISOString() };
  await getDb().reports.put(updated);
  return updated;
}

export async function deleteReport(id: string): Promise<void> {
  await getDb().reports.delete(id);
}

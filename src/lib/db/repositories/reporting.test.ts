// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  createProperty,
  getDefaultProperty,
  listProperties,
  setDefaultProperty,
  updateProperty,
  deleteProperty,
  saveReport,
  getReport,
  listReportsForInvestigation,
  updateReport,
} from "./reporting";
import { buildReportFromInvestigation } from "@/lib/reporting/reportBuilder";
import { createInvestigation, resetAllData } from "@/lib/db/repositories/investigations";

// resetAllData() (investigations.ts) now clears `properties`/`reports`
// alongside `investigations` — see resetAllData.test.ts for the dedicated
// regression coverage proving that.

async function freshInvestigation() {
  return createInvestigation({
    casino: "",
    tableNumber: "",
    dealerName: "",
    investigationDate: "2026-08-19",
    operatorName: "",
    countingSystem: "Hi-Lo",
    shoeTotalDecks: 6,
    status: "active",
  });
}

describe("PropertyMetadata repository", () => {
  it("creates and lists properties", async () => {
    await resetAllData();
    await createProperty({ code: "PROP1", name: "Property One" });
    await createProperty({ code: "PROP2", name: "Property Two" });
    const all = await listProperties();
    expect(all).toHaveLength(2);
  });

  it("only one property can be default at a time", async () => {
    await resetAllData();
    const a = await createProperty({ code: "PROP1", name: "Property One", isDefault: true });
    const b = await createProperty({ code: "PROP2", name: "Property Two", isDefault: true });

    const all = await listProperties();
    const defaults = all.filter((p) => p.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(b.id);
    expect(a.id).not.toBe(b.id);
  });

  it("setDefaultProperty moves the default flag", async () => {
    await resetAllData();
    const a = await createProperty({ code: "PROP1", name: "Property One", isDefault: true });
    const b = await createProperty({ code: "PROP2", name: "Property Two" });

    await setDefaultProperty(b.id);
    const current = await getDefaultProperty();
    expect(current?.id).toBe(b.id);
    void a;
  });

  it("updateProperty patches fields and bumps updatedAt", async () => {
    await resetAllData();
    const p = await createProperty({ code: "PROP1", name: "Property One" });
    await updateProperty(p.id, { city: "New City" });
    const all = await listProperties();
    expect(all[0].city).toBe("New City");
  });

  it("deleteProperty removes it", async () => {
    await resetAllData();
    const p = await createProperty({ code: "PROP1", name: "Property One" });
    await deleteProperty(p.id);
    expect(await listProperties()).toHaveLength(0);
  });
});

describe("Report repository", () => {
  it("saves and retrieves a report", async () => {
    await resetAllData();
    const inv = await freshInvestigation();
    const report = buildReportFromInvestigation({ investigation: inv, cardEvents: [] });
    await saveReport(report);

    const fetched = await getReport(report.id);
    expect(fetched?.humanId).toBe(report.humanId);
  });

  it("lists reports scoped to their investigation", async () => {
    await resetAllData();
    const inv1 = await freshInvestigation();
    const inv2 = await freshInvestigation();
    const report1 = buildReportFromInvestigation({ investigation: inv1, cardEvents: [] });
    const report2 = buildReportFromInvestigation({ investigation: inv2, cardEvents: [] });
    await saveReport(report1);
    await saveReport(report2);

    const forInv1 = await listReportsForInvestigation(inv1.localId);
    expect(forInv1).toHaveLength(1);
    expect(forInv1[0].id).toBe(report1.id);
  });

  it("updateReport bumps the version and preserves untouched fields", async () => {
    await resetAllData();
    const inv = await freshInvestigation();
    const report = buildReportFromInvestigation({ investigation: inv, cardEvents: [] });
    await saveReport(report);

    const updated = await updateReport(report.id, { status: "final" });
    expect(updated.version).toBe(report.version + 1);
    expect(updated.status).toBe("final");
    expect(updated.humanId).toBe(report.humanId); // untouched field preserved
  });
});

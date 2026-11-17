import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ getPlanStore: vi.fn() }));
vi.mock("@/lib/plans/runtime", () => ({ getPlanStore: mocks.getPlanStore }));

import { loadOpenPlanData } from "@/lib/plans/open-data";
import { openPlan } from "@/lib/plans/service";
import { createMemoryPlanStore, DEMO_MASTER } from "@/lib/plans/store";

const NOW = new Date("2026-10-21T18:30:00Z"); // 22 Oct, 01:30 in Thailand

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const store = () => {
  const created = createMemoryPlanStore({ ...DEMO_MASTER, inspectors: [] });
  mocks.getPlanStore.mockReturnValue(created);
  return created;
};

describe("loadOpenPlanData", () => {
  it("answers the options, the settings in force and today's date in Thailand", async () => {
    store();
    const data = await loadOpenPlanData(null);
    expect(data.options.vendors.map((vendor) => vendor.name).sort()).toEqual(DEMO_MASTER.vendors.map((vendor) => vendor.name).sort());
    expect(data.options.models.map((model) => model.code).sort()).toEqual(["OL-1550", "PP-32", "XM2525"]);
    expect(data.settings).toEqual({ qcPercent: expect.any(Number), deadlineDays: expect.any(Number) });
    expect(data.today).toBe("2026-10-22");
    expect(data.opened).toBeNull();
  });

  it("describes the plan that was just opened, with only what the banner and the next-model link need", async () => {
    const created = store();
    const outcome = await openPlan(created, { docType: "INVOICE", docNo: "INV-9", vendorId: 2, modelId: 2, lotQty: 400, invoiceDate: "2026-10-01", expectedSkuCount: 1 }, { actorId: "7", now: NOW });
    if (!("planId" in outcome)) throw new Error("plan not opened");
    const data = await loadOpenPlanData(outcome.planId);
    expect(data.opened).toEqual({ id: outcome.planId, planNo: expect.stringMatching(/\S/), modelCode: "OL-1550", qcRequired: expect.any(Number), lotQty: 400, docType: "INVOICE", vendorId: 2, docNo: "INV-9" });
    expect(Object.keys(data.opened!).sort()).toEqual(["docNo", "docType", "id", "lotQty", "modelCode", "planNo", "qcRequired", "vendorId"]);
  });

  it("answers null for a plan that doesn't exist, and doesn't read a plan when none was asked for", async () => {
    const created = store();
    const getPlan = vi.spyOn(created, "getPlan");
    expect((await loadOpenPlanData(999)).opened).toBeNull();
    getPlan.mockClear();
    await loadOpenPlanData(null);
    expect(getPlan).not.toHaveBeenCalled();
  });

  it("lets a store failure through for the route to answer as 503", async () => {
    const created = store();
    vi.spyOn(created, "listOpenOptions").mockRejectedValue(new Error("down"));
    await expect(loadOpenPlanData(null)).rejects.toThrow("down");
  });
});

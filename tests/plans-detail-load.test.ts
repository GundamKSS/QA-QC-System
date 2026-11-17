import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPlanStore: vi.fn() }));
vi.mock("@/lib/plans/runtime", () => ({ getPlanStore: mocks.getPlanStore }));

import { loadPlanDetail, type PlanDetailPayload } from "@/lib/plans/detail";
import { cancelPlan, openPlan, setWaitingGoods } from "@/lib/plans/service";
import { createMemoryPlanStore, DEMO_MASTER } from "@/lib/plans/store";

const NOW = new Date("2026-10-20T18:30:00Z"); // 21 Oct, 01:30 in Thailand
const actor = { actorId: "7", now: NOW };

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

/** Two plans on INV-A (models 1 and 2) and one on INV-B, so the document has a sibling. */
async function plans() {
  const store = createMemoryPlanStore({
    ...DEMO_MASTER,
    inspectors: [{ id: "7", code: "TRW007", name: "Somchai", isActive: true }],
  });
  mocks.getPlanStore.mockReturnValue(store);
  const invoice = (docNo: string, modelId: number) => ({ docType: "INVOICE" as const, docNo, vendorId: 1, modelId, lotQty: 500, invoiceDate: "2026-10-01", expectedSkuCount: 2 });
  await openPlan(store, invoice("INV-A", 1), actor);
  await openPlan(store, invoice("INV-A", 2), actor);
  await openPlan(store, invoice("INV-B", 1), actor);
  return store;
}
const loaded = async (id: number, canEdit = true): Promise<PlanDetailPayload> => {
  const result = await loadPlanDetail(id, canEdit);
  if (result.kind !== "loaded") throw new Error("expected the plan");
  return result.payload;
};

describe("loadPlanDetail", () => {
  it("answers not_found for a plan that doesn't exist, and reads nothing more", async () => {
    const store = await plans();
    const docPlans = vi.spyOn(store, "docPlans");
    expect(await loadPlanDetail(999, true)).toEqual({ kind: "not_found" });
    expect(docPlans).not.toHaveBeenCalled();
  });

  it("describes the plan, with dates as ISO strings and today in Thailand", async () => {
    await plans();
    const data = await loaded(1);
    expect(data.today).toBe("2026-10-21");
    expect(data.plan).toMatchObject({
      id: 1, status: expect.any(String), waitingGoods: false, lotQty: 500, lotCalledTotal: 0, qcDoneTotal: 0, qcPercent: 10, qcRequired: 50,
      openedAt: NOW.toISOString(), cancelledAt: null, cancelReason: null, productionWoNo: null,
      model: { code: "XM2525", brandName: "TRW" },
      doc: { docType: "INVOICE", docNo: "INV-A", vendorId: 1, vendorName: "Zhejiang Hongyou", invoiceDate: "2026-10-01", expectedSkuCount: 2 },
    });
    expect(() => JSON.stringify(data)).not.toThrow();
  });

  it("sends only the plan fields the page draws", async () => {
    await plans();
    const { plan } = await loaded(1);
    expect(Object.keys(plan).sort()).toEqual([
      "cancelReason", "cancelledAt", "description", "doc", "id", "lotCalledTotal", "lotQty", "manufacturer", "model", "openedAt", "openedBy", "planNo",
      "productionWoNo", "qcDoneTotal", "qcPercent", "qcRequired", "receiptDate", "remarks", "responsibleQc", "status", "waitingGoods",
    ]);
    expect(Object.keys(plan.model).sort()).toEqual(["brandName", "code", "pumpType", "qaChecklist", "qcChecklist"]);
    expect(Object.keys(plan.doc).sort()).toEqual(["department", "docDate", "docNo", "docType", "expectedSkuCount", "invoiceDate", "qcDeadline", "remarks", "vendorId", "vendorName"]);
  });

  it("lists every plan of the same document, this one included, and none of another", async () => {
    await plans();
    const data = await loaded(1);
    expect(data.siblings.map((sibling) => sibling.modelCode).sort()).toEqual(["OL-1550", "XM2525"]);
    expect(data.siblings.some((sibling) => sibling.id === 3)).toBe(false);
  });

  it("carries the status history with ISO dates", async () => {
    const store = await plans();
    await setWaitingGoods(store, { planId: 1, value: true }, { actorId: "7" });
    await cancelPlan(store, { planId: 1, reason: "เปิดผิด", isHead: true }, { actorId: "7" });
    const data = await loaded(1);
    expect(data.history[0]).toMatchObject({ from: null, at: NOW.toISOString() });
    const last = data.history[data.history.length - 1];
    expect(last).toMatchObject({ to: "CANCELLED", reason: "เปิดผิด" });
    expect(typeof last.at).toBe("string");
    expect(data.plan).toMatchObject({ status: "CANCELLED", cancelReason: "เปิดผิด", cancelledAt: expect.any(String) });
  });

  it("gives the vendor choices only to someone who may edit a live plan", async () => {
    const store = await plans();
    const options = vi.spyOn(store, "listOpenOptions");
    expect((await loaded(1, true)).vendors?.map((vendor) => vendor.id).sort()).toEqual([1, 2, 3]);
    options.mockClear();
    expect((await loaded(1, false)).vendors).toBeNull();
    expect(options).not.toHaveBeenCalled();
  });

  it("gives no vendor choices for a cancelled plan, even to someone who may edit", async () => {
    const store = await plans();
    await cancelPlan(store, { planId: 1, reason: "เปิดผิด", isHead: true }, { actorId: "7" });
    expect((await loaded(1, true)).vendors).toBeNull();
  });

  it("includes workOrderSummary with completion state across all work orders", async () => {
    const store = await plans();
    // Plan 1 initially has no work orders
    const initial = await loaded(1);
    expect(initial.workOrderSummary).toEqual({
      totalCount: 0,
      activeCount: 0,
      allCompleted: false,
      incompleteWorkOrders: [],
    });

    // Open work order 1 with calledQty 500 -> Need 50
    const wo1 = await store.openWorkOrder({ planId: 1, calledDate: "2026-10-21", calledQty: 500, remarks: null, assigneeIds: ["7"], by: "7" });
    if (wo1.kind !== "opened") throw new Error("wo1 failed");

    // With 0 done, work order is incomplete
    const withWo = await loaded(1);
    expect(withWo.workOrderSummary.allCompleted).toBe(false);
    expect(withWo.workOrderSummary.incompleteWorkOrders).toHaveLength(1);
    expect(withWo.workOrderSummary.incompleteWorkOrders[0]).toMatchObject({
      woNo: wo1.woNo,
      qtyNeed: 50,
      qtyDone: 0,
      reworkCount: 0,
    });

    // Record full 50 done
    store.recordQcDone(wo1.id, Array.from({ length: 50 }, (_, i) => `SN-${i + 1}`));
    const completed = await loaded(1);
    expect(completed.workOrderSummary.allCompleted).toBe(true);
    expect(completed.workOrderSummary.incompleteWorkOrders).toHaveLength(0);
  });

  it("lets a store failure through for the route to answer as 503", async () => {
    const store = await plans();
    vi.spyOn(store, "getPlan").mockRejectedValue(new Error("down"));
    await expect(loadPlanDetail(1, true)).rejects.toThrow("down");
  });
});

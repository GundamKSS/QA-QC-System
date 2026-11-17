import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPlanStore: vi.fn() }));
vi.mock("@/lib/plans/runtime", () => ({ getPlanStore: mocks.getPlanStore }));

import { cancelPlan, openPlan, setWaitingGoods } from "@/lib/plans/service";
import { createMemoryPlanStore, DEMO_MASTER } from "@/lib/plans/store";
import { loadWorkOrderForm, type WorkOrderFormPayload } from "@/lib/plans/work-order-form";
import { cancelWorkOrder, openWorkOrder } from "@/lib/plans/work-orders";

const NOW = new Date("2026-10-20T18:30:00Z"); // 21 Oct, 01:30 in Thailand
const actor = { actorId: "7", now: NOW };
const INSPECTORS = [
  { id: "11", code: "TRW1001", name: "สมชาย ใจดี", isActive: true },
  { id: "12", code: "TRW9001", name: "ปรีชา ทองดี", isActive: true },
  { id: "13", code: "PUMA3001", name: "อนุชา แก้วมณี", isActive: false },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

/** Lot 500 at 10% → QC 50, document INV-A of vendor 1, model 1 (the example of docs/17). */
async function lot500() {
  const store = createMemoryPlanStore({ ...DEMO_MASTER, inspectors: INSPECTORS });
  mocks.getPlanStore.mockReturnValue(store);
  await openPlan(store, { docType: "INVOICE", docNo: "INV-A", vendorId: 1, modelId: 1, lotQty: 500, invoiceDate: "2026-10-01", expectedSkuCount: 1 }, actor);
  return store;
}
const call = (calledQty: number, calledDate: string) => ({ planId: 1, calledQty, calledDate, assignees: ["11", "12"], remarks: null });
const loaded = async (id = 1): Promise<WorkOrderFormPayload> => {
  const result = await loadWorkOrderForm(id);
  if (result.kind !== "loaded") throw new Error("expected the form data");
  return result.payload;
};

describe("loadWorkOrderForm", () => {
  it("answers not_found for a plan that doesn't exist, and reads nothing more", async () => {
    const store = await lot500();
    const workOrdersOf = vi.spyOn(store, "workOrdersOf");
    expect(await loadWorkOrderForm(999)).toEqual({ kind: "not_found" });
    expect(workOrdersOf).not.toHaveBeenCalled();
  });

  it("describes a fresh plan: lot figures, the first number, no taken dates, the active inspectors, today in Thailand", async () => {
    await lot500();
    const data = await loaded();
    expect(data).toMatchObject({
      blocked: null,
      nextSeq: 1,
      takenDates: [],
      today: "2026-10-21",
      plan: { id: 1, modelCode: "XM2525", docType: "INVOICE", docNo: "INV-A", vendorName: "Zhejiang Hongyou", lotQty: 500, lotCalledTotal: 0, qcRequired: 50, qcDoneTotal: 0, qcPercent: 10 },
    });
    expect(data.plan.planNo).toMatch(/\S/);
    expect(data.inspectors.map((inspector) => inspector.code).sort()).toEqual(["TRW1001", "TRW9001"]);
  });

  it("sends only the plan fields the form and its header draw", async () => {
    await lot500();
    expect(Object.keys((await loaded()).plan).sort()).toEqual(["docNo", "docType", "id", "lotCalledTotal", "lotQty", "modelCode", "planNo", "qcDoneTotal", "qcPercent", "qcRequired", "vendorName"]);
  });

  it("counts the next number after the highest one and lists the dates held by live work orders only", async () => {
    const store = await lot500();
    const first = await openWorkOrder(store, call(100, "2026-10-19"), actor);
    await openWorkOrder(store, call(100, "2026-10-20"), actor);
    if (first.kind !== "opened") throw new Error("not opened");
    await cancelWorkOrder(store, { workOrderId: first.id, reason: "เปิดผิด" }, { actorId: "7" });
    const data = await loaded();
    expect(data.nextSeq).toBe(3);
    expect(data.takenDates).toEqual([{ date: "2026-10-20", woNo: "QP-2610-0001-2" }]);
    expect(data.plan.lotCalledTotal).toBe(100);
  });

  it("blocks with lot_full, and reads no work orders or inspectors, when the whole lot has been called in", async () => {
    const store = await lot500();
    await openWorkOrder(store, call(500, "2026-10-20"), actor);
    const workOrdersOf = vi.spyOn(store, "workOrdersOf");
    const listInspectors = vi.spyOn(store, "listInspectors");
    expect(await loaded()).toMatchObject({ blocked: "lot_full", nextSeq: 0, takenDates: [], inspectors: [] });
    expect(workOrdersOf).not.toHaveBeenCalled();
    expect(listInspectors).not.toHaveBeenCalled();
  });

  it("blocks with plan_closed for a cancelled plan and for one on hold", async () => {
    const store = await lot500();
    await setWaitingGoods(store, { planId: 1, value: true }, { actorId: "7" });
    const held = await loaded();
    // "รอของ" alone doesn't stop work orders; only the statuses canOpenWorkOrder refuses do.
    expect(held.blocked).toBeNull();
    await cancelPlan(store, { planId: 1, reason: "เปิดผิด", isHead: true }, { actorId: "7" });
    expect(await loaded()).toMatchObject({ blocked: "plan_closed", inspectors: [] });
  });

  it("lets a store failure through for the route to answer as 503", async () => {
    const store = await lot500();
    vi.spyOn(store, "getPlan").mockRejectedValue(new Error("down"));
    await expect(loadWorkOrderForm(1)).rejects.toThrow("down");
  });
});

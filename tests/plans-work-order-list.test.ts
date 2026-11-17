import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPlanStore: vi.fn() }));
vi.mock("@/lib/plans/runtime", () => ({ getPlanStore: mocks.getPlanStore }));

import { openPlan } from "@/lib/plans/service";
import { createMemoryPlanStore, DEMO_MASTER } from "@/lib/plans/store";
import { loadWorkOrderList, type WorkOrderListPayload } from "@/lib/plans/work-order-list";
import { cancelWorkOrder, openWorkOrder } from "@/lib/plans/work-orders";

const NOW = new Date("2026-10-20T03:00:00Z");
const actor = { actorId: "7", now: NOW };
const INSPECTORS = [
  { id: "11", code: "TRW1001", name: "สมชาย ใจดี", isActive: true },
  { id: "12", code: "TRW9001", name: "ปรีชา ทองดี", isActive: true },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

async function lot500() {
  const store = createMemoryPlanStore({ ...DEMO_MASTER, inspectors: INSPECTORS });
  mocks.getPlanStore.mockReturnValue(store);
  await openPlan(store, { docType: "INVOICE", docNo: "INV-A", vendorId: 1, modelId: 1, lotQty: 500, invoiceDate: "2026-10-01", expectedSkuCount: 1 }, actor);
  return store;
}
const call = (calledQty: number, calledDate: string) => ({ planId: 1, calledQty, calledDate, assignees: ["11", "12"], remarks: null });
const loaded = async (id = 1, canManage = true): Promise<WorkOrderListPayload> => {
  const result = await loadWorkOrderList(id, canManage);
  if (result.kind !== "loaded") throw new Error("expected the list");
  return result.payload;
};

describe("loadWorkOrderList", () => {
  it("answers not_found for a plan that doesn't exist, and reads nothing more", async () => {
    const store = await lot500();
    const workOrdersOf = vi.spyOn(store, "workOrdersOf");
    expect(await loadWorkOrderList(999, true)).toEqual({ kind: "not_found" });
    expect(workOrdersOf).not.toHaveBeenCalled();
  });

  it("answers an empty list for a plan with no work orders", async () => {
    await lot500();
    expect(await loaded()).toMatchObject({ workOrders: [] });
  });

  it("lists the call-ins in order with the people on each, cancelled ones included", async () => {
    const store = await lot500();
    const first = await openWorkOrder(store, call(100, "2026-10-19"), actor);
    await openWorkOrder(store, call(100, "2026-10-20"), actor);
    if (first.kind !== "opened") throw new Error("not opened");
    await cancelWorkOrder(store, { workOrderId: first.id, reason: "เปิดผิด" }, { actorId: "7" });
    const { workOrders } = await loaded();
    expect(workOrders.map((wo) => [wo.woNo, wo.status, wo.calledQty, wo.cancelReason])).toEqual([
      ["QP-2610-0001-1", "CANCELLED", 100, "เปิดผิด"],
      ["QP-2610-0001-2", "IN_PROGRESS", 100, null],
    ]);
    expect(workOrders[1].assignees.map((person) => [person.slot, person.userId])).toEqual([[1, "11"], [2, "12"]]);
  });

  it("sends only the fields the tab draws", async () => {
    const store = await lot500();
    await openWorkOrder(store, call(100, "2026-10-20"), actor);
    const { workOrders } = await loaded();
    expect(Object.keys(workOrders[0]).sort()).toEqual(["assignees", "calledDate", "calledQty", "cancelReason", "id", "qtyDone", "qtyNeed", "reworkCount", "seq", "status", "type", "woNo"]);
  });

  it("gives the inspectors only to someone who manages work orders", async () => {
    const store = await lot500();
    const listInspectors = vi.spyOn(store, "listInspectors");
    expect((await loaded(1, true)).inspectors.map((inspector) => inspector.code).sort()).toEqual(["TRW1001", "TRW9001"]);
    listInspectors.mockClear();
    expect((await loaded(1, false)).inspectors).toEqual([]);
    expect(listInspectors).not.toHaveBeenCalled();
  });

  it("lets a store failure through for the route to answer as 503", async () => {
    const store = await lot500();
    vi.spyOn(store, "workOrdersOf").mockRejectedValue(new Error("down"));
    await expect(loadWorkOrderList(1, true)).rejects.toThrow("down");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryPlanStore, DEMO_MASTER } from "@/lib/plans/store";
import { openPlan } from "@/lib/plans/service";

const done = vi.hoisted(() => new Map<string, number>());
vi.mock("@/lib/inspections/runtime", () => ({ getInspectionStore: () => ({ getInspectorDoneCounts: async () => done }) }));
beforeEach(() => done.clear());

describe("inspector remaining workload", () => {
  it("subtracts personal completions, counts a repeated model once and clears fully inspected units", async () => {
    const store = createMemoryPlanStore({ ...DEMO_MASTER, inspectors: [
      { id: "11", code: "QC1", name: "QC1", isActive: true },
      { id: "12", code: "QC2", name: "QC2", isActive: true },
    ] });
    await openPlan(store, { docType: "INVOICE", docNo: "LOAD", vendorId: 1, modelId: 1, lotQty: 500, invoiceDate: "2026-11-12", expectedSkuCount: 1 }, { actorId: "7", now: new Date("2026-11-12T03:00:00Z") });
    const input = { planId: 1, calledQty: 100, calledDate: "2026-11-12", remarks: null, assigneeIds: ["11", "12"], assigneeTargets: [25, 25], by: "7" };
    const first = await store.openWorkOrder(input);
    const second = await store.openWorkOrder(input);
    if (first.kind !== "opened" || second.kind !== "opened") throw new Error("expected work orders");
    done.set(`${first.id}:11`, 25);
    done.set(`${second.id}:11`, 20);
    expect((await store.listInspectors()).find((p) => p.id === "11")).toMatchObject({ openWorkOrders: 2, openUnits: 5, openModels: 1 });
    done.set(`${second.id}:11`, 25);
    expect((await store.listInspectors()).find((p) => p.id === "11")).toMatchObject({ openWorkOrders: 2, openUnits: 0, openModels: 0 });
  });

  it("uses remaining QC need for legacy shared assignments instead of the called lot quantity", async () => {
    const store = createMemoryPlanStore({ ...DEMO_MASTER, inspectors: [
      { id: "11", code: "QC1", name: "QC1", isActive: true },
      { id: "12", code: "QC2", name: "QC2", isActive: true },
    ] });
    await openPlan(store, { docType: "INVOICE", docNo: "LEGACY", vendorId: 1, modelId: 1, lotQty: 500, invoiceDate: "2026-11-12", expectedSkuCount: 1 }, { actorId: "7", now: new Date("2026-11-12T03:00:00Z") });
    const wo = await store.openWorkOrder({ planId: 1, calledQty: 200, calledDate: "2026-11-12", remarks: null, assigneeIds: ["11", "12"], by: "7" });
    if (wo.kind !== "opened") throw new Error("expected work order");
    store.recordQcDone(wo.id, ["SN1", "SN2"]);
    expect((await store.listInspectors())[0]).toMatchObject({ openUnits: 48, openModels: 1 });
  });
});

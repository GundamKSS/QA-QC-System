import { describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth/types";
import { cancelPlan, openPlan } from "@/lib/plans/service";
import { createMemoryPlanStore, DEMO_MASTER, type JobCard } from "@/lib/plans/store";
import { openWorkOrder, setWorkOrderAssignees } from "@/lib/plans/work-orders";
import { getWorkNotifications } from "@/lib/notifications/service";

const user: SessionUser = { id: "TRW0011", employeeCode: "TRW0011", fullName: "ผู้ตรวจ", roles: ["QC_INSPECTOR"], mustChangePassword: false };
const actor = { actorId: "7", now: new Date("2026-10-21T03:00:00Z") };

async function setup() {
  const store = createMemoryPlanStore({ ...DEMO_MASTER, inspectors: ["11", "12", "13"].map((id) => ({ id, code: `F${id}`, name: `QC ${id}`, isActive: true })) });
  await openPlan(store, { docType: "INVOICE", docNo: "INV-A", vendorId: 1, modelId: 1, lotQty: 500, invoiceDate: "2026-10-01", expectedSkuCount: 1 }, actor);
  // Lot 500 → Need 50, so a call-in brings at least 50 (docs/17 §1.2).
  const opened = await openWorkOrder(store, { planId: 1, calledQty: 50, calledDate: "2026-10-21", assignees: ["11", "12"], remarks: null }, actor);
  if (opened.kind !== "opened") throw new Error("fixture did not open");
  return { store, opened, dependencies: { store, resolveUserId: vi.fn(async () => "11") } };
}

describe("getWorkNotifications", () => {
  it("resolves the authenticated central identity and queries only that person's active work, even for a QC Head", async () => {
    const { store, dependencies } = await setup();
    const query = vi.spyOn(store, "jobs");
    const snapshot = await getWorkNotifications({ ...user, roles: ["QC_HEAD"] }, dependencies);
    expect(dependencies.resolveUserId).toHaveBeenCalledWith(user.id);
    expect(query).toHaveBeenCalledWith("11", { activeOnly: true });
    expect(snapshot).toMatchObject({ userId: user.id, total: 1 });
    expect(snapshot.items[0].woNo).toBe("QP-2610-0001-1");
  });

  it("makes no business-data queries for roles without jobs access or a forced password change", async () => {
    const store = { jobs: vi.fn(async (): Promise<JobCard[]> => []) };
    const resolveUserId = vi.fn(async () => "11");
    for (const target of [{ ...user, roles: ["ADMIN"] as SessionUser["roles"] }, { ...user, mustChangePassword: true }]) {
      expect(await getWorkNotifications(target, { store, resolveUserId })).toEqual({ userId: user.id, items: [], total: 0 });
    }
    expect(resolveUserId).not.toHaveBeenCalled();
    expect(store.jobs).not.toHaveBeenCalled();
  });

  it("never falls back to everyone's jobs when the central account has no database user", async () => {
    const store = { jobs: vi.fn(async (): Promise<JobCard[]> => []) };
    expect(await getWorkNotifications(user, { store, resolveUserId: async () => null })).toEqual({ userId: user.id, items: [], total: 0 });
    expect(store.jobs).not.toHaveBeenCalled();
  });

  it("reflects reassignment and cancellation on the next read without storing stale alerts", async () => {
    const { store, opened, dependencies } = await setup();
    expect((await getWorkNotifications(user, dependencies)).total).toBe(1);
    await setWorkOrderAssignees(store, { workOrderId: opened.id, assignees: ["12", "13"] }, actor);
    expect((await getWorkNotifications(user, dependencies)).total).toBe(0);
    const other = { ...dependencies, resolveUserId: async () => "13" };
    expect((await getWorkNotifications(user, other)).total).toBe(1);
    await cancelPlan(store, { planId: 1, reason: "ยกเลิก", isHead: true }, actor);
    expect((await getWorkNotifications(user, other)).total).toBe(0);
  });

  it("counts more than 200 active orders instead of truncating the badge", async () => {
    const { store, dependencies } = await setup();
    // One work order per plan per day (docs/17 §1.4), so spread them over 200 more plans.
    for (let index = 0; index < 200; index++) {
      const plan = await openPlan(store, { docType: "INVOICE", docNo: `INV-B${index}`, vendorId: 1, modelId: 1, lotQty: 500, invoiceDate: "2026-10-01", expectedSkuCount: 1 }, actor);
      if (plan.kind !== "opened") throw new Error("plan fixture did not open");
      await openWorkOrder(store, { planId: plan.planId, calledQty: 50, calledDate: "2026-10-21", assignees: ["11", "12"], remarks: null }, actor);
    }
    expect((await getWorkNotifications(user, dependencies)).total).toBe(201);
  });

  it("propagates query failures so the endpoint cannot report a false empty inbox", async () => {
    const failure = new Error("database unavailable");
    await expect(getWorkNotifications(user, { resolveUserId: async () => "11", store: { jobs: async () => { throw failure; } } })).rejects.toBe(failure);
  });
});

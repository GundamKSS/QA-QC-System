import "server-only";
import { getPlanStore } from "./runtime";
import type { Inspector, WorkOrder } from "./store";

/**
 * The work orders of one plan for `GET /api/plans/[id]/work-order-list` (docs/16 §3): one row per call-in, plus —
 * for whoever may open, re-assign and cancel them — the inspectors to pick from. The browser side
 * (components/plans) imports only the types from this file, never a value — it reaches the database.
 */

/** A work order as the plan page's "ใบงาน" tab draws it. */
export type WorkOrderRow = Pick<WorkOrder, "id" | "seq" | "woNo" | "type" | "calledQty" | "calledDate" | "qtyNeed" | "qtyDone" | "status" | "cancelReason" | "assignees">;

export type WorkOrderListPayload = {
  workOrders: WorkOrderRow[];
  /** Empty unless the person may manage work orders (`work-order`: QC Head, Admin). */
  inspectors: Inspector[];
};

export type WorkOrderListResult = { kind: "not_found" } | { kind: "loaded"; payload: WorkOrderListPayload };

const toRow = (wo: WorkOrder): WorkOrderRow => ({
  id: wo.id,
  seq: wo.seq,
  woNo: wo.woNo,
  type: wo.type,
  calledQty: wo.calledQty,
  calledDate: wo.calledDate,
  qtyNeed: wo.qtyNeed,
  qtyDone: wo.qtyDone,
  status: wo.status,
  cancelReason: wo.cancelReason,
  assignees: wo.assignees,
});

/** Throws the database's own errors; the route turns them into a 503. */
export async function loadWorkOrderList(planId: number, canManage: boolean): Promise<WorkOrderListResult> {
  const store = getPlanStore();
  const plan = await store.getPlan(planId);
  if (!plan) return { kind: "not_found" };
  const workOrders = await store.workOrdersOf(plan.id);
  return { kind: "loaded", payload: { workOrders: workOrders.map(toRow), inspectors: canManage ? await store.listInspectors() : [] } };
}

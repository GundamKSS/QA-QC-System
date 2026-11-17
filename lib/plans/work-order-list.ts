import "server-only";
import { getInspectionStore } from "@/lib/inspections/runtime";
import type { InspectorProgress, PendingReworkItem } from "@/lib/inspections/types";
import { getPlanStore } from "./runtime";
import type { Inspector, WorkOrder } from "./store";

/**
 * The work orders of one plan for `GET /api/plans/[id]/work-order-list` (docs/16 §3): one row per call-in, plus —
 * for whoever may open, re-assign and cancel them — the inspectors to pick from. The browser side
 * (components/plans) imports only the types from this file, never a value — it reaches the database.
 */

/** A work order as the plan page's "ใบงาน" tab draws it. */
export type WorkOrderAssigneeRow = WorkOrder["assignees"][number] & {
  doneQty: number;
  passedQty: number;
  reworkPending: number;
  rejectedQty: number;
};

export type WorkOrderRow = Omit<
  Pick<WorkOrder, "id" | "seq" | "woNo" | "type" | "calledQty" | "calledDate" | "qtyNeed" | "qtyDone" | "status" | "cancelReason" | "assignees">,
  "assignees"
> & { reworkCount: number; assignees: WorkOrderAssigneeRow[] };

export type WorkOrderListPayload = {
  workOrders: WorkOrderRow[];
  /** Empty unless the person may manage work orders (`work-order`: QC Head, Admin). */
  inspectors: Inspector[];
};

export type WorkOrderListResult = { kind: "not_found" } | { kind: "loaded"; payload: WorkOrderListPayload };

const toRow = (wo: WorkOrder, reworkCount = 0, progress?: Map<string, InspectorProgress>): WorkOrderRow => ({
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
  assignees: wo.assignees.map((person) => {
    const p = progress?.get(`${wo.id}:${person.userId}`);
    return { ...person, doneQty: p?.done ?? 0, passedQty: p?.passed ?? 0, reworkPending: p?.reworkPending ?? 0, rejectedQty: p?.rejected ?? 0 };
  }),
  reworkCount,
});

/** Throws the database's own errors; the route turns them into a 503. */
export async function loadWorkOrderList(planId: number, canManage: boolean): Promise<WorkOrderListResult> {
  const store = getPlanStore();
  const plan = await store.getPlan(planId);
  if (!plan) return { kind: "not_found" };
  const workOrders = await store.workOrdersOf(plan.id);
  let reworks: PendingReworkItem[] = [];
  let progress: Map<string, InspectorProgress> | undefined;
  try {
    const inspectionStore = getInspectionStore();
    [reworks, progress] = await Promise.all([
      inspectionStore.getPendingReworks(),
      inspectionStore.getInspectorProgress ? inspectionStore.getInspectorProgress(workOrders.map((wo) => wo.id)) : Promise.resolve(undefined),
    ]);
  } catch {
    reworks = [];
  }
  const reworkMap = new Map<string, number>();
  for (const rw of reworks) {
    if (rw.planId === planId) {
      reworkMap.set(rw.workOrderId, (reworkMap.get(rw.workOrderId) ?? 0) + 1);
    }
  }

  return {
    kind: "loaded",
    payload: {
      workOrders: workOrders.map((wo) => toRow(wo, reworkMap.get(wo.id) ?? 0, progress)),
      inspectors: canManage ? await store.listInspectors() : [],
    },
  };
}

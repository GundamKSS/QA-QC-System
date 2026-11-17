import "server-only";
import { canOpenWorkOrder, takesCallInDate, thaiToday } from "./rules";
import { getPlanStore } from "./runtime";
import type { Inspector } from "./store";

/**
 * What the open-work-order form needs for `GET /api/plans/[id]/work-orders` (docs/16 §4): the plan's lot figures,
 * the next work-order number, the call-in dates already taken and the QC inspectors to pick from. The browser side
 * (components/plans) imports only the types from this file, never a value — it reaches the database.
 */

/** Why the form is not offered: the lot is fully called in, or the plan is finished / cancelled / on hold. */
export type WorkOrderBlock = "lot_full" | "plan_closed";

export type WorkOrderFormPayload = {
  plan: {
    id: number;
    planNo: string;
    modelCode: string;
    docType: "INVOICE" | "PO";
    docNo: string;
    vendorName: string | null;
    lotQty: number;
    lotCalledTotal: number;
    qcRequired: number;
    qcDoneTotal: number;
    /** Bound when the plan was opened — qcRequired was worked out with it. */
    qcPercent: number;
  };
  /** Null when a work order can be opened; otherwise the form is not drawn and `nextSeq`, `takenDates`, `inspectors` are empty. */
  blocked: WorkOrderBlock | null;
  nextSeq: number;
  /** Call-in dates already holding a live work order (docs/17 §1.4: one per day). */
  takenDates: { date: string; woNo: string }[];
  inspectors: Inspector[];
  /** YYYY-MM-DD in Thai time. */
  today: string;
};

export type WorkOrderFormResult = { kind: "not_found" } | { kind: "loaded"; payload: WorkOrderFormPayload };

/** Throws the database's own errors; the route turns them into a 503. */
export async function loadWorkOrderForm(planId: number): Promise<WorkOrderFormResult> {
  const store = getPlanStore();
  const plan = await store.getPlan(planId);
  if (!plan) return { kind: "not_found" };
  const summary = {
    id: plan.id,
    planNo: plan.planNo,
    modelCode: plan.model.code,
    docType: plan.doc.docType,
    docNo: plan.doc.docNo,
    vendorName: plan.doc.vendorName,
    lotQty: plan.lotQty,
    lotCalledTotal: plan.lotCalledTotal,
    qcRequired: plan.qcRequired,
    qcDoneTotal: plan.qcDoneTotal,
    qcPercent: plan.qcPercent,
  };
  const today = thaiToday(new Date());
  const blocked: WorkOrderBlock | null = plan.lotQty - plan.lotCalledTotal <= 0 ? "lot_full" : !canOpenWorkOrder(plan.status) ? "plan_closed" : null;
  if (blocked) return { kind: "loaded", payload: { plan: summary, blocked, nextSeq: 0, takenDates: [], inspectors: [], today } };

  const workOrders = await store.workOrdersOf(plan.id);
  return {
    kind: "loaded",
    payload: {
      plan: summary,
      blocked: null,
      nextSeq: Math.max(0, ...workOrders.map((wo) => wo.seq)) + 1,
      takenDates: workOrders.filter((wo) => takesCallInDate(wo.status)).map((wo) => ({ date: wo.calledDate, woNo: wo.woNo })),
      inspectors: await store.listInspectors(),
      today,
    },
  };
}

import "server-only";
import { getInspectionStore } from "@/lib/inspections/runtime";
import type { PlanInspectionSummary } from "@/lib/inspections/types";
import type { PlanStatus } from "./rules";
import { thaiToday } from "./rules";
import { getPlanStore } from "./runtime";
import type { DocPlan, PlanDetail, PlanHistoryEntry, VendorInfo } from "./store";

/**
 * One plan for `GET /api/plans/[id]` (docs/15): its header, the other plans of the same Invoice/PO, the status
 * history and — for whoever may change it — the vendors to pick from. The browser side (components/plans)
 * imports only the types from this file, never a value — it reaches the database.
 */

/** The plan as the page draws it. Only these fields leave the server; dates are ISO 8601 because JSON has no `Date`. */
export type PlanView = {
  id: number;
  planNo: string;
  status: PlanStatus;
  waitingGoods: boolean;
  description: string | null;
  manufacturer: string | null;
  lotQty: number;
  lotCalledTotal: number;
  qcDoneTotal: number;
  qcPercent: number;
  qcRequired: number;
  receiptDate: string | null;
  remarks: string | null;
  /** เลขที่ผลิต (WO) of a PO plan; null for an Invoice. */
  productionWoNo: string | null;
  openedAt: string;
  openedBy: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  responsibleQc: string | null;
  model: { code: string; brandName: string; pumpType: string | null; qcChecklist: string | null; qaChecklist: string | null };
  doc: {
    docType: "INVOICE" | "PO";
    docNo: string;
    department: string | null;
    vendorId: number | null;
    vendorName: string | null;
    invoiceDate: string | null;
    docDate: string | null;
    expectedSkuCount: number | null;
    qcDeadline: string | null;
    remarks: string | null;
  };
};

export type PlanHistoryItem = Omit<PlanHistoryEntry, "at"> & { at: string };

export type IncompleteWorkOrder = {
  woNo: string;
  qtyNeed: number;
  qtyDone: number;
  reworkCount: number;
  status: string;
};

export type PlanWorkOrderSummary = {
  totalCount: number;
  activeCount: number;
  allCompleted: boolean;
  incompleteWorkOrders: IncompleteWorkOrder[];
};

export type PlanDetailPayload = {
  plan: PlanView;
  /** Every plan of the same document, this one included. */
  siblings: DocPlan[];
  history: PlanHistoryItem[];
  /** The vendors the editor offers; null unless the person may edit and the plan isn't cancelled. */
  vendors: VendorInfo[] | null;
  /** YYYY-MM-DD in Thai time, the date the deadline countdown counts from. */
  today: string;
  /** Inspection metrics: pass, rework, reject, in-progress. */
  inspectionSummary: PlanInspectionSummary;
  /** Status and completion of all work orders under this plan. */
  workOrderSummary: PlanWorkOrderSummary;
};

export type PlanDetailResult = { kind: "not_found" } | { kind: "loaded"; payload: PlanDetailPayload };

const toView = (plan: PlanDetail): PlanView => ({
  id: plan.id,
  planNo: plan.planNo,
  status: plan.status,
  waitingGoods: plan.waitingGoods,
  description: plan.description,
  manufacturer: plan.manufacturer,
  lotQty: plan.lotQty,
  lotCalledTotal: plan.lotCalledTotal,
  qcDoneTotal: plan.qcDoneTotal,
  qcPercent: plan.qcPercent,
  qcRequired: plan.qcRequired,
  receiptDate: plan.receiptDate,
  remarks: plan.remarks,
  productionWoNo: plan.productionWoNo,
  openedAt: plan.openedAt.toISOString(),
  openedBy: plan.openedBy,
  cancelledAt: plan.cancelledAt ? plan.cancelledAt.toISOString() : null,
  cancelReason: plan.cancelReason,
  responsibleQc: plan.responsibleQc,
  model: { code: plan.model.code, brandName: plan.model.brandName, pumpType: plan.model.pumpType, qcChecklist: plan.model.qcChecklist, qaChecklist: plan.model.qaChecklist },
  doc: {
    docType: plan.doc.docType,
    docNo: plan.doc.docNo,
    department: plan.doc.department,
    vendorId: plan.doc.vendorId,
    vendorName: plan.doc.vendorName,
    invoiceDate: plan.doc.invoiceDate,
    docDate: plan.doc.docDate,
    expectedSkuCount: plan.doc.expectedSkuCount,
    qcDeadline: plan.doc.qcDeadline,
    remarks: plan.doc.remarks,
  },
});

/** Throws the database's own errors; the route turns them into a 503. `canEdit` is `plan-open` (QC Head, QA Head, Admin). */
export async function loadPlanDetail(planId: number, canEdit: boolean): Promise<PlanDetailResult> {
  const store = getPlanStore();
  const plan = await store.getPlan(planId);
  if (!plan) return { kind: "not_found" };
  const siblings = await store.docPlans(plan.doc.id);
  const history = await store.planHistory(plan.id);
  const vendors = canEdit && plan.status !== "CANCELLED" ? (await store.listOpenOptions()).vendors : null;
  let inspectionSummary: PlanInspectionSummary;
  try {
    inspectionSummary = await getInspectionStore().getPlanInspectionSummary(planId);
  } catch {
    inspectionSummary = {
      passCount: plan.qcDoneTotal,
      reworkCount: 0,
      rejectCount: 0,
      inProgressCount: 0,
    };
  }

  let workOrderSummary: PlanWorkOrderSummary = {
    totalCount: 0,
    activeCount: 0,
    allCompleted: false,
    incompleteWorkOrders: [],
  };
  try {
    const workOrders = await store.workOrdersOf(planId);
    let reworks: { planId: number; workOrderId: string }[] = [];
    try {
      reworks = await getInspectionStore().getPendingReworks();
    } catch {
      reworks = [];
    }
    const reworkMap = new Map<string, number>();
    for (const rw of reworks) {
      if (rw.planId === planId) {
        reworkMap.set(rw.workOrderId, (reworkMap.get(rw.workOrderId) ?? 0) + 1);
      }
    }

    const activeWorkOrders = workOrders.filter(
      (wo) => wo.status !== "CANCELLED" && wo.status !== "FAILED",
    );

    const incompleteWorkOrders: IncompleteWorkOrder[] = [];
    for (const wo of activeWorkOrders) {
      const rwCount = reworkMap.get(wo.id) ?? 0;
      const isNeedUnmet = wo.type === "QC" && wo.qtyDone < wo.qtyNeed;
      const isReturned = wo.status === "RETURNED";
      if (rwCount > 0 || isNeedUnmet || isReturned) {
        incompleteWorkOrders.push({
          woNo: wo.woNo,
          qtyNeed: wo.qtyNeed,
          qtyDone: wo.qtyDone,
          reworkCount: rwCount,
          status: wo.status,
        });
      }
    }

    workOrderSummary = {
      totalCount: workOrders.length,
      activeCount: activeWorkOrders.length,
      allCompleted: activeWorkOrders.length > 0 && incompleteWorkOrders.length === 0,
      incompleteWorkOrders,
    };
  } catch {
    workOrderSummary = {
      totalCount: 0,
      activeCount: 0,
      allCompleted: false,
      incompleteWorkOrders: [],
    };
  }

  return {
    kind: "loaded",
    payload: {
      plan: toView(plan),
      siblings,
      history: history.map((entry) => ({ ...entry, at: entry.at.toISOString() })),
      vendors,
      today: thaiToday(new Date()),
      inspectionSummary,
      workOrderSummary,
    },
  };
}

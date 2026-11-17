import { cancelBlock, canFlagWaitingGoods, MAX_CANCEL_REASON, normalizeDocNo, periodOf, qcDeadline, qcRequired, type CancelBlock, type PlanStatus } from "./rules";
import type { DocPlan, DocType, OpenPlanResult, PlanStore, ReceiptDoc, ReceiptDocHeader } from "./store";
import type { InspectionStore } from "@/lib/inspections/store";

/** What the open-plan form sends (FR-PLAN-01). Header fields only matter for the first plan of a document. */
export type OpenPlanInput = {
  docType: string;
  docNo: string;
  /** Optional (user 23 Oct 2026): the warehouse may tell the QC Head later — see setPlanVendor. */
  vendorId: number | null;
  modelId: number | null;
  lotQty: number | null;
  receiptDate?: string | null;
  description?: string | null;
  manufacturer?: string | null;
  remarks?: string | null;
  invoiceDate?: string | null;
  docDate?: string | null;
  expectedSkuCount?: number | null;
  department?: string | null;
  docRemarks?: string | null;
};

export type OpenPlanField = keyof OpenPlanInput;
export type FieldError = "required" | "invalid" | "too_long" | "inactive" | "not_found";

export type OpenPlanOutcome =
  | (OpenPlanResult & { qcRequired: number; productionWoNo: string | null })
  | { kind: "invalid"; errors: Partial<Record<OpenPlanField, FieldError>> };

export const DEPARTMENTS = ["408", "409"] as const;
const MAX_LOT = 1_000_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const text = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const validDate = (value: string) => {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};

/**
 * Opens an inspection plan (FR-PLAN-01…06, BR-01/02/10/11). `actorId` is the opener's users.id
 * (db/actor.ts); permission is checked by the caller. Returns field errors instead of throwing.
 */
export async function openPlan(store: PlanStore, input: OpenPlanInput, context: { actorId: string; now?: Date }): Promise<OpenPlanOutcome> {
  const now = context.now ?? new Date();
  const errors: Partial<Record<OpenPlanField, FieldError>> = {};
  const fail = (field: OpenPlanField, error: FieldError) => {
    errors[field] ??= error;
  };
  const optionalText = (field: OpenPlanField, value: string | null | undefined, max: number) => {
    const result = text(value);
    if (result && result.length > max) fail(field, "too_long");
    return result;
  };
  const optionalDate = (field: OpenPlanField, value: string | null | undefined) => {
    const result = text(value);
    if (result && !validDate(result)) fail(field, "invalid");
    return result;
  };

  const docType = input.docType === "INVOICE" || input.docType === "PO" ? (input.docType as DocType) : null;
  if (!docType) fail("docType", "required");
  const docNo = text(input.docNo);
  if (!docNo) fail("docNo", "required");
  else if (docNo.length > 64) fail("docNo", "too_long");

  if (input.lotQty === null || input.lotQty === undefined) fail("lotQty", "required");
  else if (!Number.isInteger(input.lotQty) || input.lotQty < 1 || input.lotQty > MAX_LOT) fail("lotQty", "invalid");

  const receiptDate = optionalDate("receiptDate", input.receiptDate);
  const description = optionalText("description", input.description, 400);
  const manufacturer = optionalText("manufacturer", input.manufacturer, 200);
  const remarks = optionalText("remarks", input.remarks, 1000);

  const vendor = input.vendorId ? await store.findVendor(input.vendorId) : null;
  if (input.vendorId && !vendor) fail("vendorId", "not_found");
  else if (vendor && !vendor.isActive) fail("vendorId", "inactive");

  const model = input.modelId ? await store.findModel(input.modelId) : null;
  if (!input.modelId) fail("modelId", "required");
  else if (!model) fail("modelId", "not_found");
  else if (!model.isActive) fail("modelId", "inactive");

  // The header belongs to the document: reuse it when the Invoice/PO already exists (BR-01).
  const key = docType && docNo ? { docType, docNoNormalized: normalizeDocNo(docNo) } : null;
  const existing: ReceiptDoc | null = key ? await store.findReceiptDoc(key) : null;
  const settings = await store.qcSettings(now);

  let header: ReceiptDocHeader = { invoiceDate: null, docDate: null, expectedSkuCount: null, department: null, qcDeadline: null, remarks: null };
  if (existing) {
    header = { invoiceDate: existing.invoiceDate, docDate: existing.docDate, expectedSkuCount: existing.expectedSkuCount, department: existing.department, qcDeadline: existing.qcDeadline, remarks: existing.remarks };
  } else if (docType) {
    const invoiceDate = optionalDate("invoiceDate", input.invoiceDate);
    const docDate = optionalDate("docDate", input.docDate);
    const docRemarks = optionalText("docRemarks", input.docRemarks, 1000);
    const sku = input.expectedSkuCount ?? null;
    if (sku !== null && (!Number.isInteger(sku) || sku < 1 || sku > 10_000)) fail("expectedSkuCount", "invalid");
    const department = text(input.department);
    if (docType === "INVOICE") {
      if (!invoiceDate) fail("invoiceDate", "required");
    } else if (!department) fail("department", "required");
    else if (!(DEPARTMENTS as readonly string[]).includes(department)) fail("department", "invalid");
    header = {
      invoiceDate: docType === "INVOICE" ? invoiceDate : null,
      docDate: docType === "PO" ? docDate : null,
      expectedSkuCount: sku,
      department: docType === "PO" ? department : null,
      qcDeadline: docType === "INVOICE" && invoiceDate && validDate(invoiceDate) ? qcDeadline(invoiceDate, settings.deadlineDays) : null,
      remarks: docRemarks,
    };
  }

  // Opening a plan needs a vendor (user 11 Nov 2026): the one picked here (an existing document keeps its own).
  if (!vendor && !existing && !errors.vendorId) fail("vendorId", "required");

  if (Object.keys(errors).length > 0 || !key || !docNo || !model || !input.lotQty) return { kind: "invalid", errors };

  const required = qcRequired(input.lotQty, settings.qcPercent);
  // An own-factory PO number is the production order (เลขที่ผลิต); the plan keeps it for look-back while plan_no
  // stays the Common ID (user, 28 Oct 2026). Derived here, never taken from the browser.
  const productionWoNo = key.docType === "PO" ? key.docNoNormalized : null;
  const result = await store.openPlan({
    doc: { ...key, docNo, vendorId: vendor?.id ?? null, header },
    modelId: model.id,
    description: description ?? model.description,
    manufacturer,
    lotQty: input.lotQty,
    receiptDate,
    remarks,
    productionWoNo,
    qcPercent: settings.qcPercent,
    qcRequired: required,
    period: periodOf(now),
    openedBy: context.actorId,
  });
  return { ...result, qcRequired: required, productionWoNo };
}

export type DocLookup =
  | { kind: "incomplete" }
  | { kind: "new"; docNoNormalized: string }
  | { kind: "found"; docNoNormalized: string; header: ReceiptDocHeader; vendorId: number | null; vendorName: string | null; plans: DocPlan[] };

/**
 * Does this Invoice/PO already exist (BR-01)? Drives the form: a known document shows its header
 * read-only and the plans already opened, so the user sees a duplicate Model before saving.
 */
export async function lookupReceiptDoc(store: PlanStore, input: { docType: string; docNo: string }): Promise<DocLookup> {
  const docNo = text(input.docNo);
  if ((input.docType !== "INVOICE" && input.docType !== "PO") || !docNo || docNo.length > 64) return { kind: "incomplete" };
  const docNoNormalized = normalizeDocNo(docNo);
  const doc = await store.findReceiptDoc({ docType: input.docType, docNoNormalized });
  if (!doc) return { kind: "new", docNoNormalized };
  const { invoiceDate, docDate, expectedSkuCount, department, qcDeadline: deadline, remarks } = doc;
  return {
    kind: "found", docNoNormalized, header: { invoiceDate, docDate, expectedSkuCount, department, qcDeadline: deadline, remarks },
    vendorId: doc.vendorId, vendorName: doc.vendorName, plans: await store.docPlans(doc.id),
  };
}

export type CancelPlanOutcome =
  | { kind: "cancelled"; planNo: string; from: PlanStatus }
  | { kind: "not_found" }
  | { kind: "reason_required" }
  | { kind: "reason_too_long" }
  | { kind: "blocked"; block: CancelBlock }
  /** The plan changed status after the page loaded — reload and decide again. */
  | { kind: "changed" };

/** BR-13 / docs/15 §3: cancel with a reason. Page permission (plan-open) is checked by the caller; `isHead` = QC or QA Head. */
export async function cancelPlan(
  store: PlanStore,
  input: { planId: number; reason: string | null | undefined; isHead: boolean },
  context: { actorId: string },
): Promise<CancelPlanOutcome> {
  const reason = text(input.reason);
  if (!reason) return { kind: "reason_required" };
  if (reason.length > MAX_CANCEL_REASON) return { kind: "reason_too_long" };
  const plan = await store.getPlan(input.planId);
  if (!plan) return { kind: "not_found" };
  const block = cancelBlock({ status: plan.status, qcDoneTotal: plan.qcDoneTotal, isHead: input.isHead });
  if (block) return { kind: "blocked", block };
  const done = await store.cancelPlan(plan.id, { from: plan.status, by: context.actorId, reason });
  return done ? { kind: "cancelled", planNo: plan.planNo, from: plan.status } : { kind: "changed" };
}

export type WaitingGoodsOutcome = { kind: "saved"; planNo: string; before: boolean } | { kind: "not_found" } | { kind: "blocked" };

/** FR-PLAN-17 "รอของ": a flag on live plans; it keeps a plan out of "ตรวจขาด/ลืม" (BR-12). */
export async function setWaitingGoods(store: PlanStore, input: { planId: number; value: boolean }, context: { actorId: string }): Promise<WaitingGoodsOutcome> {
  const plan = await store.getPlan(input.planId);
  if (!plan) return { kind: "not_found" };
  if (!canFlagWaitingGoods(plan.status)) return { kind: "blocked" };
  const saved = await store.setWaitingGoods(plan.id, input.value, context.actorId);
  return saved ? { kind: "saved", planNo: plan.planNo, before: plan.waitingGoods } : { kind: "blocked" };
}

export type SetPlanVendorOutcome =
  | { kind: "saved"; docId: number; docNo: string; before: number | null; after: number | null; planNos: string[] }
  | { kind: "not_found" }
  | { kind: "plan_cancelled" }
  | { kind: "vendor_not_found" }
  | { kind: "vendor_inactive" };

/**
 * Fill in or change the vendor of a plan's Invoice/PO after it was opened (user 23 Oct 2026): the warehouse
 * tells the QC Head, who sets it here at any time. Every plan and work order of the document follows.
 * Page permission (plan-open) is checked by the caller. null clears it.
 */
export async function setPlanVendor(store: PlanStore, input: { planId: number; vendorId: number | null }, context: { actorId: string }): Promise<SetPlanVendorOutcome> {
  if (input.vendorId !== null) {
    const vendor = await store.findVendor(input.vendorId);
    if (!vendor) return { kind: "vendor_not_found" };
    if (!vendor.isActive) return { kind: "vendor_inactive" };
  }
  const result = await store.setDocVendor(input.planId, { vendorId: input.vendorId, by: context.actorId });
  if (result.kind !== "saved") return result;
  return { kind: "saved", docId: result.docId, docNo: result.docNo, before: result.before, after: input.vendorId, planNos: result.planNos };
}

export type IncompleteWorkOrderInfo = {
  woNo: string;
  qtyNeed: number;
  qtyDone: number;
  reworkCount: number;
  status: string;
};

export type SubmitToQaOutcome =
  | { kind: "submitted"; planNo: string; from: PlanStatus }
  | { kind: "not_found" }
  | { kind: "no_work_orders" }
  | { kind: "quota_not_met"; qcDone: number; qcRequired: number }
  | { kind: "rework_pending"; reworkCount: number }
  | { kind: "work_orders_incomplete"; incompleteWorkOrders: IncompleteWorkOrderInfo[] }
  | { kind: "invalid_status"; status: PlanStatus }
  | { kind: "changed" };

/**
 * BR-07 / FR-RPT-06: QC Head approves completed inspection results and submits the plan to QA queue.
 * Conditions:
 * 1. Plan exists and status is QC_REVIEW, QC_IN_PROGRESS, or ASSIGNED.
 * 2. qc_done >= qc_required.
 * 3. reworkCount == 0 (no open reworks across the plan).
 * 4. At least one work order exists.
 * 5. Every active work order (including additional call-ins opened) is complete:
 *    - qtyDone >= qtyNeed
 *    - reworkCount == 0
 *    - status !== 'RETURNED'
 */
export async function submitPlanToQa(
  store: PlanStore,
  inspectionStore: InspectionStore,
  input: { planId: number; remarks?: string | null },
  context: { actorId: string; actorName?: string },
): Promise<SubmitToQaOutcome> {
  const plan = await store.getPlan(input.planId);
  if (!plan) return { kind: "not_found" };

  if (plan.status !== "QC_REVIEW" && plan.status !== "QC_IN_PROGRESS" && plan.status !== "ASSIGNED") {
    return { kind: "invalid_status", status: plan.status };
  }

  // 1. Overall plan quota check: qcDoneTotal >= qcRequired
  if (plan.qcDoneTotal < plan.qcRequired) {
    return { kind: "quota_not_met", qcDone: plan.qcDoneTotal, qcRequired: plan.qcRequired };
  }

  // 2. Overall rework check: no open rework on any machine
  const summary = await inspectionStore.getPlanInspectionSummary(input.planId);
  if (summary.reworkCount > 0) {
    return { kind: "rework_pending", reworkCount: summary.reworkCount };
  }

  // 3. Work orders check: must have at least one work order, and all active work orders (including additional call-ins) must be complete
  const workOrders = await store.workOrdersOf(input.planId);
  if (workOrders.length === 0) {
    return { kind: "no_work_orders" };
  }

  let reworks: { planId: number; workOrderId: string }[] = [];
  try {
    reworks = await inspectionStore.getPendingReworks();
  } catch {
    reworks = [];
  }
  const reworkMap = new Map<string, number>();
  for (const rw of reworks) {
    if (rw.planId === input.planId) {
      reworkMap.set(rw.workOrderId, (reworkMap.get(rw.workOrderId) ?? 0) + 1);
    }
  }

  const activeWorkOrders = workOrders.filter(
    (wo) => wo.status !== "CANCELLED" && wo.status !== "FAILED",
  );

  const incompleteWorkOrders: IncompleteWorkOrderInfo[] = [];
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

  if (incompleteWorkOrders.length > 0) {
    return {
      kind: "work_orders_incomplete",
      incompleteWorkOrders,
    };
  }

  const reason = text(input.remarks) ?? "QC Head ตรวจทานเรียบร้อย ส่งต่อ QA";
  const done = await store.submitPlanToQa(plan.id, { from: plan.status, by: context.actorId, reason });
  return done ? { kind: "submitted", planNo: plan.planNo, from: plan.status } : { kind: "changed" };
}

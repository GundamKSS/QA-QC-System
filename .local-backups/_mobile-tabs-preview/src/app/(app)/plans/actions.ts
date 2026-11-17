"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { audit, auditContext } from "@/lib/auth/audit";
import { requirePageAccess } from "@/lib/auth/dal";
import { resolveActorId } from "@/lib/db/actor";
import { dbConfigured } from "@/lib/db/config";
import { dbProblem, dbProblemMessages, isDbError } from "@/lib/db/errors";
import { fieldErrorMessage, parseOpenPlanForm, type OpenPlanFormValues } from "@/lib/plans/form";
import { getPlanStore } from "@/lib/plans/runtime";
import { MAX_CANCEL_REASON } from "@/lib/plans/rules";
import { cancelPlan, lookupReceiptDoc, openPlan, setWaitingGoods, type DocLookup, type OpenPlanField } from "@/lib/plans/service";
import {
  cancelWorkOrder, openWorkOrder, parseAssignees, parseCount, setWorkOrderAssignees, workOrderErrorMessage, type WorkOrderField,
} from "@/lib/plans/work-orders";

export type OpenPlanFormState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: Partial<Record<OpenPlanField, string>>; values: OpenPlanFormValues; at: number }
  /** BR-01: this Invoice/PO already has a live plan for the Model — link to it instead of opening another. */
  | { status: "duplicate"; planId: number; planNo: string; values: OpenPlanFormValues; at: number };

/** Open an inspection plan (FR-PLAN-01…06). QC Head, QA Head and Admin only (A11); audited. */
export async function openPlanAction(_: OpenPlanFormState, formData: FormData): Promise<OpenPlanFormState> {
  const at = Date.now();
  const actor = await requirePageAccess("plan-open", "/plans/new");
  const { input, values } = parseOpenPlanForm((key) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : null;
  });

  let planId: number;
  try {
    // Office users' session id is their employee code; plans need the users.id synced at login.
    const actorId = await actorIdOf(actor);
    if (!actorId) return { status: "error", message: NO_ACCOUNT, values, at };

    const result = await openPlan(getPlanStore(), input, { actorId });
    if (result.kind === "invalid") {
      const fieldErrors = Object.fromEntries(
        Object.entries(result.errors).map(([field, error]) => [field, fieldErrorMessage(field as OpenPlanField, error!)]),
      ) as Partial<Record<OpenPlanField, string>>;
      return { status: "error", message: "กรุณาแก้ช่องที่มีปัญหา", fieldErrors, values, at };
    }
    if (result.kind === "duplicate") return { status: "duplicate", planId: result.planId, planNo: result.planNo, values, at };

    planId = result.planId;
    audit(
      {
        action: "plan.open",
        employeeCode: actor.employeeCode,
        userId: actor.id,
        entity: { type: "plans", id: String(result.planId) },
        after: { planNo: result.planNo, docType: input.docType, docNo: input.docNo, vendorId: input.vendorId, modelId: input.modelId, lotQty: input.lotQty, qcRequired: result.qcRequired },
        detail: { headerReused: result.headerReused },
      },
      auditContext(await headers()),
    );
  } catch (error) {
    if (!isDbError(error)) throw error;
    console.error("[db] plans action failed", error.message);
    return { status: "error", message: dbProblemMessages[dbProblem(error)], values, at };
  }
  revalidatePath("/plans");
  revalidatePath("/home");
  // K4 (docs/14): back to the form with a success bar and "open the next Model of this Invoice".
  redirect(`/plans/new?opened=${planId}`);
}

/** Checks whether the typed Invoice/PO already exists (K3: called when the field loses focus). */
export async function lookupReceiptDocAction(input: { docType: string; docNo: string; vendorId: number | null }): Promise<DocLookup | { kind: "error"; message: string }> {
  await requirePageAccess("plan-open", "/plans/new");
  try {
    return await lookupReceiptDoc(getPlanStore(), {
      docType: String(input?.docType ?? ""),
      docNo: String(input?.docNo ?? "").slice(0, 200),
      vendorId: Number.isInteger(input?.vendorId) ? input.vendorId : null,
    });
  } catch (error) {
    if (!isDbError(error)) throw error;
    console.error("[db] plans action failed", error.message);
    return { kind: "error", message: dbProblemMessages[dbProblem(error)] };
  }
}

/** Result of the small forms on the plan page (cancel, รอของ). `at` re-keys the form after each answer. */
export type PlanActionState = { status: "idle" } | { status: "error"; message: string; at: number } | { status: "done"; at: number };

const planIdOf = (formData: FormData) => {
  const raw = formData.get("planId");
  return typeof raw === "string" && /^\d{1,12}$/.test(raw) ? Number(raw) : null;
};

/** Signed-in user's users.id for created_by-style columns (office users are looked up by employee code). */
async function actorIdOf(actor: { id: string }) {
  return dbConfigured() ? await resolveActorId(actor.id) : actor.id;
}

const NO_ACCOUNT = "ไม่พบบัญชีของคุณในฐานข้อมูล QCheck — กรุณาออกจากระบบแล้วเข้าใหม่";
const CANCEL_MESSAGES = {
  not_found: "ไม่พบแผนนี้",
  reason_required: "กรุณาใส่เหตุผลที่ยกเลิก",
  reason_too_long: `เหตุผลยาวเกิน ${MAX_CANCEL_REASON} ตัวอักษร`,
  changed: "สถานะแผนเพิ่งเปลี่ยน — โหลดหน้าใหม่แล้วลองอีกครั้ง",
  status: "แผนในสถานะนี้ยกเลิกไม่ได้",
  head_only: "แผนนี้มีผลตรวจแล้ว — ต้องให้ QC Head หรือ QA Head ยกเลิก",
} as const;

function revalidatePlan(planId: number) {
  revalidatePath("/plans");
  revalidatePath(`/plans/${planId}`);
  revalidatePath("/home");
}

/** Cancel a plan with a reason (BR-13, docs/15 §3). Audited; the same Invoice + Model can then be opened again. */
export async function cancelPlanAction(_: PlanActionState, formData: FormData): Promise<PlanActionState> {
  const at = Date.now();
  const planId = planIdOf(formData);
  const actor = await requirePageAccess("plan-open", planId ? `/plans/${planId}` : "/plans");
  if (!planId) return { status: "error", message: CANCEL_MESSAGES.not_found, at };
  const reason = formData.get("reason");
  try {
    const actorId = await actorIdOf(actor);
    if (!actorId) return { status: "error", message: NO_ACCOUNT, at };
    const isHead = actor.roles.includes("QC_HEAD") || actor.roles.includes("QA_HEAD");
    const result = await cancelPlan(getPlanStore(), { planId, reason: typeof reason === "string" ? reason : null, isHead }, { actorId });
    if (result.kind === "blocked") return { status: "error", message: CANCEL_MESSAGES[result.block], at };
    if (result.kind !== "cancelled") return { status: "error", message: CANCEL_MESSAGES[result.kind], at };
    audit(
      {
        action: "plan.cancel",
        employeeCode: actor.employeeCode,
        userId: actor.id,
        entity: { type: "plans", id: String(planId) },
        before: { status: result.from },
        after: { status: "CANCELLED" },
        detail: { planNo: result.planNo, reason: String(reason).trim() },
      },
      auditContext(await headers()),
    );
  } catch (error) {
    if (!isDbError(error)) throw error;
    console.error("[db] plans action failed", error.message);
    return { status: "error", message: dbProblemMessages[dbProblem(error)], at };
  }
  revalidatePlan(planId);
  return { status: "done", at };
}

/** Tick / untick "รอของ" (FR-PLAN-17) — saved at once and audited. */
export async function setWaitingGoodsAction(_: PlanActionState, formData: FormData): Promise<PlanActionState> {
  const at = Date.now();
  const planId = planIdOf(formData);
  const actor = await requirePageAccess("plan-open", planId ? `/plans/${planId}` : "/plans");
  if (!planId) return { status: "error", message: "ไม่พบแผนนี้", at };
  const value = formData.get("value") === "1";
  try {
    const actorId = await actorIdOf(actor);
    if (!actorId) return { status: "error", message: NO_ACCOUNT, at };
    const result = await setWaitingGoods(getPlanStore(), { planId, value }, { actorId });
    if (result.kind === "not_found") return { status: "error", message: "ไม่พบแผนนี้", at };
    if (result.kind === "blocked") return { status: "error", message: "แผนที่ยกเลิกหรือเสร็จแล้วติ๊ก “รอของ” ไม่ได้", at };
    audit(
      {
        action: "plan.waiting_goods",
        employeeCode: actor.employeeCode,
        userId: actor.id,
        entity: { type: "plans", id: String(planId) },
        before: { waitingGoods: result.before },
        after: { waitingGoods: value },
        detail: { planNo: result.planNo },
      },
      auditContext(await headers()),
    );
  } catch (error) {
    if (!isDbError(error)) throw error;
    console.error("[db] plans action failed", error.message);
    return { status: "error", message: dbProblemMessages[dbProblem(error)], at };
  }
  revalidatePlan(planId);
  return { status: "done", at };
}

/** The open-work-order form as typed, so an error doesn't wipe it (docs/16 §2 6b). */
export type WorkOrderFormValues = { calledDate: string; calledQty: string; remarks: string; assignees: string[] };

export type WorkOrderFormState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      fieldErrors?: Partial<Record<WorkOrderField, string>>;
      /** People who are no longer active QC Inspectors — the form names them from its list. */
      unavailable?: string[];
      values: WorkOrderFormValues;
      at: number;
    };

const WORK_ORDER_ID = /^[\w-]{1,40}$/;
const formText = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
};

function revalidateWorkOrders(planId: number) {
  revalidatePlan(planId);
  revalidatePath("/jobs");
}

/** Open one call-in of a plan and assign 2–5 QC (FR-JOB-00/01, docs/16). QC Head + Admin (W1); audited. */
export async function openWorkOrderAction(_: WorkOrderFormState, formData: FormData): Promise<WorkOrderFormState> {
  const at = Date.now();
  const planId = planIdOf(formData);
  const actor = await requirePageAccess("work-order", planId ? `/plans/${planId}/work-orders/new` : "/plans");
  const get = (key: string) => formText(formData, key);
  const assignees = parseAssignees(get);
  const values: WorkOrderFormValues = {
    calledDate: get("calledDate") ?? "",
    calledQty: get("calledQty") ?? "",
    remarks: get("remarks") ?? "",
    assignees: assignees.map((id) => id ?? ""),
  };
  if (!planId) return { status: "error", message: "ไม่พบแผนนี้", values, at };

  let woNo: string;
  try {
    const actorId = await actorIdOf(actor);
    if (!actorId) return { status: "error", message: NO_ACCOUNT, values, at };
    const result = await openWorkOrder(
      getPlanStore(),
      { planId, calledQty: parseCount(get("calledQty")), calledDate: get("calledDate"), assignees, remarks: get("remarks") },
      { actorId },
    );
    if (result.kind === "plan_not_found") return { status: "error", message: "ไม่พบแผนนี้", values, at };
    if (result.kind === "plan_closed") return { status: "error", message: "แผนนี้เสร็จ ยกเลิก หรือถูกพักล็อตแล้ว — เปิดใบงานไม่ได้", values, at };
    if (result.kind === "invalid") {
      const fieldErrors = Object.fromEntries(
        Object.entries(result.errors).map(([field, error]) => [field, workOrderErrorMessage(field as WorkOrderField, error!, { remaining: result.remaining, minimum: result.minimum, sameDayWoNo: result.sameDayWoNo })]),
      ) as Partial<Record<WorkOrderField, string>>;
      // Someone was deactivated meanwhile: refresh the page so the list drops them.
      if (result.unavailable) revalidatePath(`/plans/${planId}/work-orders/new`);
      return { status: "error", message: "กรุณาแก้ช่องที่มีปัญหา", fieldErrors, unavailable: result.unavailable, values, at };
    }
    woNo = result.woNo;
    audit(
      {
        action: "work_order.open",
        employeeCode: actor.employeeCode,
        userId: actor.id,
        entity: { type: "work_orders", id: result.id },
        after: { woNo, planId, calledQty: Number(values.calledQty.replace(/,/g, "")), calledDate: values.calledDate, type: result.type, need: result.need, assignees: result.assigneeIds },
      },
      auditContext(await headers()),
    );
  } catch (error) {
    if (!isDbError(error)) throw error;
    console.error("[db] plans action failed", error.message);
    return { status: "error", message: dbProblemMessages[dbProblem(error)], values, at };
  }
  revalidateWorkOrders(planId);
  redirect(`/plans/${planId}?${new URLSearchParams({ tab: "work", opened: woNo })}`);
}

const WORK_ORDER_LOCKED = "ใบงานนี้ส่งแล้ว ปิดแล้ว หรือยกเลิกแล้ว — แก้ไม่ได้";

/** Change the people of an open work order (docs/16 W4). Audited before → after. */
export async function setWorkOrderAssigneesAction(_: PlanActionState, formData: FormData): Promise<PlanActionState> {
  const at = Date.now();
  const workOrderId = formText(formData, "workOrderId") ?? "";
  const planId = planIdOf(formData);
  const actor = await requirePageAccess("work-order", planId ? `/plans/${planId}?tab=work` : "/plans");
  if (!WORK_ORDER_ID.test(workOrderId)) return { status: "error", message: "ไม่พบใบงานนี้", at };
  try {
    const actorId = await actorIdOf(actor);
    if (!actorId) return { status: "error", message: NO_ACCOUNT, at };
    const result = await setWorkOrderAssignees(getPlanStore(), { workOrderId, assignees: parseAssignees((key) => formText(formData, key)) }, { actorId });
    if (result.kind === "invalid") return { status: "error", message: workOrderErrorMessage("assignees", result.error), at };
    if (result.kind === "not_found") return { status: "error", message: "ไม่พบใบงานนี้", at };
    if (result.kind === "locked") return { status: "error", message: WORK_ORDER_LOCKED, at };
    if (result.kind === "assignees_unavailable") return { status: "error", message: workOrderErrorMessage("assignees", "unavailable"), at };
    audit(
      {
        action: "work_order.assignees",
        employeeCode: actor.employeeCode,
        userId: actor.id,
        entity: { type: "work_orders", id: workOrderId },
        before: { assignees: result.before },
        after: { assignees: parseAssignees((key) => formText(formData, key)).filter(Boolean) },
        detail: { woNo: result.woNo },
      },
      auditContext(await headers()),
    );
    revalidateWorkOrders(result.planId);
  } catch (error) {
    if (!isDbError(error)) throw error;
    console.error("[db] plans action failed", error.message);
    return { status: "error", message: dbProblemMessages[dbProblem(error)], at };
  }
  return { status: "done", at };
}

/** Cancel a work order with no results yet (docs/16 W4); its quantity returns to the lot. Audited. */
export async function cancelWorkOrderAction(_: PlanActionState, formData: FormData): Promise<PlanActionState> {
  const at = Date.now();
  const workOrderId = formText(formData, "workOrderId") ?? "";
  const planId = planIdOf(formData);
  const actor = await requirePageAccess("work-order", planId ? `/plans/${planId}?tab=work` : "/plans");
  if (!WORK_ORDER_ID.test(workOrderId)) return { status: "error", message: "ไม่พบใบงานนี้", at };
  const reason = formText(formData, "reason");
  try {
    const actorId = await actorIdOf(actor);
    if (!actorId) return { status: "error", message: NO_ACCOUNT, at };
    const result = await cancelWorkOrder(getPlanStore(), { workOrderId, reason }, { actorId });
    if (result.kind === "reason_required") return { status: "error", message: CANCEL_MESSAGES.reason_required, at };
    if (result.kind === "reason_too_long") return { status: "error", message: CANCEL_MESSAGES.reason_too_long, at };
    if (result.kind === "not_found") return { status: "error", message: "ไม่พบใบงานนี้", at };
    if (result.kind === "locked") {
      return { status: "error", message: result.block === "has_results" ? "ใบงานนี้มีผลตรวจแล้ว — ยกเลิกไม่ได้" : WORK_ORDER_LOCKED, at };
    }
    audit(
      {
        action: "work_order.cancel",
        employeeCode: actor.employeeCode,
        userId: actor.id,
        entity: { type: "work_orders", id: workOrderId },
        after: { status: "CANCELLED" },
        detail: { woNo: result.woNo, calledQty: result.calledQty, reason: reason?.trim() },
      },
      auditContext(await headers()),
    );
    revalidateWorkOrders(result.planId);
  } catch (error) {
    if (!isDbError(error)) throw error;
    console.error("[db] plans action failed", error.message);
    return { status: "error", message: dbProblemMessages[dbProblem(error)], at };
  }
  return { status: "done", at };
}

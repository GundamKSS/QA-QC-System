import { assigneeSlots, MAX_ASSIGNEES, MAX_CANCEL_REASON, thaiToday, type AssigneeError, type CallInError, type WorkOrderType } from "./rules";
import type { PlanStore, SetAssigneesResult } from "./store";

/** What the open-work-order form sends (FR-JOB-00/01, docs/16 §4). `assignees` are slots 1–5 in order, "" = empty. */
export type OpenWorkOrderInput = {
  planId: number;
  calledQty: number | null;
  calledDate: string | null;
  assignees: readonly (string | null)[];
  remarks: string | null;
};

export type WorkOrderField = "calledQty" | "calledDate" | "assignees" | "remarks";
export type WorkOrderFieldError = "required" | "invalid" | "future" | "same_day" | "too_long" | CallInError | AssigneeError | "unavailable";

export type OpenWorkOrderOutcome =
  | { kind: "opened"; id: string; woNo: string; type: WorkOrderType; need: number; assigneeIds: string[] }
  | {
      kind: "invalid";
      errors: Partial<Record<WorkOrderField, WorkOrderFieldError>>;
      remaining?: number;
      /** Need when refused for below_need. */
      minimum?: number;
      /** The work order already on that call-in date (same_day). */
      sameDayWoNo?: string;
      unavailable?: string[];
    }
  | { kind: "plan_not_found" }
  | { kind: "plan_closed" };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value: string) => ISO_DATE.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
const text = (value: string | null | undefined) => value?.trim() || null;

function checkAssignees(assignees: readonly (string | null)[]): { ok: true; ids: string[] } | { ok: false; error: AssigneeError } {
  const slots = assigneeSlots(assignees.slice(0, MAX_ASSIGNEES + 1));
  return slots.ok ? { ok: true, ids: slots.assignees.map((item) => item.userId) } : { ok: false, error: slots.error };
}

/**
 * Opens one call-in of a plan (docs/16 §2, docs/17). Checks the form; the store re-checks, with the plan locked,
 * what can change underneath (status, lot left, Need, that day's work order, who is still an active QC Inspector).
 */
export async function openWorkOrder(store: PlanStore, input: OpenWorkOrderInput, context: { actorId: string; now?: Date }): Promise<OpenWorkOrderOutcome> {
  const errors: Partial<Record<WorkOrderField, WorkOrderFieldError>> = {};
  const qty = input.calledQty;
  if (qty === null) errors.calledQty = "required";
  else if (!Number.isInteger(qty) || qty < 1) errors.calledQty = "invalid_qty";

  const date = text(input.calledDate);
  if (!date) errors.calledDate = "required";
  else if (!validDate(date)) errors.calledDate = "invalid";
  // W3: back-dating is fine, a call-in in the future isn't.
  else if (date > thaiToday(context.now ?? new Date())) errors.calledDate = "future";

  const remarks = text(input.remarks);
  if (remarks && remarks.length > 1000) errors.remarks = "too_long";

  const people = checkAssignees(input.assignees);
  if (!people.ok) errors.assignees = people.error;

  if (Object.keys(errors).length > 0 || qty === null || !date || !people.ok) return { kind: "invalid", errors };

  const result = await store.openWorkOrder({ planId: input.planId, calledQty: qty, calledDate: date, remarks, assigneeIds: people.ids, by: context.actorId });
  switch (result.kind) {
    case "opened":
      return { kind: "opened", id: result.id, woNo: result.woNo, type: result.type, need: result.need, assigneeIds: people.ids };
    case "call_in":
      return { kind: "invalid", errors: { calledQty: result.error }, remaining: result.remaining, minimum: result.minimum };
    case "same_day":
      return { kind: "invalid", errors: { calledDate: "same_day" }, sameDayWoNo: result.woNo };
    case "assignees_unavailable":
      return { kind: "invalid", errors: { assignees: "unavailable" }, unavailable: result.userIds };
    case "plan_closed":
      return { kind: "plan_closed" };
    default:
      return { kind: "plan_not_found" };
  }
}

export type SetAssigneesOutcome = SetAssigneesResult | { kind: "invalid"; error: AssigneeError };

/** W4: change the 2–5 people of an open work order. */
export async function setWorkOrderAssignees(
  store: PlanStore,
  input: { workOrderId: string; assignees: readonly (string | null)[] },
  context: { actorId: string },
): Promise<SetAssigneesOutcome> {
  const people = checkAssignees(input.assignees);
  if (!people.ok) return { kind: "invalid", error: people.error };
  return store.setAssignees(input.workOrderId, { assigneeIds: people.ids, by: context.actorId });
}

/** W4: cancel a work order with no results yet; the reason is required. */
export async function cancelWorkOrder(store: PlanStore, input: { workOrderId: string; reason: string | null | undefined }, context: { actorId: string }) {
  const reason = text(input.reason);
  if (!reason) return { kind: "reason_required" as const };
  if (reason.length > MAX_CANCEL_REASON) return { kind: "reason_too_long" as const };
  return store.cancelWorkOrder(input.workOrderId, { by: context.actorId, reason });
}

/** The 5 slot inputs the picker posts (assignee1…assignee5). */
export const ASSIGNEE_FIELDS = Array.from({ length: MAX_ASSIGNEES }, (_, index) => `assignee${index + 1}`);

export function parseAssignees(get: (key: string) => string | null): (string | null)[] {
  return ASSIGNEE_FIELDS.map((key) => get(key)?.trim() || null);
}

/** "200" / "1,200" → number; blank → null; anything else → NaN (reported as invalid). */
export function parseCount(raw: string | null): number | null {
  const value = raw?.replace(/,/g, "").trim() ?? "";
  if (!value) return null;
  return /^\d{1,7}$/.test(value) ? Number(value) : Number.NaN;
}

export function workOrderErrorMessage(
  field: WorkOrderField,
  error: WorkOrderFieldError,
  context: { remaining?: number; minimum?: number; sameDayWoNo?: string; names?: string[] } = {},
): string {
  switch (error) {
    case "required":
      return field === "calledQty" ? "กรุณากรอกจำนวนที่เรียกเข้า" : field === "calledDate" ? "กรุณาเลือกวันที่เรียกเข้า" : "กรุณากรอกข้อมูล";
    case "invalid":
      return "รูปแบบวันที่ไม่ถูกต้อง";
    case "future":
      return "วันที่เรียกเข้าต้องไม่เกินวันนี้";
    case "same_day":
      return `วันนี้มีใบงาน${context.sameDayWoNo ? ` ${context.sameDayWoNo}` : ""} แล้ว — เปิดได้ 1 ใบต่อวัน ใช้ใบเดิมตรวจต่อได้`;
    case "too_long":
      return "ยาวเกิน 1,000 ตัวอักษร";
    case "invalid_qty":
      return "จำนวนต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป";
    case "exceeds_remaining":
      return `เรียกได้ไม่เกิน ${(context.remaining ?? 0).toLocaleString("th-TH")} (คงเหลือของล็อต)`;
    case "below_need":
      return `ต้องเรียกเข้าอย่างน้อย ${(context.minimum ?? 0).toLocaleString("th-TH")} (Need)`;
    case "lot_fully_called":
      return "ล็อตนี้เรียกเข้าครบแล้ว";
    case "first_two_required":
      return "ต้องเลือกผู้ตรวจอย่างน้อย 2 คน (ช่อง 1 และ 2)";
    case "duplicate":
      return "เลือกคนเดียวกันซ้ำ";
    case "too_many":
      return "เลือกได้ไม่เกิน 5 คน";
    case "unavailable":
      return `${context.names?.length ? context.names.join(", ") : "ผู้ตรวจบางคน"} ถูกปิดใช้งานหรือไม่ใช่ QC Inspector แล้ว — เลือกคนอื่น`;
  }
}

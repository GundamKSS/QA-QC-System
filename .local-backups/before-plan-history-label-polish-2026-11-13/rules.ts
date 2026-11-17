/**
 * Plan / work-order rules that don't touch the database (docs/03 BR-01, BR-02, BR-10, BR-11, BR-12;
 * docs/13 Meeting C, docs/17 Meeting D). Kept pure so the numbers the user confirmed are pinned by tests.
 */

export const PLAN_STATUSES = [
  "OPEN",
  "ASSIGNED",
  "QC_IN_PROGRESS",
  "QC_REVIEW",
  "QA_PENDING",
  "QA_IN_PROGRESS",
  "ON_HOLD",
  "QA_LOT_REJECTED",
  "REPORT_REVIEW",
  "COMPLETED",
  "CANCELLED",
] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export type WorkOrderType = "QC" | "CALLIN_FIX";

export const DEFAULT_QC_PERCENT = 10;
/** BR-02 (user 28 Oct 2026): lots up to this size inspect a fixed SMALL_LOT_QC units instead of the %. */
export const SMALL_LOT_MAX = 30;
export const SMALL_LOT_QC = 3;
export const DEFAULT_QC_DEADLINE_DAYS = 90;
export const MIN_ASSIGNEES = 2;
export const MAX_ASSIGNEES = 50;
const MAX_RUN_NO = 9999;
const TIME_ZONE = "Asia/Bangkok";

/** BR-01: trim, collapse inner spaces, upper-case — "inv 001 " and "INV  001" are the same document. */
export function normalizeDocNo(input: string): string {
  return input.normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase();
}

/** ceil(qty × percent / 100) in integers, so 350 × 10% is exactly 35 (percent has ≤ 2 decimals). */
function ceilPercent(qty: number, percent: number): number {
  const basisPoints = Math.round(percent * 100);
  return Math.floor((qty * basisPoints + 9999) / 10000);
}

function assertPercent(percent: number) {
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) throw new RangeError(`qc_percent out of range: ${percent}`);
}

function assertCount(name: string, value: number, min: number) {
  if (!Number.isInteger(value) || value < min) throw new RangeError(`${name} must be an integer ≥ ${min}: ${value}`);
}

/**
 * BR-02 (user 28 Oct 2026): 1–30 units → a fixed 3; 31 and up → ceil(lot × %) — 31→4, 350→35, 500→50.
 * A lot smaller than 3 can't give 3, so it inspects every unit (1→1, 2→2).
 */
export function qcRequired(lotQty: number, percent: number = DEFAULT_QC_PERCENT): number {
  assertCount("lot_qty", lotQty, 1);
  assertPercent(percent);
  if (lotQty <= SMALL_LOT_MAX) return Math.min(lotQty, SMALL_LOT_QC);
  return Math.min(lotQty, ceilPercent(lotQty, percent));
}

export type WorkOrderPlan = {
  /** Work-order type and Need for the next call-in. */
  type: WorkOrderType;
  need: number;
};

/** What the lot still has to inspect: the 10% target minus True so far (never negative). */
const leftToInspect = (qcRequired: number, qcDoneBefore: number) => Math.max(0, qcRequired - qcDoneBefore);

/**
 * BR-02 / docs/17 §1.1 (Meeting D, user confirmed 21 Oct 2026): Need of a call-in = the lot's 10% target
 * minus True so far, whatever is called. It only drops below that when the call-in itself is smaller —
 * the last bit of the lot (see minCallIn). Once True reaches qc_required: CALLIN_FIX ("เรียกเข้าแก้ไข", Need 0).
 * Lot 500 (target 50): first call-in → 50; after 30 inspected → 20; after 50 → CALLIN_FIX 0.
 */
export function planWorkOrder(input: { calledQty: number; qcRequired: number; qcDoneBefore: number }): WorkOrderPlan {
  assertCount("called_qty", input.calledQty, 1);
  assertCount("qc_required", input.qcRequired, 1);
  assertCount("qc_done", input.qcDoneBefore, 0);
  const left = leftToInspect(input.qcRequired, input.qcDoneBefore);
  if (left === 0) return { type: "CALLIN_FIX", need: 0 };
  return { type: "QC", need: Math.min(left, input.calledQty) };
}

/** Inspectors must reach Need; more is fine and counts toward the lot (docs/17 §1.3). */
export function meetsNeed(done: number, need: number): boolean {
  return done >= need;
}

export type OverInspectInput = {
  nextSeq: number;
  qcRequired: number;
  qcDoneTotal: number;
  targetSum?: number | null;
};

/**
 * User confirmed (11 Nov 2026): For work orders #2 onwards, check if the lot has already reached
 * its maximum required inspection (QC Need), or if the assigned targets exceed the remaining QC Need.
 * If true, Head QC must confirm that they want to inspect beyond the requirement.
 */
export function isOverInspect(input: OverInspectInput): boolean {
  if (input.nextSeq < 2) return false;
  if (input.qcDoneTotal >= input.qcRequired) return true;
  const remainingNeed = input.qcRequired - input.qcDoneTotal;
  if (input.targetSum != null && input.targetSum > remainingNeed) return true;
  return false;
}

export type CallInInput = {
  lotQty: number;
  lotCalledTotal: number;
  qcRequired: number;
  qcDoneBefore: number;
  nextSeq?: number;
};

/**
 * docs/17 §1.2 & User 11 Nov 2026:
 * - Call-in #1 (the first sheet): must bring in at least Need. When less than that is left uncalled,
 *   the rest of the lot is the most anyone can call, so that becomes the minimum.
 * - Call-in #2 onwards: can start at any quantity (minimum is 1, up to remaining).
 */
export function minCallIn(input: CallInInput): number {
  const remaining = input.lotQty - input.lotCalledTotal;
  if (remaining <= 0) return 0;
  const isSubsequent = input.nextSeq != null ? input.nextSeq >= 2 : input.lotCalledTotal > 0;
  if (isSubsequent) return 1;
  return Math.min(leftToInspect(input.qcRequired, input.qcDoneBefore), remaining);
}

export type CallInError = "invalid_qty" | "below_need" | "exceeds_remaining" | "lot_fully_called";

/**
 * A call-in may not exceed the part of the lot that hasn't been called yet.
 * On call-in #1, it may not fall below Need; on call-in #2 onwards, it can start at any quantity (≥ 1).
 */
export function callInError(input: CallInInput & { calledQty: number }): CallInError | null {
  const remaining = input.lotQty - input.lotCalledTotal;
  if (remaining <= 0) return "lot_fully_called";
  if (!Number.isInteger(input.calledQty) || input.calledQty < 1) return "invalid_qty";
  if (input.calledQty > remaining) return "exceeds_remaining";
  const isFirstCallIn = input.nextSeq != null ? input.nextSeq === 1 : input.lotCalledTotal === 0;
  if (isFirstCallIn && input.calledQty < minCallIn(input)) return "below_need";
  return null;
}

/** docs/17 §1.4: one work order per plan per call-in date; cancelled ones don't count. */
export const takesCallInDate = (status: WorkOrderStatus) => status !== "CANCELLED";

/**
 * docs/17 §1.5 (user 21 Oct 2026): once True reaches the 10% target and the whole lot has been called,
 * open work orders nobody inspected anything on become FAILED ("ไม่สำเร็จ") — kept as history only and
 * left out of every count. A เรียกเข้าแก้ไข work order (Need 0) has nothing to miss, so it never fails.
 */
export function lotSettled(input: { lotQty: number; lotCalledTotal: number; qcRequired: number; qcDoneTotal: number }): boolean {
  return input.qcDoneTotal >= input.qcRequired && input.lotCalledTotal >= input.lotQty;
}

export const failsWhenSettled = (wo: { status: WorkOrderStatus; qtyNeed: number; qtyDone: number }) =>
  OPEN_WORK_ORDER_STATUSES.includes(wo.status) && wo.qtyNeed > 0 && wo.qtyDone === 0;

/** Serial as compared for True: NFKC, no spaces, upper-case — " sn 001" and "SN001" are one unit. */
export function normalizeSerial(serial: string): string {
  return serial.normalize("NFKC").replace(/\s+/g, "").toUpperCase();
}

/**
 * docs/17 §1.3: True counts each Serial once per plan, whichever work order submits it (so copying a
 * result without changing the Serial doesn't add to the count). Returns the Serials new to the plan.
 */
export function newSerials(seen: ReadonlySet<string>, serials: readonly string[]): string[] {
  const fresh = new Set<string>();
  for (const serial of serials) {
    const key = normalizeSerial(serial);
    if (key && !seen.has(key)) fresh.add(key);
  }
  return [...fresh];
}

/** YYMM of a moment in Thai time (BR-19) — the run number restarts every month (BR-10). */
export function periodOf(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "2-digit", month: "2-digit" }).formatToParts(at);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}${part("month")}`;
}

/** BR-10: QP-YYMM-NNNN, e.g. QP-2610-0001. */
export function formatPlanNo(period: string, runNo: number): string {
  if (!/^\d{4}$/.test(period)) throw new RangeError(`period must be YYMM: ${period}`);
  assertCount("run_no", runNo, 1);
  if (runNo > MAX_RUN_NO) throw new RangeError(`plan run number exceeded ${MAX_RUN_NO} in ${period}`);
  return `QP-${period}-${String(runNo).padStart(4, "0")}`;
}

/** Work order = <plan no>-<call-in seq>, e.g. QP-2610-0001-1 (user confirmed 20 Oct 2026). */
export function formatWorkOrderNo(planNo: string, seq: number): string {
  assertCount("seq", seq, 1);
  return `${planNo}-${seq}`;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseIsoDate(value: string): number {
  const match = ISO_DATE.exec(value);
  if (!match) throw new RangeError(`expected YYYY-MM-DD: ${value}`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const ms = Date.UTC(year, month - 1, day);
  const date = new Date(ms);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new RangeError(`not a date: ${value}`);
  return ms;
}

const DAY_MS = 86_400_000;

/** BR-11: QC must finish every SKU of the Invoice by invoice date + 90 days. */
export function qcDeadline(invoiceDate: string, days: number = DEFAULT_QC_DEADLINE_DAYS): string {
  assertCount("deadline days", days, 0);
  return new Date(parseIsoDate(invoiceDate) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Today's date (YYYY-MM-DD) in Thai time. */
export function thaiToday(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Countdown for the list/detail screens: negative once overdue (red flag). */
export function daysLeft(deadline: string, today: string): number {
  return Math.round((parseIsoDate(deadline) - parseIsoDate(today)) / DAY_MS);
}

export type Progress = "NOT_STARTED" | "IN_PROGRESS" | "AWAITING_CLOSE" | "DONE" | "OVER" | "UNDER";

/**
 * BR-12 progress. "inspected" counts QC units whose final result is PASS / CONCESSION / REJECTED;
 * "required" includes escalation (BR-02a). Cancelled plans are not counted (null).
 */
export function progressOf(input: {
  status: PlanStatus;
  inspected: number;
  required: number;
  hasOpenRework?: boolean;
  forceClosed?: boolean;
  /** Past due_at — only matters while nothing has been inspected. */
  overdue?: boolean;
  waitingGoods?: boolean;
}): Progress | null {
  const { status, inspected, required } = input;
  if (status === "CANCELLED") return null;
  if (status === "COMPLETED") {
    if (input.forceClosed || inspected < required) return "UNDER";
    return inspected > required ? "OVER" : "DONE";
  }
  if (input.hasOpenRework) return "IN_PROGRESS";
  if (inspected === 0) return input.overdue && !input.waitingGoods ? "UNDER" : "NOT_STARTED";
  return inspected < required ? "IN_PROGRESS" : "AWAITING_CLOSE";
}

export const PROGRESS_LABELS: Record<Progress, string> = {
  NOT_STARTED: "ยังไม่เริ่ม",
  IN_PROGRESS: "กำลังดำเนินการ",
  AWAITING_CLOSE: "ตรวจครบ-รอปิด",
  DONE: "เสร็จ",
  OVER: "ตรวจเกิน",
  UNDER: "ตรวจขาด",
};

/** "สถานะ Checklist" in the plan list (FR-PLAN-16) — the mapping table in docs/03 §2.1, one wording everywhere. */
export const CHECKLIST_STATUSES = {
  NOT_INSPECTED: { label: "ยังไม่ตรวจ", statuses: ["OPEN", "ASSIGNED"] },
  INSPECTING: { label: "กำลังตรวจ", statuses: ["QC_IN_PROGRESS"] },
  QC_REVIEW: { label: "QC ครบ – รอหัวหน้าตรวจทาน", statuses: ["QC_REVIEW"] },
  QA: { label: "รอ QA / QA กำลังตรวจ", statuses: ["QA_PENDING", "QA_IN_PROGRESS"] },
  // ON_HOLD isn't in the §2.1 table; the state diagram calls it "QA Head พักล็อต" (H4).
  QA_HOLD: { label: "QA พักล็อต", statuses: ["ON_HOLD"] },
  QA_LOT_REJECTED: { label: "QA ตีกลับทั้งล็อต", statuses: ["QA_LOT_REJECTED"] },
  REPORT_REVIEW: { label: "รออนุมัติ Report", statuses: ["REPORT_REVIEW"] },
  DONE: { label: "เสร็จ", statuses: ["COMPLETED"] },
  CANCELLED: { label: "ยกเลิก", statuses: ["CANCELLED"] },
} as const satisfies Record<string, { label: string; statuses: readonly PlanStatus[] }>;
export type ChecklistStatus = keyof typeof CHECKLIST_STATUSES;

export function checklistStatusOf(status: PlanStatus): ChecklistStatus {
  const entry = Object.entries(CHECKLIST_STATUSES).find(([, value]) => (value.statuses as readonly PlanStatus[]).includes(status));
  if (!entry) throw new RangeError(`unmapped plan status: ${status}`);
  return entry[0] as ChecklistStatus;
}

/** opened = newest first (P3), plan_no = QP-… ascending, deadline = nearest 90-day deadline first (FR-PLAN-13). */
export const PLAN_SORTS = ["opened", "plan_no", "deadline"] as const;
export type PlanSort = (typeof PLAN_SORTS)[number];

/** Days before the 90-day deadline that count as "soon" — same orange threshold as the plan list. */
export const DEADLINE_SOON_DAYS = 14;

/** docs/03 §2.1: the statuses with an arrow to CANCELLED. ON_HOLD / QA_LOT_REJECTED / COMPLETED can't be cancelled. */
const CANCELLABLE: readonly PlanStatus[] = ["OPEN", "ASSIGNED", "QC_IN_PROGRESS", "QC_REVIEW", "QA_PENDING", "QA_IN_PROGRESS", "REPORT_REVIEW"];

export type CancelBlock = "status" | "head_only";

/** plans.cancel_reason is NVARCHAR(400). */
export const MAX_CANCEL_REASON = 400;

/**
 * BR-13: before any QC result the plan-open roles may cancel (docs/15 §3); once results exist only
 * a QC/QA Head may, and always with a reason (checked by the caller).
 */
export function cancelBlock(input: { status: PlanStatus; qcDoneTotal: number; isHead: boolean }): CancelBlock | null {
  if (!CANCELLABLE.includes(input.status)) return "status";
  if (input.qcDoneTotal > 0 && !input.isHead) return "head_only";
  return null;
}

/** FR-PLAN-17 "รอของ" is a flag on live plans only. */
export const canFlagWaitingGoods = (status: PlanStatus) => status !== "CANCELLED" && status !== "COMPLETED";

export const WORK_ORDER_STATUSES = ["IN_PROGRESS", "SUBMITTED", "RETURNED", "CLOSED", "FAILED", "CANCELLED"] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  IN_PROGRESS: "กำลังทำ",
  SUBMITTED: "ตรวจครบแล้ว",
  RETURNED: "ถูกตีกลับ",
  CLOSED: "ปิดแล้ว",
  FAILED: "ไม่สำเร็จ",
  CANCELLED: "ยกเลิก",
};

/** J3: "Rework" call-ins are called "เรียกเข้าแก้ไข" so they aren't confused with per-unit Rework sheets. */
export const WORK_ORDER_TYPE_LABELS: Record<WorkOrderType, string> = { QC: "QC", CALLIN_FIX: "เรียกเข้าแก้ไข" };

/** Work orders still in an inspector's hands — they count toward the workload gauge (docs/16 §4.1). */
export const OPEN_WORK_ORDER_STATUSES: readonly WorkOrderStatus[] = ["IN_PROGRESS", "RETURNED"];

/** W7: a new call-in may be opened unless the plan is finished, cancelled or held by QA. */
export const canOpenWorkOrder = (status: PlanStatus) => status !== "COMPLETED" && status !== "CANCELLED" && status !== "ON_HOLD";

/** W4: assignees change only while the work order is open; cancelling also needs no results yet. */
export function workOrderBlock(input: { status: WorkOrderStatus; qtyDone: number }, action: "assignees" | "cancel"): "status" | "has_results" | null {
  if (!OPEN_WORK_ORDER_STATUSES.includes(input.status)) return "status";
  if (action === "cancel" && input.qtyDone > 0) return "has_results";
  return null;
}

export type WorkloadLevel = "LOW" | "MID" | "HIGH";

export const WORKLOAD_LABELS: Record<WorkloadLevel, string> = { LOW: "ว่างรับงาน", MID: "ปานกลาง", HIGH: "งานแน่น" };

/** Mean open work orders per active QC inspector, counting those holding none. */
export function teamAverage(openCounts: readonly number[]): number {
  return openCounts.length === 0 ? 0 : openCounts.reduce((sum, count) => sum + count, 0) / openCounts.length;
}

/** Maximum open work orders among active team members. */
export function teamMax(openCounts: readonly number[]): number {
  return openCounts.length === 0 ? 0 : Math.max(...openCounts);
}

/**
 * Workload gauge:
 * - mode === "max" (Option 1): 100% = max open work orders in the team (at least 1).
 *   Someone holding the maximum sits at 100%. < 50% green, 50–79% orange, ≥ 80% red.
 * - mode === "average" (default): 100% = 2 × team average.
 */
export function workloadOf(
  openCount: number,
  basis: number,
  options?: { mode?: "average" | "max" },
): { percent: number; level: WorkloadLevel; over: boolean } {
  if (options?.mode === "max") {
    if (basis <= 0) {
      const percent = openCount > 0 ? 100 : 0;
      return { percent, level: percent > 0 ? "HIGH" : "LOW", over: false };
    }
    const percent = Math.min(100, Math.round((openCount / basis) * 100));
    return { percent, level: percent >= 80 ? "HIGH" : percent >= 50 ? "MID" : "LOW", over: percent >= 100 };
  }
  const full = 2 * Math.max(basis, 1);
  const percent = Math.round((openCount / full) * 100);
  return { percent, level: percent >= 80 ? "HIGH" : percent >= 50 ? "MID" : "LOW", over: percent >= 100 };
}

export type AssigneeError =
  | "first_two_required"
  | "duplicate"
  | "too_many"
  | "target_qty_mismatch"
  | "invalid_target_qty"
  | "target_qty_incomplete";

/**
 * Splits totalQty evenly across `count` people.
 * If totalQty is not evenly divisible, remainder is added to the first slots.
 * E.g., splitAssigneeTargets(40, 5) -> [8, 8, 8, 8, 8]
 * E.g., splitAssigneeTargets(40, 3) -> [14, 13, 13]
 */
export function splitAssigneeTargets(totalQty: number, count: number): number[] {
  if (count <= 0 || totalQty <= 0) return [];
  const base = Math.floor(totalQty / count);
  const remainder = totalQty % count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * Validates per-person target quantities.
 * - If all targets are null: valid (no per-person allocation specified, shared pool mode).
 * - If any target is provided:
 *   - Each chosen assignee must have an integer target >= 1
 *   - Sum of targets must match totalQty (if totalQty is provided)
 */
export function validateAssigneeTargets(
  targets: readonly (number | null | undefined)[],
  assigneeCount: number,
  totalQty?: number | null,
): { ok: true; targets: (number | null)[] } | { ok: false; error: AssigneeError } {
  const sliced = targets.slice(0, assigneeCount);
  const hasAnyTarget = sliced.some((t) => t !== null && t !== undefined);
  if (!hasAnyTarget) {
    return { ok: true, targets: Array(assigneeCount).fill(null) };
  }
  for (let i = 0; i < assigneeCount; i++) {
    const val = sliced[i];
    if (val === null || val === undefined) {
      return { ok: false, error: "target_qty_incomplete" };
    }
    if (!Number.isInteger(val) || val < 1) {
      return { ok: false, error: "invalid_target_qty" };
    }
  }
  const cleanTargets = sliced as number[];
  const sum = cleanTargets.reduce((acc, curr) => acc + curr, 0);
  if (totalQty !== null && totalQty !== undefined && sum !== totalQty) {
    return { ok: false, error: "target_qty_mismatch" };
  }
  return { ok: true, targets: cleanTargets };
}

/**
 * docs/13 §1.4: 5 slots, slots 1–2 required, so 2–5 people share one work order.
 * Empty optional slots are dropped and the rest renumbered 3, 4, 5.
 */
export function assigneeSlots(userIds: readonly (string | null | undefined)[]):
  | { ok: true; assignees: { slot: number; userId: string }[] }
  | { ok: false; error: AssigneeError } {
  if (userIds.length > MAX_ASSIGNEES) return { ok: false, error: "too_many" };
  const ids = userIds.map((id) => id?.trim() || null);
  if (!ids[0] || !ids[1]) return { ok: false, error: "first_two_required" };
  const chosen = ids.filter((id): id is string => id !== null);
  if (new Set(chosen).size !== chosen.length) return { ok: false, error: "duplicate" };
  return { ok: true, assignees: chosen.map((userId, index) => ({ slot: index + 1, userId })) };
}

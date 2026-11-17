import { CHECKLIST_STATUSES, checklistStatusOf, daysLeft, PROGRESS_LABELS, progressOf, type PlanStatus, type Progress } from "@/lib/plans/rules";

/** Small pieces shared by the plan list, the plan page and the jobs screen (docs/15). No state, so server pages and client views both use them. */

/** D15: dates show as DD/MM/YYYY (ค.ศ.). */
export const dateText = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

/** Thai month names, ค.ศ. year (D15), Thai time. */
export const when = new Intl.DateTimeFormat("th-TH-u-ca-gregory", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

/** BR-12 colours from the current sheet: white / orange / — / grey / green / red. */
const PROGRESS_TONE: Record<Progress, string> = {
  NOT_STARTED: "border-ti-400/60 text-ti-50",
  IN_PROGRESS: "border-ember-500/60 text-ember-400",
  AWAITING_CLOSE: "border-sky-400/50 text-sky-300",
  DONE: "border-carbon-600 text-ti-400",
  OVER: "border-pass/60 text-pass",
  UNDER: "border-fail/60 text-fail",
};

/** Progress of a plan as the list and the page show it. Nothing is inspected yet before work orders (step 7), so due_at / rework are off. */
export function planProgress(plan: { status: PlanStatus; qcDoneTotal: number; qcRequired: number; waitingGoods: boolean }) {
  return progressOf({ status: plan.status, inspected: plan.qcDoneTotal, required: plan.qcRequired, waitingGoods: plan.waitingGoods });
}

export function ProgressBadge({ progress }: { progress: Progress | null }) {
  if (!progress) return null;
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${PROGRESS_TONE[progress]}`}>{PROGRESS_LABELS[progress]}</span>;
}

export function ChecklistBadge({ status }: { status: PlanStatus }) {
  const key = checklistStatusOf(status);
  const tone = key === "CANCELLED" ? "border-fail/50 text-fail" : "border-carbon-600 text-ti-200";
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${tone}`}>{CHECKLIST_STATUSES[key].label}</span>;
}

/** FR-PLAN-13: the Invoice's 90-day deadline with a countdown; red once overdue, orange in the last 14 days. */
export function Deadline({ deadline, today, docType, compact }: { deadline: string | null; today: string; docType: "INVOICE" | "PO"; compact?: boolean }) {
  if (docType === "PO") return <span className="text-ti-500">— (ผลิตเอง)</span>;
  if (!deadline) return <span className="text-ti-500">—</span>;
  const left = daysLeft(deadline, today);
  const tone = left < 0 ? "text-red-300" : left <= 14 ? "text-ember-400" : "text-ti-400";
  const count = left < 0 ? `เลย ${-left} วัน` : `เหลือ ${left} วัน`;
  if (compact) return <span className={tone}>⏱ {count}</span>;
  return (
    <>
      <span className="block text-ti-200">{dateText(deadline)}</span>
      <span className={`block text-xs ${tone}`}>{count}</span>
    </>
  );
}

/** QC inspected / required as a bar (role="progressbar" so screen readers get the numbers). */
export function QcBar({ done, required, className }: { done: number; required: number; className?: string }) {
  const percent = required > 0 ? Math.min(100, Math.round((done / required) * 100)) : 0;
  return (
    <div role="progressbar" aria-label="QC ตรวจแล้ว" aria-valuemin={0} aria-valuemax={required} aria-valuenow={done} className={`h-1.5 overflow-hidden rounded-full bg-carbon-700 ${className ?? ""}`}>
      <div className={`h-full rounded-full ${done >= required ? "bg-pass" : "bg-ember-500"}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useApiAction } from "@/lib/api/client";
import { callInError, formatWorkOrderNo, minCallIn, planWorkOrder, WORK_ORDER_TYPE_LABELS } from "@/lib/plans/rules";
import type { WorkOrderFormState, WorkOrderFormValues } from "@/lib/plans/state";
import type { Inspector } from "@/lib/plans/store";
import type { WorkOrderFormPayload } from "@/lib/plans/work-order-form";
import { ASSIGNEE_FIELDS } from "@/lib/plans/work-orders";
import { AssigneePicker } from "./AssigneePicker";

/** The lot figures of the plan the form works on (a slice of `WorkOrderFormPayload["plan"]`). */
export type WorkOrderPlan = Pick<WorkOrderFormPayload["plan"], "id" | "planNo" | "lotQty" | "lotCalledTotal" | "qcRequired" | "qcDoneTotal" | "qcPercent">;

/** Call-in dates already holding a live work order (docs/17 §1.4: one per day). */
export type TakenDate = WorkOrderFormPayload["takenDates"][number];

const idle: WorkOrderFormState = { status: "idle" };
/** No usable answer (network down): refuse in the form's own words and keep what was typed, read back from the sent form. */
const failed = (message: string, formData: FormData): WorkOrderFormState => {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  return {
    status: "error",
    message,
    values: { calledDate: text("calledDate"), calledQty: text("calledQty"), remarks: text("remarks"), assignees: ASSIGNEE_FIELDS.map(text) },
    at: Date.now(),
  };
};
const inputClass =
  "h-11 w-full rounded-control border border-carbon-600 bg-carbon-900 px-3 text-sm text-ti-50 placeholder:text-ti-500 focus:border-ember-500 aria-[invalid=true]:border-red-500 scroll-mb-52 lg:scroll-mb-0";
const countOf = (raw: string) => {
  const value = raw.replace(/,/g, "").trim();
  return /^\d{1,7}$/.test(value) ? Number(value) : null;
};

/** Open one call-in (docs/16 §4). The numbers here are a live preview; the server decides with the plan locked. */
export function WorkOrderForm({
  plan, nextSeq, takenDates, inspectors, today,
}: { plan: WorkOrderPlan; nextSeq: number; takenDates: TakenDate[]; inspectors: Inspector[]; today: string }) {
  const [state, action, pending] = useApiAction(`/api/plans/${plan.id}/work-orders`, idle, failed);
  const values: WorkOrderFormValues = state.status === "error" ? state.values : { calledDate: today, calledQty: "", remarks: "", assignees: [] };
  // Re-key on every answer so a refused form comes back exactly as typed.
  return (
    <FormBody
      key={state.status === "error" ? state.at : "new"}
      plan={plan} nextSeq={nextSeq} takenDates={takenDates} inspectors={inspectors} today={today} state={state} values={values} action={action} pending={pending}
    />
  );
}

function FormBody({
  plan, nextSeq, takenDates, inspectors, today, state, values, action, pending,
}: {
  plan: WorkOrderPlan; nextSeq: number; takenDates: TakenDate[]; inspectors: Inspector[]; today: string; state: WorkOrderFormState; values: WorkOrderFormValues;
  action: (formData: FormData) => void; pending: boolean;
}) {
  const base = useId();
  const [calledQty, setCalledQty] = useState(values.calledQty);
  const [calledDate, setCalledDate] = useState(values.calledDate);
  const [picked, setPicked] = useState(values.assignees.filter(Boolean));
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const unavailable = state.status === "error" ? (state.unavailable ?? []) : [];

  const remaining = plan.lotQty - plan.lotCalledTotal;
  const lot = { lotQty: plan.lotQty, lotCalledTotal: plan.lotCalledTotal, qcRequired: plan.qcRequired, qcDoneBefore: plan.qcDoneTotal };
  // docs/17 §1.1: Need comes up as soon as the form opens — the lot's target minus what's been inspected.
  const minimum = minCallIn(lot);
  const qty = countOf(calledQty);
  const callIn = qty === null ? null : callInError({ ...lot, calledQty: qty });
  const preview = planWorkOrder({ calledQty: qty !== null && !callIn ? qty : Math.max(1, minimum), qcRequired: plan.qcRequired, qcDoneBefore: plan.qcDoneTotal });
  const sameDay = takenDates.find((taken) => taken.date === calledDate);
  const dateError = errors.calledDate ?? (sameDay ? `วันนี้มีใบงาน ${sameDay.woNo} แล้ว — เปิดได้ 1 ใบต่อวัน ใช้ใบเดิมตรวจต่อได้` : undefined);
  const missing = [qty === null && "จำนวน", picked.length < 2 && `ผู้ตรวจอีก ${2 - picked.length} คน`].filter(Boolean) as string[];
  const blocked = pending || Boolean(callIn) || Boolean(sameDay);

  return (
    <form action={action} noValidate className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-5">
        {state.status === "error" && <p role="alert" className="rounded-control border border-red-500/50 bg-carbon-800 px-3 py-2 text-sm text-red-300">{state.message}</p>}

        <section className="space-y-4 app-panel rounded-panel border border-carbon-700 bg-carbon-800 p-4">
          <h2 className="text-base font-medium text-ti-50">การเรียกเข้าครั้งที่ {nextSeq}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1 text-sm text-ti-400">
              <span>วันที่เรียกเข้า <span className="text-ember-400">*</span></span>
              <input
                type="date"
                name="calledDate"
                value={calledDate}
                onChange={(event) => setCalledDate(event.target.value)}
                max={today}
                required
                aria-invalid={dateError ? true : undefined}
                aria-describedby={dateError ? `${base}-date-error` : undefined}
                className={inputClass}
              />
              {dateError && <span id={`${base}-date-error`} className="block text-xs text-red-300">{dateError}</span>}
            </label>
            <label className="block space-y-1 text-sm text-ti-400">
              <span>จำนวนที่เรียกเข้า <span className="text-ember-400">*</span></span>
              <input
                name="calledQty"
                inputMode="numeric"
                autoComplete="off"
                value={calledQty}
                onChange={(event) => setCalledQty(event.target.value)}
                placeholder={minimum > 0 ? `${minimum.toLocaleString("th-TH")}–${remaining.toLocaleString("th-TH")}` : `ไม่เกิน ${remaining.toLocaleString("th-TH")}`}
                required
                aria-invalid={errors.calledQty || callIn ? true : undefined}
                aria-describedby={`${base}-qty-help`}
                className={inputClass}
              />
              <span id={`${base}-qty-help`} className={`block text-xs ${errors.calledQty || callIn ? "text-red-300" : "text-ti-500"}`}>
                {errors.calledQty ??
                  (callIn === "exceeds_remaining"
                    ? `เรียกได้ไม่เกิน ${remaining.toLocaleString("th-TH")} (คงเหลือของล็อต)`
                    : callIn === "below_need"
                      ? `ต้องเรียกเข้าอย่างน้อย ${minimum.toLocaleString("th-TH")} (Need)`
                      : callIn === "invalid_qty"
                        ? "จำนวนต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป"
                        : `อย่างน้อย ${minimum.toLocaleString("th-TH")} · ล็อต ${plan.lotQty.toLocaleString("th-TH")} · เรียกแล้ว ${plan.lotCalledTotal.toLocaleString("th-TH")} · คงเหลือ ${remaining.toLocaleString("th-TH")}`)}
              </span>
            </label>
          </div>
        </section>

        <section className="space-y-4 app-panel rounded-panel border border-carbon-700 bg-carbon-800 p-4">
          <AssigneePicker inspectors={inspectors} value={picked} onChange={setPicked} error={errors.assignees} unavailable={unavailable} />
        </section>

        <section className="app-panel rounded-panel border border-carbon-700 bg-carbon-800 p-4">
          <label className="block space-y-1 text-sm text-ti-400">
            <span>หมายเหตุ</span>
            <input name="remarks" defaultValue={values.remarks} maxLength={1000} placeholder="ไม่บังคับ" aria-invalid={errors.remarks ? true : undefined} className={inputClass} />
            {errors.remarks && <span className="block text-xs text-red-300">{errors.remarks}</span>}
          </label>
        </section>
      </div>

      {/* Always in view while filling in: above the tab bar on mobile, below the sticky 56px top bar (+50px gap) on laptop. */}
      <aside
        aria-label="สรุปใบงาน"
        className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 space-y-2 app-panel rounded-panel border border-carbon-600 bg-carbon-800/95 p-3 shadow-lg shadow-black/30 backdrop-blur md:bottom-4 lg:top-[calc(4.5rem+50px)] lg:bottom-auto lg:space-y-3 lg:p-4"
      >
        <div className="flex items-end justify-between gap-3 lg:block lg:space-y-3" aria-live="polite">
          <div>
            <p className="font-mono text-sm text-ti-200">{formatWorkOrderNo(plan.planNo, nextSeq)}</p>
            <p className="text-xs text-ti-400">
              ประเภท <span className={preview.type === "CALLIN_FIX" ? "text-ember-400" : "text-ti-50"}>{WORK_ORDER_TYPE_LABELS[preview.type]}</span>
            </p>
          </div>
          <div className="text-right lg:text-left">
            <p className="text-xs text-ti-400">ต้องตรวจ (Need)</p>
            <p className="font-mono text-3xl leading-tight text-ti-50">{preview.need}</p>
          </div>
        </div>
        <p className="hidden text-xs text-ti-500 lg:block">
          {preview.type === "CALLIN_FIX"
            ? "QC ของล็อตครบแล้ว — เรียกเข้าแก้ไข ไม่ต้องตรวจในแอป (ตรวจเพิ่มได้)"
            : `เป้า ${plan.qcPercent}% ของล็อต ${plan.qcRequired} − ตรวจแล้ว ${plan.qcDoneTotal} · ตรวจเกินได้`}
        </p>
        <p className="hidden border-t border-carbon-700 pt-3 text-xs text-ti-400 lg:block">
          เรียกเข้าแล้ว {plan.lotCalledTotal.toLocaleString("th-TH")} → {(plan.lotCalledTotal + (qty !== null && !callIn ? qty : 0)).toLocaleString("th-TH")} / {plan.lotQty.toLocaleString("th-TH")}
        </p>
        <div className="flex gap-2">
          <Link href={`/plans/${plan.id}?tab=work`} className="hidden h-11 items-center rounded-control border border-ti-600 px-4 text-sm text-ti-200 hover:border-ti-400 lg:inline-flex">
            ยกเลิก
          </Link>
          <button type="submit" disabled={blocked} className="h-11 flex-1 rounded-control app-primary-action bg-ember-500 px-4 text-sm font-semibold text-carbon-900 hover:bg-ember-400 disabled:opacity-50">
            {pending ? "กำลังบันทึก…" : "บันทึกใบงาน"}
          </button>
        </div>
        <p className={`text-xs ${missing.length > 0 ? "text-[#fb2c36]" : "text-pass"}`}>{missing.length > 0 ? `ยังขาด: ${missing.join(", ")}` : "✓ พร้อมบันทึก"}</p>
      </aside>
    </form>
  );
}

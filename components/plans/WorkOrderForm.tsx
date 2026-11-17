"use client";

import { HelpTip } from "@/components/dom/HelpTip";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import { useApiAction } from "@/lib/api/client";
import { callInError, formatWorkOrderNo, isOverInspect, MAX_ASSIGNEES, minCallIn, planWorkOrder, WORK_ORDER_TYPE_LABELS } from "@/lib/plans/rules";
import type { WorkOrderFormState, WorkOrderFormValues } from "@/lib/plans/state";
import type { Inspector } from "@/lib/plans/store";
import type { WorkOrderFormPayload } from "@/lib/plans/work-order-form";
import { ASSIGNEE_FIELDS, assigneeFieldName, assigneeTargetFieldName } from "@/lib/plans/work-orders";
import { AssigneePicker } from "./AssigneePicker";

/** The lot figures of the plan the form works on (a slice of `WorkOrderFormPayload["plan"]`). */
export type WorkOrderPlan = Pick<WorkOrderFormPayload["plan"], "id" | "planNo" | "lotQty" | "lotCalledTotal" | "qcRequired" | "qcDoneTotal" | "qcPercent">;

/** Call-in dates already holding a live work order (docs/17 §1.4: one per day). */

const idle: WorkOrderFormState = { status: "idle" };
/** No usable answer (network down): refuse in the form's own words and keep what was typed, read back from the sent form. */
const failed = (message: string, formData: FormData): WorkOrderFormState => {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const assignees: string[] = [];
  const assigneeTargets: string[] = [];
  for (let i = 0; i < MAX_ASSIGNEES; i++) {
    const id = formData.get(assigneeFieldName(i));
    const qty = formData.get(assigneeTargetFieldName(i));
    if (id === null && qty === null && i >= ASSIGNEE_FIELDS.length) break;
    assignees.push(typeof id === "string" ? id : "");
    assigneeTargets.push(typeof qty === "string" ? qty : "");
  }
  return {
    status: "error",
    message,
    values: {
      calledDate: text("calledDate"),
      calledQty: text("calledQty"),
      remarks: text("remarks"),
      assignees,
      assigneeTargets,
    },
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
  plan, nextSeq, inspectors, today,
}: { plan: WorkOrderPlan; nextSeq: number; inspectors: Inspector[]; today: string }) {
  const [state, action, pending] = useApiAction(`/api/plans/${plan.id}/work-orders`, idle, failed);
  const values: WorkOrderFormValues = state.status === "error" ? state.values : { calledDate: today, calledQty: "", remarks: "", assignees: [], assigneeTargets: [] };
  // Re-key on every answer or new sequence so a refused form comes back exactly as typed, but a new call-in starts clean.
  return (
    <FormBody
      key={state.status === "error" ? state.at : `new-${nextSeq}`}
      plan={plan} nextSeq={nextSeq} inspectors={inspectors} today={today} state={state} values={values} action={action} pending={pending}
    />
  );
}

function FormBody({
  plan, nextSeq, inspectors, today, state, values, action, pending,
}: {
  plan: WorkOrderPlan; nextSeq: number; inspectors: Inspector[]; today: string; state: WorkOrderFormState; values: WorkOrderFormValues;
  action: (formData: FormData) => void; pending: boolean;
}) {
  const base = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const confirmDialogRef = useRef<HTMLDialogElement>(null);
  const [confirmedOver, setConfirmedOver] = useState(false);
  const [calledQty, setCalledQty] = useState(values.calledQty);
  const [calledDate, setCalledDate] = useState(values.calledDate);
  const [picked, setPicked] = useState(values.assignees.filter(Boolean));
  const [targets, setTargets] = useState(values.assigneeTargets ?? []);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const unavailable = state.status === "error" ? (state.unavailable ?? []) : [];

  const remaining = plan.lotQty - plan.lotCalledTotal;
  const lot = { lotQty: plan.lotQty, lotCalledTotal: plan.lotCalledTotal, qcRequired: plan.qcRequired, qcDoneBefore: plan.qcDoneTotal, nextSeq };
  // docs/17 §1.1 & User 11 Nov 2026: on call-in #1, Need is the minimum; on #2 onwards, can start at any amount.
  const minimum = minCallIn(lot);
  const qty = countOf(calledQty);
  const callIn = qty === null ? null : callInError({ ...lot, calledQty: qty });
  const preview = planWorkOrder({ calledQty: qty !== null && !callIn ? qty : Math.max(1, minimum), qcRequired: plan.qcRequired, qcDoneBefore: plan.qcDoneTotal });
  const dateError = errors.calledDate;
  const planned = calledDate > today;

  const hasAnyTarget = targets.some((t) => (t ?? "").trim() !== "");
  const targetNumbers = targets.map((t) => {
    const raw = (t ?? "").replace(/,/g, "").trim();
    if (!raw) return null;
    const n = Number(raw);
    return !Number.isNaN(n) && n > 0 ? n : null;
  });
  const targetSum = targetNumbers.reduce((acc: number, curr) => acc + (curr ?? 0), 0);
  const hasIncompleteTargets = hasAnyTarget && picked.some((_, i) => !targetNumbers[i]);
  const isTargetMismatch = hasAnyTarget && qty !== null && targetSum !== qty;

  const overInspection = isOverInspect({
    nextSeq,
    qcRequired: plan.qcRequired,
    qcDoneTotal: plan.qcDoneTotal,
    targetSum: hasAnyTarget ? targetSum : null,
  });
  const needsConfirmation = overInspection && !confirmedOver;

  const missing = [
    qty === null && "จำนวน",
    picked.length < 2 && `ผู้ตรวจอีก ${2 - picked.length} คน`,
    hasIncompleteTargets && "จำนวนรายคนให้ครบทุกคน",
    isTargetMismatch && (targetSum < (qty ?? 0) ? `ยอดรายคนขาดอีก ${(qty ?? 0) - targetSum} ตัว` : `ยอดรายคนเกิน ${targetSum - (qty ?? 0)} ตัว`),
  ].filter(Boolean) as string[];
  const blocked = pending || Boolean(callIn) || Boolean(hasIncompleteTargets) || Boolean(isTargetMismatch);

  return (
    <form ref={formRef} action={action} noValidate className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <input type="hidden" name="confirmedOverInspect" value={confirmedOver ? "true" : "false"} />
      <div className="min-w-0 space-y-5">
        {state.status === "error" && <p role="alert" className="rounded-control border border-red-500/50 bg-carbon-800 px-3 py-2 text-sm text-red-300">{state.message}</p>}

        <section className="space-y-4 app-panel rounded-panel border border-carbon-700 bg-carbon-800 p-4">
          <h2 className="text-base font-medium text-ti-50">การเรียกเข้าครั้งที่ {nextSeq}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1 text-sm text-ti-400">
              <span className="flex items-center gap-1">วันที่เรียกเข้า <span className="text-ember-400">*</span><HelpTip label="คำแนะนำวันที่เรียกเข้า">เปิดได้หลายใบต่อวัน และเลือกวันในอนาคตเพื่อวางแผนล่วงหน้าได้</HelpTip></span>
              <input
                type="date"
                name="calledDate"
                value={calledDate}
                onChange={(event) => setCalledDate(event.target.value)}
                required
                aria-invalid={dateError ? true : undefined}
                aria-describedby={dateError ? `${base}-date-error` : undefined}
                className={inputClass}
              />
              {dateError && <span id={`${base}-date-error`} className="block text-xs text-red-300">{dateError}</span>}
              {planned && <span className="block text-xs text-ti-500">วางแผนล่วงหน้า</span>}
            </label>
            <label className="block space-y-1 text-sm text-ti-400">
              <span className="flex items-center gap-1">จำนวนที่เรียกเข้า <span className="text-ember-400">*</span>
                <HelpTip label="รายละเอียดจำนวนที่เรียกเข้า">ล็อต {plan.lotQty.toLocaleString("th-TH")} เครื่อง เรียกแล้ว {plan.lotCalledTotal.toLocaleString("th-TH")} เครื่อง คงเหลือ {remaining.toLocaleString("th-TH")} เครื่อง ครั้งแรกต้องเรียกอย่างน้อยตาม Need ครั้งต่อไปเริ่มได้ตั้งแต่ 1 เครื่อง</HelpTip>
              </span>
              <input
                name="calledQty"
                inputMode="numeric"
                autoComplete="off"
                value={calledQty}
                onChange={(event) => {
                  setCalledQty(event.target.value);
                  setConfirmedOver(false);
                }}
                placeholder={nextSeq === 1 && minimum > 0 ? `${minimum.toLocaleString("th-TH")}–${remaining.toLocaleString("th-TH")}` : `ไม่เกิน ${remaining.toLocaleString("th-TH")}`}
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
                        : nextSeq === 1 && minimum > 0
                          ? `อย่างน้อย ${minimum.toLocaleString("th-TH")} · ไม่เกิน ${remaining.toLocaleString("th-TH")} เครื่อง`
                          : `1–${remaining.toLocaleString("th-TH")} เครื่อง`)}
              </span>
            </label>
          </div>
        </section>

        <section className="space-y-4 app-panel rounded-panel border border-carbon-700 bg-carbon-800 p-4">
          <AssigneePicker
            inspectors={inspectors}
            value={picked}
            onChange={(val) => {
              setPicked(val);
              setConfirmedOver(false);
            }}
            targets={targets}
            onTargetsChange={(val) => {
              setTargets(val);
              setConfirmedOver(false);
            }}
            totalQty={qty}
            error={errors.assignees}
            unavailable={unavailable}
          />
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
        className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 space-y-2 app-panel rounded-panel border border-pass/60 bg-[color-mix(in_srgb,var(--color-pass)_12%,var(--color-carbon-800))] p-3 shadow-lg shadow-black/30 backdrop-blur md:bottom-4 lg:top-[calc(4.5rem+50px)] lg:bottom-auto lg:space-y-3 lg:p-4"
      >
        <div className="flex items-end justify-between gap-3 lg:block lg:space-y-3" aria-live="polite">
          <div>
            <p className="font-mono text-sm text-ti-200">{formatWorkOrderNo(plan.planNo, nextSeq)}</p>
            <p className="text-xs text-ti-400">
              ประเภท <span className={preview.type === "CALLIN_FIX" ? "text-ember-400" : "text-ti-50"}>{WORK_ORDER_TYPE_LABELS[preview.type]}</span>
            </p>
          </div>
          <div className="text-right lg:text-left">
            <div className="flex items-center justify-end gap-1 text-xs text-ti-400 lg:justify-start">ต้องตรวจ
              <HelpTip label="วิธีคำนวณจำนวนที่ต้องตรวจ">
                {preview.type === "CALLIN_FIX" ? "QC ของล็อตครบแล้ว เรียกเข้าแก้ไขโดยไม่ต้องตรวจในแอป และเลือกตรวจเพิ่มได้" : `เป้า ${plan.qcPercent}% ของล็อต ${plan.qcRequired} เครื่อง หักตรวจแล้ว ${plan.qcDoneTotal} เครื่อง และเลือกตรวจเกินได้`}
              </HelpTip>
            </div>
            <p className="font-mono text-3xl leading-tight text-ti-50">{preview.need}</p>
          </div>
        </div>
        <p className="hidden border-t border-carbon-700 pt-3 text-xs text-ti-400 lg:block">
          เรียกเข้าแล้ว {plan.lotCalledTotal.toLocaleString("th-TH")} → {(plan.lotCalledTotal + (qty !== null && !callIn ? qty : 0)).toLocaleString("th-TH")} / {plan.lotQty.toLocaleString("th-TH")}
        </p>
        {hasAnyTarget && (
          <div className="rounded-control border border-carbon-700 bg-carbon-900/60 p-2.5 text-xs space-y-1.5">
            <div className="flex items-center justify-between font-semibold">
              <span className="text-ti-300">จ่ายงานรายคน:</span>
              <span className={qty !== null && targetSum === qty ? "text-pass" : "text-ember-400"}>
                {targetSum} / {qty ?? 0} ตัว
              </span>
            </div>
            <ul className="hidden lg:block space-y-1 font-mono text-ti-400">
              {picked.map((id, idx) => {
                const p = inspectors.find((ins) => ins.id === id);
                const name = p?.name ?? id;
                const count = targets[idx] || "0";
                return (
                  <li key={id} className="flex items-center justify-between">
                    <span className="truncate pr-2">{name}</span>
                    <span className="font-semibold text-ti-200">{count} ตัว</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {overInspection && (
          <div className="rounded-control border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-300">
            <span>ยอดตรวจเกินเกณฑ์ QC</span>
            {confirmedOver && <span className="block text-[11px] text-pass font-medium">ยืนยันตรวจเกินแล้ว</span>}
          </div>
        )}
        <div className="flex gap-2">
          <Link href={`/plans/${plan.id}?tab=work`} className="hidden h-11 items-center rounded-control border border-ti-600 px-4 text-sm text-ti-200 hover:border-ti-400 lg:inline-flex">
            ยกเลิก
          </Link>
          <button
            type={needsConfirmation ? "button" : "submit"}
            onClick={() => {
              if (needsConfirmation) {
                confirmDialogRef.current?.showModal();
              }
            }}
            disabled={blocked}
            className="h-11 flex-1 rounded-control app-primary-action bg-ember-500 px-4 text-sm font-semibold text-carbon-900 hover:bg-ember-400 disabled:opacity-50"
          >
            {pending ? "กำลังบันทึก…" : "บันทึกใบงาน"}
          </button>
        </div>
        <p className={`text-xs ${missing.length > 0 ? "text-[#fb2c36]" : "text-pass"}`}>{missing.length > 0 ? `ยังขาด: ${missing.join(", ")}` : "พร้อมบันทึก"}</p>
      </aside>

      <dialog
        ref={confirmDialogRef}
        aria-labelledby={`${base}-overinspect-title`}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] app-panel rounded-panel border border-amber-500/50 bg-carbon-800 p-0 text-ti-50 backdrop:bg-black/75 shadow-2xl"
      >
        <div className="space-y-4 p-5">
          <div className="flex items-center gap-3">
            <div>
              <h2 id={`${base}-overinspect-title`} className="text-base font-semibold text-ti-50">
                ยืนยันการตรวจเกินเป้าหมาย (QC Need)
              </h2>
              <p className="text-xs text-ti-400">
                ใบงานครั้งที่ {nextSeq} · แผน {plan.planNo}
              </p>
            </div>
          </div>

          <div className="rounded-control border border-carbon-700 bg-carbon-900/80 p-3.5 space-y-2 text-xs">
            <div className="flex justify-between text-ti-300">
              <span>เป้าหมายตรวจรวมของล็อต (QC Need {plan.qcPercent}%):</span>
              <span className="font-mono font-semibold text-ti-100">{plan.qcRequired.toLocaleString("th-TH")} เครื่อง</span>
            </div>
            <div className="flex justify-between text-ti-300">
              <span>ตรวจเสร็จแล้วสะสมก่อนหน้านี้:</span>
              <span className="font-mono font-semibold text-ti-100">{plan.qcDoneTotal.toLocaleString("th-TH")} เครื่อง</span>
            </div>
            {plan.qcDoneTotal >= plan.qcRequired ? (
              <p className="border-t border-carbon-700/80 pt-2 text-amber-400 leading-relaxed">
                ล็อตนี้ตรวจครบ Max ตามเกณฑ์แล้ว ({plan.qcDoneTotal}/{plan.qcRequired} เครื่อง) — การเปิดใบงานครั้งนี้จะเป็นการตรวจเพิ่มพิเศษ (เกินเกณฑ์)
              </p>
            ) : (
              <div className="border-t border-carbon-700/80 pt-2 flex justify-between text-amber-400">
                <span>ยอดมอบหมาย ({targetSum} เครื่อง) เกินเป้าที่เหลือ ({plan.qcRequired - plan.qcDoneTotal} เครื่อง):</span>
                <span className="font-mono font-bold">+{targetSum - (plan.qcRequired - plan.qcDoneTotal)} เครื่อง</span>
              </div>
            )}
          </div>

          <p className="text-sm font-medium text-ti-100">
            คุณต้องการที่จะตรวจเกินใช่ไหม?
          </p>

          <div className="flex justify-end gap-2 pt-2 border-t border-carbon-700">
            <button
              type="button"
              onClick={() => confirmDialogRef.current?.close()}
              className="h-11 rounded-control border border-ti-600 px-4 text-sm text-ti-200 hover:border-ti-400"
            >
              กลับไปแก้ไข
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmedOver(true);
                confirmDialogRef.current?.close();
                const form = formRef.current;
                if (form) {
                  const hidden = form.querySelector<HTMLInputElement>('input[name="confirmedOverInspect"]');
                  if (hidden) hidden.value = "true";
                  form.requestSubmit();
                }
              }}
              className="h-11 rounded-control bg-amber-500 px-5 text-sm font-semibold text-carbon-900 hover:bg-amber-400"
            >
              ยืนยันตรวจเกิน
            </button>
          </div>
        </div>
      </dialog>
    </form>
  );
}

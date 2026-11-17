"use client";

import { SearchSelect } from "@/components/ui/SearchSelect";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useApiAction, useApiCall } from "@/lib/api/client";
import type { PlanWorkOrderSummary } from "@/lib/plans/detail";
import { MAX_CANCEL_REASON } from "@/lib/plans/rules";
import type { PlanActionState } from "@/lib/plans/state";

const idle: PlanActionState = { status: "idle" };
const failed = (message: string): PlanActionState => ({ status: "error", message, at: Date.now() });

/** BR-13 / docs/15 §3: "ยกเลิกแผน" opens a confirm dialog that needs a reason. */
export function CancelPlanButton({ planId, planNo }: { planId: number; planNo: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useApiAction(`/api/plans/${planId}/cancel`, idle, failed);
  // Controlled, so React's form reset after the action doesn't wipe the reason when the server refuses.
  const [reason, setReason] = useState("");
  const base = useId();

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="h-11 rounded-control border border-fail/60 px-4 text-sm text-fail hover:bg-fail/10"
      >
        ยกเลิกแผน
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={`${base}-title`}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] app-panel rounded-panel border border-carbon-600 bg-carbon-800 p-0 text-ti-50 backdrop:bg-black/70"
      >
        <form action={action} className="space-y-4 p-5">
          <h2 id={`${base}-title`} className="text-lg text-ti-50">ยกเลิกแผน <span className="font-mono">{planNo}</span>?</h2>
          <p className="text-sm text-ti-400">
            แผนที่ยกเลิกจะไม่แสดงในรายการตั้งต้น และกู้คืนไม่ได้ — ถ้ากรอกผิด เปิดแผนใหม่ด้วย Invoice/PO + Model เดิมได้
          </p>
          <label className="block space-y-1 text-sm text-ti-400">
            <span>เหตุผลที่ยกเลิก <span className="text-ember-400">*</span></span>
            <textarea
              name="reason"
              required
              rows={3}
              maxLength={MAX_CANCEL_REASON}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="w-full rounded-control border border-carbon-600 bg-carbon-900 px-3 py-2 text-sm text-ti-50 focus:border-ember-500"
            />
          </label>
          {state.status === "error" && <p role="alert" className="text-sm text-red-300">{state.message}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => dialogRef.current?.close()} className="h-11 rounded-control border border-ti-600 px-4 text-sm text-ti-200 hover:border-ti-400">
              ไม่ยกเลิก
            </button>
            <button
              type="submit"
              disabled={pending || !reason.trim()}
              className="h-11 rounded-control bg-fail px-4 text-sm font-semibold text-carbon-900 hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "กำลังยกเลิก…" : "ยืนยันยกเลิกแผน"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

/**
 * FR-PLAN-17: ticking saves at once; the box shows the new value straight away and keeps it until the
 * refreshed page confirms it — or goes back to the old value if the server refuses.
 */
export function WaitingGoodsToggle({ planId, value }: { planId: number; value: boolean }) {
  const [call, settling] = useApiCall(`/api/plans/${planId}/waiting-goods`, failed);
  const [chosen, setChosen] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const pending = saving || settling;
  const checked = pending && chosen !== null ? chosen : value;

  const toggle = () => {
    const next = !value;
    setChosen(next);
    startSaving(async () => {
      const formData = new FormData();
      formData.set("value", next ? "1" : "0");
      const result = await call(formData);
      setError(result.status === "error" ? result.message : null);
    });
  };

  return (
    <div className="space-y-1">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ti-200">
        <input type="checkbox" checked={checked} disabled={pending} onChange={toggle} className="size-5 accent-ember-500" />
        <span>
          รอของ <span className="text-ti-400">(ของยังมาไม่ครบ)</span>
          {pending && <span className="ml-2 text-xs text-ti-500">กำลังบันทึก…</span>}
        </span>
      </label>
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    </div>
  );
}

/**
 * Vendor of the Invoice/PO (user 23 Oct 2026): optional when the plan is opened; the QC Head fills it in or
 * changes it here once the warehouse says, any time. All plans and work orders of the document follow.
 */
export function PlanVendorEditor({
  planId, vendorId, vendorName, vendors, planCount,
}: { planId: number; vendorId: number | null; vendorName: string | null; vendors: { id: number; name: string }[]; planCount: number }) {
  const [state, action, pending] = useApiAction(`/api/plans/${planId}/vendor`, idle, failed, "PATCH");
  const [editing, setEditing] = useState(false);
  const [doneAt, setDoneAt] = useState(0);
  const base = useId();
  // Close after a successful save (each answer has its own `at`).
  if (state.status === "done" && state.at !== doneAt) {
    setDoneAt(state.at);
    setEditing(false);
  }
  // A vendor disabled since stays selectable as the current value.
  const choices = vendorId !== null && !vendors.some((vendor) => vendor.id === vendorId) ? [{ id: vendorId, name: vendorName ?? String(vendorId) }, ...vendors] : vendors;

  return (
    <div className="min-w-0 sm:col-span-2">
      <dt id={`${base}-term`} className="text-xs text-ti-500">Vendor</dt>
      {!editing ? (
        <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={vendorName ? "break-words text-ti-200" : "text-ember-400"}>{vendorName ?? "ยังไม่ระบุ — รอคลังแจ้ง"}</span>
          <button type="button" onClick={() => setEditing(true)} className="min-h-11 text-sm text-ember-400 underline-offset-4 hover:underline">
            {vendorName ? "แก้ Vendor" : "กรอก Vendor"}
          </button>
        </dd>
      ) : (
        <dd>
          <form action={action} className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <SearchSelect
                name="vendorId"
                defaultValue={vendorId === null ? "" : String(vendorId)}
                aria-labelledby={`${base}-term`}
                className="h-11 w-full rounded-control border border-carbon-600 bg-carbon-900 px-3 text-sm text-ti-50 focus:border-ember-500"
                options={[{ value: "", label: "— ยังไม่ระบุ —" }, ...choices.map((vendor) => ({ value: String(vendor.id), label: vendor.name }))]}
              />
            </div>
            <button type="submit" disabled={pending} className="h-11 rounded-control bg-ember-500 px-4 text-sm font-semibold text-carbon-900 hover:bg-ember-400 disabled:opacity-50">
              {pending ? "กำลังบันทึก…" : "บันทึก"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="h-11 rounded-control border border-ti-600 px-4 text-sm text-ti-200 hover:border-ti-400">
              ยกเลิก
            </button>
          </form>
          {planCount > 1 && <p className="mt-1 text-xs text-ti-500">ใช้กับทุกแผนในเอกสารนี้ ({planCount} แผน) และใบงานทั้งหมด</p>}
        </dd>
      )}
      {state.status === "error" && <p role="alert" className="mt-1 text-xs text-red-300">{state.message}</p>}
    </div>
  );
}

/**
 * BR-07 / FR-RPT-06: QC Head approves completed inspection results and forwards the plan to QA.
 * Opens a modal dialog with a full summary of passed/rework/reject units and an optional note.
 */
export function SubmitToQaButton({
  planId,
  planNo,
  modelCode,
  lotQty,
  qcDoneTotal,
  qcRequired,
  passCount,
  reworkCount,
  rejectCount,
  workOrderSummary,
}: {
  planId: number;
  planNo: string;
  modelCode: string;
  lotQty: number;
  qcDoneTotal: number;
  qcRequired: number;
  passCount: number;
  reworkCount: number;
  rejectCount: number;
  workOrderSummary?: PlanWorkOrderSummary;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useApiAction(`/api/plans/${planId}/submit-to-qa`, idle, failed);
  const [remarks, setRemarks] = useState("");
  const lastClosedAt = useRef(0);
  const base = useId();

  useEffect(() => {
    if (state.status === "done" && state.at !== lastClosedAt.current) {
      lastClosedAt.current = state.at;
      dialogRef.current?.close();
    }
  }, [state]);

  const hasRework = reworkCount > 0;
  const quotaShort = qcDoneTotal < qcRequired;
  const workOrdersIncomplete = workOrderSummary ? !workOrderSummary.allCompleted : false;
  const disabled = pending || hasRework || quotaShort || workOrdersIncomplete;

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="h-11 rounded-control bg-ember-500 hover:bg-ember-400 px-5 text-sm font-semibold text-carbon-900 shadow-sm transition-colors flex items-center gap-2 shrink-0 cursor-pointer"
      >
        <svg className="w-4 h-4 text-carbon-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        <span>ตรวจทานเรียบร้อย — ส่งต่อ QA</span>
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={`${base}-title`}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] app-panel rounded-panel border border-carbon-600 bg-carbon-800 p-0 text-ti-50 backdrop:bg-black/70 shadow-2xl"
      >
        <form action={action} className="space-y-4 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3 border-b border-carbon-700/80 pb-3">
            <div>
              <h2 id={`${base}-title`} className="text-lg font-semibold text-ti-50 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-ember-500" />
                ตรวจทานและส่งต่อ QA
              </h2>
              <p className="text-xs text-ti-400 mt-0.5">
                แผนตรวจ <span className="font-mono text-ti-200">{planNo}</span> · รุ่น <span className="font-mono text-ti-200">{modelCode}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="text-ti-400 hover:text-ti-100 p-1 text-lg leading-none"
              aria-label="ปิด"
            >
              ✕
            </button>
          </div>

          <div className="rounded-control border border-carbon-700 bg-carbon-900/80 p-3.5 space-y-2.5 text-xs sm:text-sm">
            <div className="flex items-center justify-between text-ti-300">
              <span>ยอดล็อตทั้งหมด</span>
              <span className="font-mono text-ti-100 font-medium">{lotQty.toLocaleString("th-TH")} เครื่อง</span>
            </div>
            <div className="flex items-center justify-between text-ti-300">
              <span>QC ตรวจแล้ว / เป้าหมาย (10%)</span>
              <span className="font-mono text-ti-100 font-medium">
                {qcDoneTotal} / {qcRequired} เครื่อง
              </span>
            </div>
            {workOrderSummary && (
              <div className="flex items-center justify-between text-ti-300">
                <span>ใบงานทั้งหมด (รวมที่เปิดเพิ่ม)</span>
                <span className="font-mono text-ti-100 font-medium">
                  {workOrderSummary.activeCount} ใบ {workOrderSummary.allCompleted ? "(เสร็จครบทุกใบ)" : `(ยังไม่ครบ ${workOrderSummary.incompleteWorkOrders.length} ใบ)`}
                </span>
              </div>
            )}
            <div className="border-t border-carbon-800 pt-2 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-pass">
                <span>✓ ผ่านเกณฑ์ (PASS)</span>
                <span className="font-mono font-medium">{passCount} เครื่อง</span>
              </div>
              {hasRework ? (
                <div className="flex items-center justify-between text-fail font-semibold">
                  <span>⚠ ยังรอ Rework แก้ไข</span>
                  <span className="font-mono bg-fail/20 px-1.5 py-0.5 rounded border border-fail/40">
                    {reworkCount} เครื่อง
                  </span>
                </div>
              ) : null}
              {rejectCount > 0 && (
                <div className="flex items-center justify-between text-ti-400">
                  <span>✕ คัดออก (Reject)</span>
                  <span className="font-mono font-medium">{rejectCount} เครื่อง</span>
                </div>
              )}
            </div>
          </div>

          {workOrdersIncomplete && (
            <div role="alert" className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-control p-2.5 space-y-1.5">
              <div className="font-semibold flex items-center gap-1.5 text-amber-200">
                <svg className="w-4 h-4 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>ยังมีใบงาน (รวมใบงานที่เปิดเพิ่ม) ที่ตรวจยังไม่ครบตาม Need:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-ti-200 pl-1">
                {workOrderSummary?.incompleteWorkOrders.map((w) => (
                  <li key={w.woNo}>
                    <span className="font-mono font-medium text-ti-100">{w.woNo}</span>: ตรวจแล้ว{" "}
                    <span className="font-mono">{w.qtyDone}/{w.qtyNeed} เครื่อง</span>
                    {w.reworkCount > 0 && <span className="text-fail font-medium"> (ค้างซ่อม {w.reworkCount})</span>}
                    {w.status === "RETURNED" && <span className="text-fail font-medium"> (ถูกตีกลับ)</span>}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-ti-400 pt-0.5">
                * ต้องรอให้ทุกใบงานตรวจครบตาม Need และไม่มีงานค้างซ่อม จึงจะสามารถส่งต่อ QA ได้
              </p>
            </div>
          )}

          {hasRework && (
            <p role="alert" className="text-xs text-fail bg-fail/10 border border-fail/30 rounded-control p-2.5">
              ⚠ ยังมีเครื่องที่รอ Rework แก้ไข {reworkCount} เครื่อง — ต้องแก้ไขให้เสร็จสิ้นและประเมินผ่านก่อนจึงจะส่งต่อ QA ได้
            </p>
          )}

          {quotaShort && (
            <p role="alert" className="text-xs text-ember-400 bg-ember-500/10 border border-ember-500/30 rounded-control p-2.5">
              ⚠ ตรวจยังไม่ครบตามเป้าหมาย ({qcDoneTotal}/{qcRequired} เครื่อง)
            </p>
          )}

          {!hasRework && !quotaShort && !workOrdersIncomplete && (
            <p className="text-xs text-ti-300 leading-relaxed">
              คุณได้ตรวจทานผลตรวจ, รายการ Defect และรูปหลักฐานเรียบร้อยแล้ว กด <b>ยืนยัน</b> เพื่อส่งแผนตรวจนี้เข้าสู่คิวงานสุ่มตรวจของฝ่าย QA
            </p>
          )}

          <label className="block space-y-1 text-sm text-ti-400">
            <span>หมายเหตุถึงทีม QA <span className="text-xs text-ti-500">(ไม่บังคับ)</span></span>
            <textarea
              name="remarks"
              rows={2}
              maxLength={200}
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              placeholder="ข้อสังเกตเพิ่มเติม หรือจุดที่ต้องการให้ QA สุ่มดูเป็นพิเศษ…"
              className="w-full rounded-control border border-carbon-600 bg-carbon-900 px-3 py-2 text-sm text-ti-50 focus:border-ember-500 placeholder:text-ti-600"
            />
          </label>

          {state.status === "error" && (
            <p role="alert" className="text-sm text-red-300 bg-red-950/40 border border-red-800/60 rounded-control p-2.5">
              {state.message}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-carbon-700/80">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="h-11 rounded-control border border-ti-600 px-4 text-sm text-ti-200 hover:border-ti-400 cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={disabled}
              className="h-11 rounded-control bg-ember-500 px-5 text-sm font-semibold text-carbon-900 hover:bg-ember-400 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-sm"
            >
              {pending ? "กำลังส่งต่อ QA…" : "ยืนยันส่งต่อ QA"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

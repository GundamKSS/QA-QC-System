"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useApiAction, useApiCall } from "@/lib/api/client";
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
            <select
              name="vendorId"
              defaultValue={vendorId ?? ""}
              aria-labelledby={`${base}-term`}
              className="h-11 min-w-0 flex-1 rounded-control border border-carbon-600 bg-carbon-900 px-3 text-sm text-ti-50 focus:border-ember-500"
            >
              <option value="">— ยังไม่ระบุ —</option>
              {choices.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
            </select>
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

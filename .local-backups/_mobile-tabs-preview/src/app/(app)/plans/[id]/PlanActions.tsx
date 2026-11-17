"use client";

import { useActionState, useId, useOptimistic, useRef, useState, useTransition } from "react";
import { MAX_CANCEL_REASON } from "@/lib/plans/rules";
import { cancelPlanAction, setWaitingGoodsAction, type PlanActionState } from "../actions";

const idle: PlanActionState = { status: "idle" };

/** BR-13 / docs/15 §3: "ยกเลิกแผน" opens a confirm dialog that needs a reason. */
export function CancelPlanButton({ planId, planNo }: { planId: number; planNo: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState(cancelPlanAction, idle);
  // Controlled, so React's form reset after the action doesn't wipe the reason when the server refuses.
  const [reason, setReason] = useState("");
  const base = useId();

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="h-11 rounded-[10px] border border-fail/60 px-4 text-sm text-fail hover:bg-fail/10"
      >
        ยกเลิกแผน
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={`${base}-title`}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] app-panel rounded-xl border border-carbon-600 bg-carbon-800 p-0 text-ti-50 backdrop:bg-black/70"
      >
        <form action={action} className="space-y-4 p-5">
          <h2 id={`${base}-title`} className="text-lg text-ti-50">ยกเลิกแผน <span className="font-mono">{planNo}</span>?</h2>
          <p className="text-sm text-ti-400">
            แผนที่ยกเลิกจะไม่แสดงในรายการตั้งต้น และกู้คืนไม่ได้ — ถ้ากรอกผิด เปิดแผนใหม่ด้วย Invoice/PO + Model เดิมได้
          </p>
          <input type="hidden" name="planId" value={planId} />
          <label className="block space-y-1 text-sm text-ti-400">
            <span>เหตุผลที่ยกเลิก <span className="text-ember-400">*</span></span>
            <textarea
              name="reason"
              required
              rows={3}
              maxLength={MAX_CANCEL_REASON}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="w-full rounded-[10px] border border-carbon-600 bg-carbon-900 px-3 py-2 text-sm text-ti-50 focus:border-ember-500"
            />
          </label>
          {state.status === "error" && <p role="alert" className="text-sm text-red-300">{state.message}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => dialogRef.current?.close()} className="h-11 rounded-[10px] border border-ti-600 px-4 text-sm text-ti-200 hover:border-ti-400">
              ไม่ยกเลิก
            </button>
            <button
              type="submit"
              disabled={pending || !reason.trim()}
              className="h-11 rounded-[10px] bg-fail px-4 text-sm font-semibold text-carbon-900 hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "กำลังยกเลิก…" : "ยืนยันยกเลิกแผน"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

/** FR-PLAN-17: ticking saves at once; the box flips immediately and settles on the server's answer. */
export function WaitingGoodsToggle({ planId, value }: { planId: number; value: boolean }) {
  const [checked, setChecked] = useOptimistic(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = () =>
    startTransition(async () => {
      setChecked(!value);
      const formData = new FormData();
      formData.set("planId", String(planId));
      formData.set("value", value ? "0" : "1");
      const result = await setWaitingGoodsAction(idle, formData);
      setError(result.status === "error" ? result.message : null);
    });

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

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useApiAction } from "@/lib/api/client";
import { MAX_CANCEL_REASON } from "@/lib/plans/rules";
import type { PlanActionState } from "@/lib/plans/state";
import type { Inspector, WorkOrderAssignee } from "@/lib/plans/store";
import { AssigneePicker } from "./AssigneePicker";

const idle: PlanActionState = { status: "idle" };
const failed = (message: string): PlanActionState => ({ status: "error", message, at: Date.now() });
const buttonClass = "inline-flex h-9 items-center rounded-control border px-3 text-xs";
const dialogClass = "m-auto w-[min(40rem,calc(100vw-2rem))] app-panel rounded-panel border border-carbon-600 bg-carbon-800 p-0 text-ti-50 backdrop:bg-black/70";

/** W4: change the 2–5 people of an open work order, with the same picker as when it was opened. */
export function EditAssigneesButton({ planId, workOrderId, woNo, assignees, inspectors }: { planId: number; workOrderId: string; woNo: string; assignees: WorkOrderAssignee[]; inspectors: Inspector[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const base = useId();
  const [state, action, pending] = useApiAction(`/api/plans/${planId}/work-orders/${encodeURIComponent(workOrderId)}/assignees`, idle, failed, "PUT");
  // Each answer is a new state object, so the dialog closes once per successful save.
  useEffect(() => {
    if (state.status === "done") dialogRef.current?.close();
  }, [state]);
  const [picked, setPicked] = useState(() => assignees.map((person) => person.userId));

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setPicked(assignees.map((person) => person.userId));
          dialogRef.current?.showModal();
        }}
        className={`${buttonClass} border-ti-600 text-ti-200 hover:border-ti-400`}
      >
        แก้ผู้ตรวจ
      </button>
      <dialog ref={dialogRef} aria-labelledby={`${base}-title`} className={dialogClass}>
        <form action={action} className="max-h-[85dvh] space-y-4 overflow-y-auto p-5">
          <h2 id={`${base}-title`} className="text-lg text-ti-50">
            แก้ผู้ตรวจ <span className="font-mono">{woNo}</span>
          </h2>
          <AssigneePicker inspectors={inspectors} value={picked} onChange={setPicked} current={assignees} error={state.status === "error" ? state.message : undefined} />
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => dialogRef.current?.close()} className="h-11 rounded-control border border-ti-600 px-4 text-sm text-ti-200 hover:border-ti-400">
              ไม่บันทึก
            </button>
            <button type="submit" disabled={pending || picked.length < 2} className="h-11 rounded-control app-primary-action bg-ember-500 px-4 text-sm font-semibold text-carbon-900 hover:bg-ember-400 disabled:opacity-50">
              {pending ? "กำลังบันทึก…" : "บันทึกผู้ตรวจ"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

/** W4: cancel a work order that has no results yet; a reason is required and the quantity returns to the lot. */
export function CancelWorkOrderButton({ planId, workOrderId, woNo, calledQty }: { planId: number; workOrderId: string; woNo: string; calledQty: number }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const base = useId();
  const [state, action, pending] = useApiAction(`/api/plans/${planId}/work-orders/${encodeURIComponent(workOrderId)}/cancel`, idle, failed);
  const [reason, setReason] = useState("");

  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()} className={`${buttonClass} border-fail/60 text-fail hover:bg-fail/10`}>
        ยกเลิก
      </button>
      <dialog ref={dialogRef} aria-labelledby={`${base}-title`} className="m-auto w-[min(28rem,calc(100vw-2rem))] app-panel rounded-panel border border-carbon-600 bg-carbon-800 p-0 text-ti-50 backdrop:bg-black/70">
        <form action={action} className="space-y-4 p-5">
          <h2 id={`${base}-title`} className="text-lg text-ti-50">
            ยกเลิกใบงาน <span className="font-mono">{woNo}</span>?
          </h2>
          <p className="text-sm text-ti-400">ยอดเรียกเข้า {calledQty.toLocaleString("th-TH")} เครื่องจะคืนให้ล็อต · เลขใบงานนี้จะไม่ถูกนำกลับมาใช้ · กู้คืนไม่ได้</p>
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
            <button type="submit" disabled={pending || !reason.trim()} className="h-11 rounded-control bg-fail px-4 text-sm font-semibold text-carbon-900 hover:opacity-90 disabled:opacity-50">
              {pending ? "กำลังยกเลิก…" : "ยืนยันยกเลิกใบงาน"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

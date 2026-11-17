"use client";

import Link from "next/link";
import { LoadError } from "@/components/feedback/LoadError";
import type { PlanView } from "@/lib/plans/detail";
import { canOpenWorkOrder, OPEN_WORK_ORDER_STATUSES, WORK_ORDER_STATUS_LABELS, WORK_ORDER_TYPE_LABELS, workOrderBlock, type WorkOrderStatus } from "@/lib/plans/rules";
import type { Inspector } from "@/lib/plans/store";
import type { WorkOrderRow } from "@/lib/plans/work-order-list";
import { dateText, Stat } from "./PlanBits";
import { CancelWorkOrderButton, EditAssigneesButton } from "./WorkOrderActions";
import { useWorkOrderList } from "./useWorkOrderList";

const WO_TONE: Record<WorkOrderStatus, string> = {
  IN_PROGRESS: "border-ember-500/60 text-ember-400",
  RETURNED: "border-fail/60 text-fail",
  SUBMITTED: "border-sky-400/50 text-sky-300",
  CLOSED: "border-carbon-600 text-ti-400",
  FAILED: "border-carbon-600 text-ti-500",
  CANCELLED: "border-carbon-600 text-ti-500 line-through",
};

function WorkOrderStatusBadge({ status }: { status: WorkOrderStatus }) {
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${WO_TONE[status]}`}>{WORK_ORDER_STATUS_LABELS[status]}</span>;
}

type Props = {
  /** The plan the page already holds (lot figures, status); the list only adds the work orders. */
  plan: PlanView;
  /** QC Head / Admin: may open, re-assign and cancel work orders. */
  canManage: boolean;
  /** `?opened=<woNo>`: the work order that was just opened, to highlight. */
  opened: string;
};

/**
 * docs/16 §3: one row per call-in, with the people sharing it; QC Head / Admin open, re-assign and cancel. The
 * rows are read from `GET /api/plans/[id]/work-order-list` and load again after a re-assign or a cancel. Rows are
 * keyed by work-order id so an open dialog and what was typed in it survive that reload.
 */
export function WorkOrdersTab({ plan, canManage, opened }: Props) {
  const { data, loading, error, reload } = useWorkOrderList(plan.id);
  if (!data) return error ? <LoadError message={error} onRetry={reload} /> : <div role="status" aria-label="กำลังโหลดใบงาน" className="app-panel h-40 animate-pulse rounded-panel border border-carbon-700 bg-carbon-800" />;

  const { workOrders, inspectors } = data;
  const remaining = plan.lotQty - plan.lotCalledTotal;
  const callIns = workOrders.filter((wo) => wo.status !== "CANCELLED").length;
  const nextSeq = Math.max(0, ...workOrders.map((wo) => wo.seq)) + 1;
  const blocked = !canOpenWorkOrder(plan.status) ? "แผนนี้เสร็จ ยกเลิก หรือถูกพักล็อตแล้ว" : remaining <= 0 ? "ล็อตนี้เรียกเข้าครบแล้ว" : null;
  const justOpened = opened ? workOrders.find((wo) => wo.woNo === opened) : undefined;

  return (
    <section aria-label="ใบงาน" aria-busy={loading} className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
      {error && <LoadError message={error} onRetry={reload} />}
      {justOpened && (
        <p role="status" className="rounded-panel border border-pass/40 bg-carbon-800 px-4 py-3 text-sm text-ti-200">
          เปิดใบงาน <span className="whitespace-nowrap font-mono font-semibold text-pass">{justOpened.woNo}</span> แล้ว — {WORK_ORDER_TYPE_LABELS[justOpened.type]} · Need {justOpened.qtyNeed} · QC {justOpened.assignees.length} คน
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 app-panel rounded-panel border border-carbon-700 bg-carbon-800 p-4">
        <dl className="grid flex-1 grid-cols-2 gap-3 text-center text-sm sm:grid-cols-4">
          <Stat term="ยอดล็อต" value={plan.lotQty} />
          <Stat term={`เรียกเข้าแล้ว (${callIns} ครั้ง)`} value={plan.lotCalledTotal} />
          <Stat term="คงเหลือ" value={remaining} />
          <div>
            <dt className="text-xs text-ti-400">QC ตรวจสะสม / ต้องตรวจ</dt>
            <dd className="font-mono text-lg text-ti-50">{plan.qcDoneTotal} / {plan.qcRequired}</dd>
          </div>
        </dl>
        {canManage &&
          (blocked ? (
            <p className="text-sm text-ti-500">{blocked} — เปิดใบงานเพิ่มไม่ได้</p>
          ) : (
            <Link href={`/plans/${plan.id}/work-orders/new`} className="inline-flex h-11 items-center rounded-control app-primary-action bg-ember-500 px-4 text-sm font-semibold text-carbon-900 hover:bg-ember-400">
              ＋ เปิดใบงาน ครั้งที่ {nextSeq}
            </Link>
          ))}
      </div>

      {workOrders.length === 0 ? (
        <p className="rounded-panel border border-dashed border-carbon-600 p-5 text-sm text-ti-400">
          ยังไม่มีใบงาน — เปิดใบงานทุกครั้งที่เรียกของเข้า (เลข {plan.planNo}-1, -2, …) แล้วเลือก QC 2–5 คน
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto app-panel rounded-panel border border-carbon-700 bg-carbon-800 md:block">
            <table className="w-full min-w-[960px] text-sm">
              <caption className="sr-only">ใบงานของแผน {plan.planNo}</caption>
              <thead className="bg-carbon-900 text-left text-xs text-ti-400">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">เลขใบงาน</th>
                  <th scope="col" className="px-3 py-2 font-medium">วันที่เรียกเข้า</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">เรียกเข้า</th>
                  <th scope="col" className="px-3 py-2 font-medium">ประเภท</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Need</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">ตรวจแล้ว</th>
                  <th scope="col" className="px-3 py-2 font-medium">QC ผู้รับผิดชอบ</th>
                  <th scope="col" className="px-3 py-2 font-medium">สถานะ</th>
                  {canManage && <th scope="col" className="px-3 py-2"><span className="sr-only">จัดการ</span></th>}
                </tr>
              </thead>
              <tbody>
                {workOrders.map((wo) => (
                  <tr key={wo.id} className={`border-t border-carbon-700 align-top ${wo.status === "CANCELLED" ? "text-ti-500" : "text-ti-200"} ${wo.woNo === opened ? "bg-pass/10" : ""}`}>
                    <td className="px-3 py-2 font-mono">{wo.woNo}</td>
                    <td className="px-3 py-2">{dateText(wo.calledDate)}</td>
                    <td className="px-3 py-2 text-right font-mono">{wo.calledQty.toLocaleString("th-TH")}</td>
                    <td className="px-3 py-2">{WORK_ORDER_TYPE_LABELS[wo.type]}</td>
                    <td className="px-3 py-2 text-right font-mono">{wo.qtyNeed}</td>
                    <td className="px-3 py-2 text-right font-mono">{wo.qtyDone}</td>
                    <td className="px-3 py-2"><People workOrder={wo} /></td>
                    <td className="px-3 py-2">
                      <WorkOrderStatusBadge status={wo.status} />
                      {wo.cancelReason && <span className="mt-1 block text-xs text-ti-500">เหตุผล: {wo.cancelReason}</span>}
                    </td>
                    {canManage && <td className="px-3 py-2"><RowActions planId={plan.id} workOrder={wo} inspectors={inspectors} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-3 md:hidden" aria-label={`ใบงานของแผน ${plan.planNo}`}>
            {workOrders.map((wo) => (
              <li key={wo.id} className={`space-y-2 rounded-panel border bg-carbon-800 p-4 text-sm ${wo.woNo === opened ? "border-pass/50" : "border-carbon-700"} ${wo.status === "CANCELLED" ? "text-ti-500" : "text-ti-200"}`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono font-semibold text-ti-50">{wo.woNo}</span>
                  <WorkOrderStatusBadge status={wo.status} />
                </div>
                <p>{dateText(wo.calledDate)} · เรียกเข้า {wo.calledQty.toLocaleString("th-TH")} · {WORK_ORDER_TYPE_LABELS[wo.type]}</p>
                <p className="font-mono">Need {wo.qtyNeed} · ตรวจแล้ว {wo.qtyDone}</p>
                <People workOrder={wo} />
                {wo.cancelReason && <p className="text-xs text-ti-500">เหตุผลที่ยกเลิก: {wo.cancelReason}</p>}
                {canManage && <RowActions planId={plan.id} workOrder={wo} inspectors={inspectors} />}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function People({ workOrder }: { workOrder: WorkOrderRow }) {
  return (
    <ol className="space-y-0.5 text-xs">
      {workOrder.assignees.map((person) => (
        <li key={person.userId}>
          <span className="font-mono text-ti-500">{person.slot}.</span> {person.name}
          {person.slot === 1 && <span className="text-ti-500"> (หลัก)</span>}
          {person.targetQty != null && <span className="ml-1 font-mono font-medium text-ember-400">({person.targetQty} ตัว)</span>}
        </li>
      ))}
    </ol>
  );
}

function RowActions({ planId, workOrder, inspectors }: { planId: number; workOrder: WorkOrderRow; inspectors: Inspector[] }) {
  if (!OPEN_WORK_ORDER_STATUSES.includes(workOrder.status)) return null;
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <EditAssigneesButton
        planId={planId}
        workOrderId={workOrder.id}
        woNo={workOrder.woNo}
        calledQty={workOrder.calledQty}
        assignees={workOrder.assignees}
        inspectors={inspectors}
      />
      {!workOrderBlock(workOrder, "cancel") && <CancelWorkOrderButton planId={planId} workOrderId={workOrder.id} woNo={workOrder.woNo} calledQty={workOrder.calledQty} />}
    </div>
  );
}

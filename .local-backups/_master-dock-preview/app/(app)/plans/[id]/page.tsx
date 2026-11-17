import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requirePageAccess } from "@/lib/auth/dal";
import { canAccessPage } from "@/lib/auth/page-access";
import { dbProblem, dbProblemMessages, isDbError } from "@/lib/db/errors";
import {
  cancelBlock, canFlagWaitingGoods, canOpenWorkOrder, CHECKLIST_STATUSES, checklistStatusOf, OPEN_WORK_ORDER_STATUSES, thaiToday, WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_TYPE_LABELS, workOrderBlock, type PlanStatus, type WorkOrderStatus,
} from "@/lib/plans/rules";
import { getPlanStore } from "@/lib/plans/runtime";
import type { DocPlan, Inspector, PlanDetail, PlanHistoryEntry, VendorInfo, WorkOrder } from "@/lib/plans/store";
import { ChecklistBadge, dateText, Deadline, ProgressBadge, planProgress, QcBar, when } from "@/components/plans/PlanBits";
import { CancelPlanButton, PlanVendorEditor, WaitingGoodsToggle } from "./PlanActions";
import { CancelWorkOrderButton, EditAssigneesButton } from "./WorkOrderActions";

export const metadata = { title: "รายละเอียดแผน" };

type SearchParams = Record<string, string | string[] | undefined>;
const TABS = { info: "ข้อมูล", work: "ใบงาน", history: "ประวัติ" } as const;
type Tab = keyof typeof TABS;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export default function PlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={<p className="p-6 text-ti-400">กำลังโหลด…</p>}>
      <PlanView params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function PlanView({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params;
  if (!/^\d{1,12}$/.test(id)) notFound();
  const user = await requirePageAccess("plans", `/plans/${id}`);
  const canEdit = canAccessPage(user.roles, "plan-open");
  const canManageWork = canAccessPage(user.roles, "work-order");
  const isHead = user.roles.includes("QC_HEAD") || user.roles.includes("QA_HEAD");
  const query = await searchParams;
  const tabParam = one(query.tab);
  const tab: Tab = Object.hasOwn(TABS, tabParam) ? (tabParam as Tab) : "info";
  const opened = one(query.opened).slice(0, 40);

  let plan: PlanDetail | null;
  let siblings: DocPlan[] = [];
  let history: PlanHistoryEntry[] = [];
  let workOrders: WorkOrder[] = [];
  let inspectors: Inspector[] = [];
  let vendors: VendorInfo[] = [];
  try {
    const store = getPlanStore();
    plan = await store.getPlan(Number(id));
    if (plan) {
      siblings = await store.docPlans(plan.doc.id);
      history = await store.planHistory(plan.id);
      if (tab === "info" && canEdit && plan.status !== "CANCELLED") vendors = (await store.listOpenOptions()).vendors;
      if (tab === "work") {
        workOrders = await store.workOrdersOf(plan.id);
        if (canManageWork) inspectors = await store.listInspectors();
      }
    }
  } catch (error) {
    if (!isDbError(error)) throw error;
    console.error("[db] plan page failed", error.message);
    return (
      <Back>
        <p role="alert" className="rounded-control border border-red-500/50 bg-carbon-800 px-3 py-2 text-sm text-red-300">{dbProblemMessages[dbProblem(error)]}</p>
      </Back>
    );
  }
  if (!plan) notFound();

  const today = thaiToday(new Date());
  const cancellable = canEdit && cancelBlock({ status: plan.status, qcDoneTotal: plan.qcDoneTotal, isHead }) === null;
  const cancelled = plan.status === "CANCELLED" ? history.findLast((entry) => entry.to === "CANCELLED") : undefined;
  const docLabel = plan.doc.docType === "INVOICE" ? "Invoice" : "PO";
  const reopenHref = `/plans/new?${new URLSearchParams({ docType: plan.doc.docType, vendorId: String(plan.doc.vendorId ?? ""), docNo: plan.doc.docNo })}`;

  return (
    <Back>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl text-ti-50">{plan.planNo}</h1>
            <ChecklistBadge status={plan.status} />
            <ProgressBadge progress={planProgress(plan)} />
            {plan.waitingGoods && <span className="rounded-full border border-ember-500/50 px-2 py-0.5 text-xs text-ember-400">รอของ</span>}
          </div>
          <p className="text-sm text-ti-200">
            {plan.model.code}
            {plan.description && <span className="text-ti-400"> · {plan.description}</span>}
          </p>
        </div>
        {cancellable && <CancelPlanButton planId={plan.id} planNo={plan.planNo} />}
      </header>

      {plan.status === "CANCELLED" && (
        <div role="status" className="space-y-1 rounded-panel border border-fail/40 bg-carbon-800 px-4 py-3 text-sm">
          <p className="text-red-300">
            ยกเลิกแล้ว{plan.cancelledAt && ` เมื่อ ${when.format(plan.cancelledAt)}`}
            {cancelled?.by && ` โดย ${cancelled.by}`}
          </p>
          {plan.cancelReason && <p className="text-ti-200">เหตุผล: {plan.cancelReason}</p>}
          {canEdit && (
            <Link href={reopenHref} className="inline-block text-ember-400 underline-offset-4 hover:underline">
              เปิดแผนใหม่ใน {docLabel} นี้ →
            </Link>
          )}
        </div>
      )}

      <nav aria-label="ส่วนของแผน" className="flex gap-1 border-b border-carbon-700">
        {(Object.keys(TABS) as Tab[]).map((key) => (
          <Link
            key={key}
            href={key === "info" ? `/plans/${plan.id}` : `/plans/${plan.id}?tab=${key}`}
            aria-current={tab === key ? "page" : undefined}
            className={`-mb-px inline-flex h-11 items-center border-b-2 px-4 text-sm ${tab === key ? "border-ember-500 text-ti-50" : "border-transparent text-ti-400 hover:text-ti-200"}`}
          >
            {TABS[key]}
          </Link>
        ))}
      </nav>

      {tab === "info" && <InfoTab plan={plan} siblings={siblings} today={today} canEdit={canEdit} vendors={vendors} />}
      {tab === "work" && <WorkTab plan={plan} workOrders={workOrders} inspectors={inspectors} canManage={canManageWork} opened={opened} />}
      {tab === "history" && <HistoryTab history={history} />}
    </Back>
  );
}

function InfoTab({ plan, siblings, today, canEdit, vendors }: { plan: PlanDetail; siblings: DocPlan[]; today: string; canEdit: boolean; vendors: VendorInfo[] }) {
  const { doc } = plan;
  const isInvoice = doc.docType === "INVOICE";
  const others = siblings.filter((sibling) => sibling.id !== plan.id);
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-5">
        <section aria-labelledby="doc-title" className="space-y-3 app-panel rounded-panel border border-carbon-700 bg-carbon-800 p-4">
          <h2 id="doc-title" className="text-base font-medium text-ti-50">หัวเอกสารรับเข้า</h2>
          <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
            <Item term={isInvoice ? "Invoice" : "PO"} value={isInvoice ? doc.docNo : `${doc.department ?? ""} / ${doc.docNo}`} mono />
            {canEdit && plan.status !== "CANCELLED" ? (
              <PlanVendorEditor planId={plan.id} vendorId={doc.vendorId} vendorName={doc.vendorName} vendors={vendors} planCount={siblings.length} />
            ) : (
              <Item term={isInvoice ? "Vendor" : "Vendor / โรงงาน"} value={doc.vendorName ?? "ยังไม่ระบุ"} />
            )}
            {isInvoice ? <Item term="วันที่ Invoice" value={dateText(doc.invoiceDate)} /> : <Item term="วันที่ PO" value={dateText(doc.docDate)} />}
            {isInvoice && <Item term="จำนวน SKU ทั้งหมด" value={doc.expectedSkuCount?.toLocaleString("th-TH") ?? "—"} />}
            {doc.remarks && <Item term="หมายเหตุเอกสาร" value={doc.remarks} wide />}
          </dl>
          <div className="space-y-1 border-t border-carbon-700 pt-3 text-sm">
            <p className="text-ti-400">
              เปิดแผนแล้ว <b className="text-ti-50">{siblings.length}</b>
              {isInvoice && doc.expectedSkuCount ? ` จาก ${doc.expectedSkuCount} SKU` : ""} ในเอกสารนี้
            </p>
            {others.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {others.map((sibling) => (
                  <li key={sibling.id}>
                    <Link href={`/plans/${sibling.id}`} className="inline-flex h-9 items-center rounded-control border border-carbon-600 px-3 font-mono text-xs text-ti-200 hover:border-ti-400">
                      {sibling.planNo} · {sibling.modelCode}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section aria-labelledby="plan-title" className="space-y-3 app-panel rounded-panel border border-carbon-700 bg-carbon-800 p-4">
          <h2 id="plan-title" className="text-base font-medium text-ti-50">ส่วนแผน</h2>
          <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Item term="Model" value={plan.model.code} mono />
            <Item term="Brand" value={plan.model.brandName} />
            <Item term="ประเภทปั๊ม" value={plan.model.pumpType ?? "—"} />
            <Item term="Checklist QC" value={plan.model.qcChecklist ?? "—"} />
            <Item term="Checklist QA" value={plan.model.qaChecklist ?? "—"} />
            <Item term="จำนวนตาม Invoice/PO" value={`${plan.lotQty.toLocaleString("th-TH")} เครื่อง`} />
            <Item term="วันที่รับสินค้าเข้า" value={dateText(plan.receiptDate)} />
            <Item term="ผู้ผลิต (โรงงาน)" value={plan.manufacturer ?? "—"} />
            <Item term="เปิดโดย" value={`${plan.openedBy ?? "—"} · ${when.format(plan.openedAt)}`} />
            <Item term="QC ผู้รับผิดชอบหลัก" value={plan.responsibleQc ?? "— (ตั้งเมื่อเปิดใบงานแรก)"} />
            {plan.description && <Item term="Description" value={plan.description} wide />}
            {plan.remarks && <Item term="หมายเหตุ" value={plan.remarks} wide />}
          </dl>
        </section>
      </div>

      {/* Phone: the summary (QC count, deadline, รอของ) comes first; laptop: right column. */}
      <aside aria-label="สรุปแผน" className="order-first space-y-4 app-panel rounded-panel border border-carbon-600 bg-carbon-800 p-4 lg:order-none">
        <div>
          <p className="text-xs text-ti-400">QC ตรวจแล้ว / ต้องตรวจ</p>
          <p className="font-mono text-3xl text-ti-50">
            {plan.qcDoneTotal} <span className="text-ti-400">/ {plan.qcRequired}</span>
          </p>
          <QcBar done={plan.qcDoneTotal} required={plan.qcRequired} className="mt-2" />
          <p className="mt-1 text-xs text-ti-500">ปัดขึ้น({plan.lotQty.toLocaleString("th-TH")} × {plan.qcPercent}%) = {plan.qcRequired}</p>
        </div>
        <div className="border-t border-carbon-700 pt-3 text-sm">
          <p className="text-xs text-ti-400">กำหนดตรวจ 90 วัน</p>
          {isInvoice ? <Deadline deadline={doc.qcDeadline} today={today} docType="INVOICE" /> : <p className="text-ti-500">ไม่ใช้กับปั๊มผลิตเอง</p>}
        </div>
        <LotNumbers plan={plan} />
        <div className="border-t border-carbon-700 pt-3">
          {canEdit && canFlagWaitingGoods(plan.status) ? (
            <WaitingGoodsToggle planId={plan.id} value={plan.waitingGoods} />
          ) : (
            <p className="text-sm text-ti-400">รอของ: {plan.waitingGoods ? "ใช่" : "ไม่"}</p>
          )}
        </div>
      </aside>
    </div>
  );
}

function LotNumbers({ plan }: { plan: PlanDetail }) {
  return (
    <dl className="grid grid-cols-3 gap-2 border-t border-carbon-700 pt-3 text-center text-sm">
      <Stat term="ล็อต" value={plan.lotQty} />
      <Stat term="เรียกเข้าแล้ว" value={plan.lotCalledTotal} />
      <Stat term="คงเหลือ" value={plan.lotQty - plan.lotCalledTotal} />
    </dl>
  );
}

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

type WorkTabProps = { plan: PlanDetail; workOrders: WorkOrder[]; inspectors: Inspector[]; canManage: boolean; opened: string };

/** docs/16 §3: one row per call-in, with the people sharing it; QC Head / Admin open, re-assign and cancel. */
function WorkTab({ plan, workOrders, inspectors, canManage, opened }: WorkTabProps) {
  const remaining = plan.lotQty - plan.lotCalledTotal;
  const callIns = workOrders.filter((wo) => wo.status !== "CANCELLED").length;
  const nextSeq = Math.max(0, ...workOrders.map((wo) => wo.seq)) + 1;
  const blocked = !canOpenWorkOrder(plan.status) ? "แผนนี้เสร็จ ยกเลิก หรือถูกพักล็อตแล้ว" : remaining <= 0 ? "ล็อตนี้เรียกเข้าครบแล้ว" : null;
  const justOpened = opened ? workOrders.find((wo) => wo.woNo === opened) : undefined;

  return (
    <section aria-label="ใบงาน" className="space-y-4">
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
                    {canManage && <td className="px-3 py-2"><RowActions plan={plan} workOrder={wo} inspectors={inspectors} /></td>}
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
                {canManage && <RowActions plan={plan} workOrder={wo} inspectors={inspectors} />}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function People({ workOrder }: { workOrder: WorkOrder }) {
  return (
    <ol className="space-y-0.5 text-xs">
      {workOrder.assignees.map((person) => (
        <li key={person.userId}>
          <span className="font-mono text-ti-500">{person.slot}.</span> {person.name}
          {person.slot === 1 && <span className="text-ti-500"> (หลัก)</span>}
        </li>
      ))}
    </ol>
  );
}

function RowActions({ plan, workOrder, inspectors }: { plan: PlanDetail; workOrder: WorkOrder; inspectors: Inspector[] }) {
  if (!OPEN_WORK_ORDER_STATUSES.includes(workOrder.status)) return null;
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <EditAssigneesButton planId={plan.id} workOrderId={workOrder.id} woNo={workOrder.woNo} assignees={workOrder.assignees} inspectors={inspectors} />
      {!workOrderBlock(workOrder, "cancel") && <CancelWorkOrderButton planId={plan.id} workOrderId={workOrder.id} woNo={workOrder.woNo} calledQty={workOrder.calledQty} />}
    </div>
  );
}

const statusLabel = (status: PlanStatus) => CHECKLIST_STATUSES[checklistStatusOf(status)].label;

function HistoryTab({ history }: { history: PlanHistoryEntry[] }) {
  if (history.length === 0) return <p className="text-sm text-ti-400">ยังไม่มีประวัติ</p>;
  return (
    <ol className="space-y-3" aria-label="ประวัติสถานะแผน">
      {history.map((entry, index) => (
        <li key={index} className="app-panel rounded-panel border border-carbon-700 bg-carbon-800 px-4 py-3 text-sm">
          <p className="text-ti-50">
            {entry.from === null ? "เปิดแผน" : entry.to === "CANCELLED" ? "ยกเลิกแผน" : `${statusLabel(entry.from)} → ${statusLabel(entry.to)}`}
          </p>
          <p className="text-xs text-ti-400">
            {when.format(entry.at)}
            {entry.by && ` · ${entry.by}`}
          </p>
          {entry.reason && <p className="mt-1 text-ti-200">เหตุผล: {entry.reason}</p>}
        </li>
      ))}
    </ol>
  );
}

function Item({ term, value, mono, wide }: { term: string; value: string; mono?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-full" : undefined}>
      <dt className="text-xs text-ti-400">{term}</dt>
      <dd className={`break-words text-ti-200 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

function Stat({ term, value }: { term: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-ti-400">{term}</dt>
      <dd className="font-mono text-lg text-ti-50">{value.toLocaleString("th-TH")}</dd>
    </div>
  );
}

function Back({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-w-0 w-full space-y-5 p-4 sm:p-6">
      <Link href="/plans" className="text-sm text-ti-400 hover:text-ti-200">← รายการแผน</Link>
      {children}
    </div>
  );
}

"use client";

import { AppBack } from "@/components/ui/AppBack";
import Link from "next/link";
import type { ReactNode } from "react";
import { LoadError } from "@/components/feedback/LoadError";
import type { PlanInspectionSummary } from "@/lib/inspections/types";
import type { PlanHistoryItem, PlanView } from "@/lib/plans/detail";
import { PLAN_TABS, type PlanTab } from "@/lib/plans/detail-query";
import { cancelBlock, canFlagWaitingGoods, CHECKLIST_STATUSES, checklistStatusOf, type PlanStatus } from "@/lib/plans/rules";
import type { DocPlan, VendorInfo } from "@/lib/plans/store";
import { InspectionsTab } from "./InspectionsTab";
import { CancelPlanButton, PlanVendorEditor, SubmitToQaButton, WaitingGoodsToggle } from "./PlanActions";
import { ChecklistBadge, dateText, Deadline, Item, planProgress, ProgressBadge, QcBar, Stat, when } from "./PlanBits";
import { usePlanDetail } from "./usePlanDetail";
import { WorkOrdersTab } from "./WorkOrdersTab";

type Props = {
  planId: number;
  /** `?tab=`, already settled by the page. */
  tab: PlanTab;
  /** `?opened=<woNo>`: the work order that was just opened. */
  opened: string;
  /** `plan-open` (QC Head, QA Head, Admin): edits the vendor, flags "รอของ", cancels the plan. */
  canEdit: boolean;
  /** `work-order` (QC Head, Admin): opens, re-assigns and cancels work orders. */
  canManageWork: boolean;
  /** QC Head / QA Head: may cancel a plan that already has inspection results. */
  isHead: boolean;
};

/**
 * รายละเอียดแผน (docs/15 §4): the header, the three tabs and their content. The page checks the role and parses the
 * address; the plan, its sibling plans and its history are read from `GET /api/plans/[id]` and the work orders (only
 * while that tab is open) from `GET /api/plans/[id]/work-order-list`. Both load again by themselves whenever a form
 * on the page saves, so the header, the summary and the list move together. Switching tabs is a link: the address
 * changes, nothing is fetched again for the plan itself.
 */
export function PlanDetailView({ planId, tab, opened, canEdit, canManageWork, isHead }: Props) {
  const { data, loading, error, reload } = usePlanDetail(planId);
  if (!data) return <Back>{error ? <LoadError message={error} onRetry={reload} /> : <div role="status" aria-label="กำลังโหลดแผน" className="app-panel h-72 animate-pulse rounded-panel border border-carbon-700 bg-carbon-800" />}</Back>;

  const { plan, siblings, history, vendors, today, inspectionSummary, workOrderSummary } = data;
  const cancellable = canEdit && cancelBlock({ status: plan.status, qcDoneTotal: plan.qcDoneTotal, isHead }) === null;
  const cancelled = plan.status === "CANCELLED" ? history.findLast((entry) => entry.to === "CANCELLED") : undefined;
  const docLabel = plan.doc.docType === "INVOICE" ? "Invoice" : "PO";
  const reopenHref = `/plans/new?${new URLSearchParams({ docType: plan.doc.docType, vendorId: String(plan.doc.vendorId ?? ""), docNo: plan.doc.docNo })}`;

  const isPlanActiveForQa =
    plan.status === "QC_REVIEW" ||
    plan.status === "QC_IN_PROGRESS" ||
    plan.status === "ASSIGNED";

  const quotaMet = plan.qcDoneTotal >= plan.qcRequired;
  const hasPendingRework = (inspectionSummary?.reworkCount ?? 0) > 0;
  const allWorkOrdersCompleted = Boolean(workOrderSummary && workOrderSummary.allCompleted);

  // ปุ่มส่งต่อ QA จะ "เห็น" ก็ต่อเมื่อ:
  // 1. ตรวจครบตามเป้าหมายรวม (quotaMet)
  // 2. ไม่มีเครื่องค้างซ่อม Rework (!hasPendingRework)
  // 3. ใบงานทุกใบ (รวมใบงานที่เปิดเพิ่ม) ตรวจครบตาม Need (allWorkOrdersCompleted)
  const canSubmitToQa = isHead && isPlanActiveForQa && quotaMet && !hasPendingRework && allWorkOrdersCompleted;

  // หากยอดรวมถึงเป้าแล้ว แต่ยังมีใบงานไม่ครบตาม Need ให้แสดงสถานะแจ้งเตือน โดยไม่แสดงปุ่มส่งต่อ QA
  const showIncompleteWorkOrdersNotice =
    isHead && isPlanActiveForQa && quotaMet && workOrderSummary && !workOrderSummary.allCompleted;

  return (
    <Back>
      {error && <LoadError message={error} onRetry={reload} />}
      <div aria-busy={loading} className={`space-y-5 transition-opacity ${loading ? "opacity-60" : ""}`}>
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
              ยกเลิกแล้ว{plan.cancelledAt && ` เมื่อ ${when.format(new Date(plan.cancelledAt))}`}
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

        {showIncompleteWorkOrdersNotice && (
          <div
            role="status"
            aria-label="ยังมีใบงานที่ยังไม่เสร็จตาม Need"
            className="rounded-panel border border-amber-500/40 bg-amber-500/10 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-semibold text-base text-amber-400">
                <svg className="w-5 h-5 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>QC ตรวจยอดรวมถึงเป้าแล้ว — แต่ยังมีใบงานที่ตรวจไม่ครบตาม Need</span>
              </div>
              <p className="text-sm text-ti-300">
                ตรวจแล้ว {plan.qcDoneTotal}/{plan.qcRequired} เครื่อง · ยังมีใบงานที่ยังไม่เสร็จ:{" "}
                <span className="font-mono text-amber-200 font-medium">
                  {workOrderSummary.incompleteWorkOrders
                    .map((w) => `${w.woNo} (Need ${w.qtyNeed}, ตรวจแล้ว ${w.qtyDone})`)
                    .join(", ")}
                </span>
              </p>
              <p className="text-xs text-ti-400 pt-0.5">
                * ต้องตรวจให้ครบตาม Need ทุกใบงาน (รวมใบงานที่เปิดเพิ่ม) จึงจะแสดงปุ่มส่งต่อ QA
              </p>
            </div>
            <div className="shrink-0 text-xs font-mono text-amber-300 bg-amber-500/15 border border-amber-500/30 px-3 py-1.5 rounded-control self-start sm:self-center">
              ยังค้าง {workOrderSummary.incompleteWorkOrders.length} ใบงาน
            </div>
          </div>
        )}

        {canSubmitToQa && (
          <div
            role="region"
            aria-label="ตรวจทานและส่งต่อ QA"
            className="rounded-panel border border-ember-500/60 bg-ember-500/10 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-ember-400 font-semibold text-base">
                <svg className="w-5 h-5 text-ember-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                QC ตรวจครบตามเป้าหมายและครบทุกใบงานแล้ว — รอหัวหน้าตรวจทานและส่งต่อ QA
              </div>
              <p className="text-sm text-ti-300">
                ตรวจแล้ว {plan.qcDoneTotal}/{plan.qcRequired} เครื่อง · ผ่าน {inspectionSummary?.passCount ?? plan.qcDoneTotal} เครื่อง
                {inspectionSummary && inspectionSummary.rejectCount > 0 ? (
                  <span className="text-ti-400"> · คัดออก {inspectionSummary.rejectCount} เครื่อง</span>
                ) : null}
                {workOrderSummary && (
                  <span className="text-ti-300"> · ใบงานทั้งหมด {workOrderSummary.activeCount} ใบ (เสร็จครบถ้วน)</span>
                )}
              </p>
            </div>
            <SubmitToQaButton
              planId={plan.id}
              planNo={plan.planNo}
              modelCode={plan.model.code}
              lotQty={plan.lotQty}
              qcDoneTotal={plan.qcDoneTotal}
              qcRequired={plan.qcRequired}
              passCount={inspectionSummary?.passCount ?? plan.qcDoneTotal}
              reworkCount={inspectionSummary?.reworkCount ?? 0}
              rejectCount={inspectionSummary?.rejectCount ?? 0}
              workOrderSummary={workOrderSummary}
            />
          </div>
        )}

        {plan.status === "QA_PENDING" && (
          <div
            role="status"
            className="rounded-panel border border-cyan-500/50 bg-cyan-500/10 p-4 text-sm text-cyan-200 flex items-center gap-3"
          >
            <svg className="w-5 h-5 text-cyan-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <span className="font-medium text-cyan-300">ส่งต่อให้ฝ่าย QA เรียบร้อยแล้ว</span> — แผนตรวจนี้อยู่ในคิวงานของฝ่าย QA เพื่อรอสุ่มตรวจตามเกณฑ์ AQL
            </div>
          </div>
        )}

        <nav aria-label="ส่วนของแผน" className="flex gap-1 border-b border-carbon-700">
          {(Object.keys(PLAN_TABS) as PlanTab[]).map((key) => (
            <Link
              key={key}
              href={key === "info" ? `/plans/${plan.id}` : `/plans/${plan.id}?tab=${key}`}
              aria-current={tab === key ? "page" : undefined}
              className={`-mb-px inline-flex h-11 items-center border-b-2 px-4 text-sm ${tab === key ? "border-ember-500 text-ti-50" : "border-transparent text-ti-400 hover:text-ti-200"}`}
            >
              {PLAN_TABS[key]}
            </Link>
          ))}
        </nav>

        {tab === "info" && <InfoTab plan={plan} siblings={siblings} today={today} canEdit={canEdit} vendors={vendors} inspectionSummary={inspectionSummary} />}
        {tab === "work" && <WorkOrdersTab plan={plan} canManage={canManageWork} opened={opened} />}
        {tab === "inspections" && <InspectionsTab planId={plan.id} />}
        {tab === "history" && <HistoryTab history={history} />}
      </div>
    </Back>
  );
}

type InfoProps = { plan: PlanView; siblings: DocPlan[]; today: string; canEdit: boolean; vendors: VendorInfo[] | null; inspectionSummary?: PlanInspectionSummary };

function InfoTab({ plan, siblings, today, canEdit, vendors, inspectionSummary }: InfoProps) {
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
            {plan.productionWoNo && <Item term="เลขที่ผลิต (WO)" value={plan.productionWoNo} mono />}
            {canEdit && vendors ? (
              <PlanVendorEditor planId={plan.id} vendorId={doc.vendorId} vendorName={doc.vendorName} vendors={vendors} planCount={siblings.length} />
            ) : (
              <Item term={isInvoice ? "Vendor" : "Vendor / โรงงาน"} value={doc.vendorName ?? "ยังไม่ระบุ"} />
            )}
            {isInvoice ? <Item term="วันที่ Invoice" value={dateText(doc.invoiceDate)} /> : <Item term="วันที่ PO" value={dateText(doc.docDate)} />}
            {isInvoice && doc.expectedSkuCount ? <Item term="จำนวน SKU ทั้งหมด" value={doc.expectedSkuCount.toLocaleString("th-TH")} /> : null}
            {doc.remarks && <Item term="หมายเหตุเอกสาร" value={doc.remarks} wide />}
          </dl>
          <div className="space-y-1 border-t border-carbon-700 pt-3 text-sm">
            <p className="text-ti-400">
              เปิดแผนแล้ว <b className="text-ti-50">{siblings.length}</b>
              {isInvoice && doc.expectedSkuCount ? ` จาก ${doc.expectedSkuCount} SKU` : " แผน"} ในเอกสารนี้
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
            <Item term="เปิดโดย" value={`${plan.openedBy ?? "—"} · ${when.format(new Date(plan.openedAt))}`} />
            <Item term="QC ผู้รับผิดชอบหลัก" value={plan.responsibleQc ?? "— (ตั้งเมื่อเปิดใบงานแรก)"} />
            {plan.description && <Item term="Description" value={plan.description} wide />}
            {plan.remarks && <Item term="หมายเหตุ" value={plan.remarks} wide />}
          </dl>
        </section>
      </div>

      {/* Phone: the summary (QC count, deadline, รอของ) comes first; laptop: right column. */}
      <aside aria-label="สรุปแผน" className="order-first space-y-4 app-panel rounded-panel border border-pass/60 bg-[color-mix(in_srgb,var(--color-pass)_12%,var(--color-carbon-800))] p-4 lg:order-none">
        <div>
          <p className="text-xs text-ti-400">QC ตรวจแล้ว / ต้องตรวจ</p>
          <p className="font-mono text-3xl text-ti-50">
            {plan.qcDoneTotal} <span className="text-ti-400">/ {plan.qcRequired}</span>
          </p>
          <QcBar done={plan.qcDoneTotal} required={plan.qcRequired} className="mt-2" />
          <p className="mt-1 text-xs text-ti-500">ปัดขึ้น({plan.lotQty.toLocaleString("th-TH")} × {plan.qcPercent}%) = {plan.qcRequired}</p>

          {/* Breakdown of inspection results */}
          {inspectionSummary && (
            <div className="mt-3 pt-3 border-t border-carbon-700/80 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-pass font-medium">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-pass" />
                  ผ่านเกณฑ์ (PASS)
                </span>
                <span className="font-mono">{inspectionSummary.passCount} เครื่อง</span>
              </div>
              {inspectionSummary.reworkCount > 0 && (
                <div className="flex items-center justify-between text-fail font-medium">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-fail animate-pulse" />
                    รอ Rework แก้ไข
                  </span>
                  <span className="font-mono bg-fail/20 text-fail px-1.5 py-0.5 rounded border border-fail/40">
                    {inspectionSummary.reworkCount} เครื่อง
                  </span>
                </div>
              )}
              {inspectionSummary.rejectCount > 0 && (
                <div className="flex items-center justify-between text-ti-400 font-medium">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-carbon-500" />
                    Reject คัดทิ้ง
                  </span>
                  <span className="font-mono">{inspectionSummary.rejectCount} เครื่อง</span>
                </div>
              )}
              <div className="flex items-center justify-between text-ti-400">
                <span>คงเหลือรอตรวจ</span>
                <span className="font-mono">{Math.max(0, plan.qcRequired - plan.qcDoneTotal)} เครื่อง</span>
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-carbon-700 pt-3 text-sm">
          <p className="text-xs text-ti-400">กำหนดตรวจ 90 วัน</p>
          {isInvoice ? <Deadline deadline={doc.qcDeadline} today={today} docType="INVOICE" /> : <p className="text-ti-500">ไม่ใช้กับปั๊มผลิตเอง</p>}
        </div>
        <dl className="grid grid-cols-3 gap-2 border-t border-carbon-700 pt-3 text-center text-sm">
          <Stat term="ล็อต" value={plan.lotQty} />
          <Stat term="เรียกเข้าแล้ว" value={plan.lotCalledTotal} />
          <Stat term="คงเหลือ" value={plan.lotQty - plan.lotCalledTotal} />
        </dl>
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

const statusLabel = (status: PlanStatus) => CHECKLIST_STATUSES[checklistStatusOf(status)].label;

function HistoryTab({ history }: { history: PlanHistoryItem[] }) {
  if (history.length === 0) return <p className="text-sm text-ti-400">ยังไม่มีประวัติ</p>;
  return (
    <ol className="space-y-3" aria-label="ประวัติสถานะแผน">
      {history.map((entry, index) => (
        <li key={index} className="app-panel rounded-panel border border-carbon-700 bg-carbon-800 px-4 py-3 text-sm">
          <p className="text-ti-50">
            {entry.from === null ? "เปิดแผน" : entry.to === "CANCELLED" ? "ยกเลิกแผน" : `${statusLabel(entry.from)} → ${statusLabel(entry.to)}`}
          </p>
          <p className="text-xs text-ti-400">
            {when.format(new Date(entry.at))}
            {entry.by && ` · ${entry.by}`}
          </p>
          {entry.reason && <p className="mt-1 text-ti-200">เหตุผล: {entry.reason}</p>}
        </li>
      ))}
    </ol>
  );
}

function Back({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0 w-full space-y-5 p-4 sm:p-6">
      <AppBack href="/plans">กลับไปรายการแผน</AppBack>
      {children}
    </div>
  );
}

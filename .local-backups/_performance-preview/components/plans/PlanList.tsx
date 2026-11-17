"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CardsSkeleton } from "@/components/feedback/CardsSkeleton";
import { LoadError } from "@/components/feedback/LoadError";
import type { PlanListItem, PlanListPayload } from "@/lib/plans/list";
import { activeFilterCount, PLAN_PAGE_SIZE, planListHref, type PlanListValues } from "@/lib/plans/list-query";
import { CHECKLIST_STATUSES, PROGRESS_LABELS, type ChecklistStatus, type PlanSort, type Progress } from "@/lib/plans/rules";
import { MoreFilters } from "./MoreFilters";
import { ChecklistBadge, Deadline, ProgressBadge, planProgress, QcBar, when } from "./PlanBits";
import { usePlanList } from "./usePlanList";

const SORT_LABELS: Record<PlanSort, string> = { opened: "เปิดล่าสุดก่อน", plan_no: "เลขแผน น้อย → มาก", deadline: "กำหนด 90 วัน ใกล้สุดก่อน" };
const fieldClass = "h-11 w-full rounded-control border border-carbon-600 bg-carbon-900 px-3 text-sm text-ti-50 focus:border-ember-500 md:w-auto";

type Props = {
  /** QC Head, QA Head, Admin: gets the "＋ เปิดแผน" button and the link in an empty list (`plan-open`). */
  canOpen: boolean;
  /** The filters the address asks for, already parsed by the page (`parsePlanListQuery`). */
  values: PlanListValues;
};

/**
 * รายการแผนตรวจ (docs/15 §2): 1 plan = 1 Invoice/PO × 1 Model. The page checks the role; one page of the list,
 * with the filter options and today's date, is read from `GET /api/plans`. The search form stays a plain GET form,
 * and the sort headers, "ล้าง" and the page links stay links: each changes the address, which loads again.
 */
export function PlanList({ canOpen, values }: Props) {
  const { data, loading, error, reload } = usePlanList(values);
  const filtered = Boolean(values.q) || activeFilterCount(values) > 0;
  return (
    <Shell canOpen={canOpen} total={data?.total} dimmed={loading && data !== null}>
      {error && <LoadError message={error} onRetry={reload} />}
      {data ? (
        <>
          <Filters values={values} options={data.options} filtered={filtered} />
          <Results data={data} values={values} filtered={filtered} canOpen={canOpen} loading={loading} />
        </>
      ) : (
        !error && (
          <>
            <FiltersSkeleton />
            <CardsSkeleton label="กำลังโหลดรายการแผน" />
          </>
        )
      )}
    </Shell>
  );
}

function Results({ data, values, filtered, canOpen, loading }: { data: PlanListPayload; values: PlanListValues; filtered: boolean; canOpen: boolean; loading: boolean }) {
  const { rows, total, page, today } = data;
  const pages = Math.max(1, Math.ceil(total / PLAN_PAGE_SIZE));
  return (
    <>
      {/* While a new filter or page loads, the rows and the page links stay as they were (dimmed) instead of blanking. */}
      <div aria-busy={loading} className={`space-y-5 transition-opacity ${loading ? "opacity-60" : ""}`}>
        {rows.length === 0 ? (
          <p className="app-panel rounded-panel border border-carbon-700 bg-carbon-800 p-5 text-sm text-ti-400">
            {filtered ? "ไม่พบแผนที่ตรงกับเงื่อนไข" : "ยังไม่มีแผนตรวจ"}
            {!filtered && canOpen && (
              <>
                {" — "}
                <Link href="/plans/new" className="text-ember-400 underline-offset-4 hover:underline">เปิดแผนแรก</Link>
              </>
            )}
          </p>
        ) : (
          <>
            <PlanTable rows={rows} values={values} today={today} />
            <ul className="space-y-3 md:hidden" aria-label="รายการแผนตรวจ">
              {rows.map((row) => <PlanCard key={row.id} row={row} today={today} />)}
            </ul>
          </>
        )}

        {pages > 1 && (
          <nav aria-label="หน้า" className="flex items-center justify-between text-sm text-ti-400">
            {page > 1 ? <Link href={planListHref(values, { page: page - 1 })} className="underline-offset-4 hover:underline">← ก่อนหน้า</Link> : <span />}
            <span>หน้า {page} / {pages}</span>
            {page < pages ? <Link href={planListHref(values, { page: page + 1 })} className="underline-offset-4 hover:underline">ถัดไป →</Link> : <span />}
          </nav>
        )}
      </div>

      <p className="flex flex-wrap items-center gap-2 text-xs text-ti-500">
        <span>ความคืบหน้า:</span>
        {(Object.keys(PROGRESS_LABELS) as Progress[]).map((progress) => <ProgressBadge key={progress} progress={progress} />)}
      </p>
    </>
  );
}

/**
 * The address is the truth: a field whose value in the address changes (a sort header, "ล้าง") is remounted
 * so it shows the new value — an uncontrolled field would keep what it had. The Vendor and pump-type lists
 * come with the data, so the form is drawn only once they are here and the selected option is always in them.
 */
function Filters({ values, options, filtered }: { values: PlanListValues; options: PlanListPayload["options"]; filtered: boolean }) {
  return (
    <form method="get" action="/plans" role="search" className="flex flex-wrap items-end gap-3">
      <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm text-ti-400">
        <span>ค้นหา</span>
        <input key={`q:${values.q}`} name="q" type="search" defaultValue={values.q} maxLength={100} placeholder="เลขแผน / Invoice / PO / Model / Vendor" className="h-11 w-full rounded-control border border-carbon-600 bg-carbon-900 px-3 text-sm text-ti-50 placeholder:text-ti-500 focus:border-ember-500" />
      </label>
      <MoreFilters active={activeFilterCount(values)}>
        <label className="flex flex-col gap-1 text-sm text-ti-400">
          <span>สถานะ</span>
          <select key={`status:${values.status}`} name="status" defaultValue={values.status} className={fieldClass}>
            <option value="">ทั้งหมด (ยกเว้นยกเลิก)</option>
            {(Object.keys(CHECKLIST_STATUSES) as ChecklistStatus[]).map((key) => <option key={key} value={key}>{CHECKLIST_STATUSES[key].label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-ti-400">
          <span>Vendor</span>
          <select key={`vendor:${values.vendor}`} name="vendor" defaultValue={values.vendor} className={fieldClass}>
            <option value="">ทั้งหมด</option>
            <option value="none">ยังไม่ระบุ Vendor</option>
            {options.vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-ti-400">
          <span>ประเภทปั๊ม</span>
          <select key={`ptype:${values.ptype}`} name="ptype" defaultValue={values.ptype} className={fieldClass}>
            <option value="">ทั้งหมด</option>
            {options.pumpTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-ti-400">
          <span>เปิดตั้งแต่</span>
          <input key={`from:${values.from}`} name="from" type="date" defaultValue={values.from} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ti-400">
          <span>ถึง</span>
          <input key={`to:${values.to}`} name="to" type="date" defaultValue={values.to} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ti-400">
          <span>เรียง</span>
          <select key={`sort:${values.sort}`} name="sort" defaultValue={values.sort} className={fieldClass}>
            {(Object.keys(SORT_LABELS) as PlanSort[]).map((sort) => <option key={sort} value={sort}>{SORT_LABELS[sort]}</option>)}
          </select>
        </label>
      </MoreFilters>
      <div className="flex gap-2">
        <button type="submit" className="h-11 rounded-control border border-ti-600 px-4 text-sm text-ti-200 hover:border-ti-400">ค้นหา</button>
        {filtered && <Link href={planListHref(values, { q: "", status: "", vendor: "", ptype: "", from: "", to: "", page: 1 })} className="inline-flex h-11 items-center px-2 text-sm text-ti-400 underline-offset-4 hover:underline">ล้าง</Link>}
      </div>
    </form>
  );
}

function FiltersSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-wrap items-end gap-3">
      <div className="h-11 min-w-[12rem] flex-1 animate-pulse rounded-control bg-carbon-800" />
      <div className="h-11 w-24 animate-pulse rounded-control bg-carbon-800" />
    </div>
  );
}

function SortHeader({ label, sort, values }: { label: string; sort: PlanSort; values: PlanListValues }) {
  const current = values.sort === sort;
  return (
    <th scope="col" aria-sort={current ? "ascending" : undefined} className="px-3 py-2 font-medium">
      <Link href={planListHref(values, { sort, page: 1 })} className={`underline-offset-4 hover:underline ${current ? "text-ember-400" : ""}`}>
        {label}{current ? " ▲" : ""}
      </Link>
    </th>
  );
}

function PlanTable({ rows, values, today }: { rows: PlanListItem[]; values: PlanListValues; today: string }) {
  return (
    <div className="hidden overflow-x-auto app-panel rounded-panel border border-carbon-700 bg-carbon-800 md:block">
      <table className="w-full min-w-[900px] text-sm">
        <caption className="sr-only">รายการแผนตรวจ — คลิกแถวเพื่อดูรายละเอียด</caption>
        <thead className="bg-carbon-900 text-left text-xs text-ti-400">
          <tr>
            <SortHeader label="เลขแผน" sort="plan_no" values={values} />
            <th scope="col" className="px-3 py-2 font-medium">Invoice / PO</th>
            <th scope="col" className="px-3 py-2 font-medium">Model</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">ล็อต</th>
            <th scope="col" className="px-3 py-2 font-medium">QC ตรวจ / ต้อง</th>
            <th scope="col" className="px-3 py-2 font-medium">สถานะ Checklist</th>
            <th scope="col" className="px-3 py-2 font-medium">ความคืบหน้า</th>
            <SortHeader label="กำหนด 90 วัน" sort="deadline" values={values} />
            <th scope="col" className="px-3 py-2 font-medium">ธง</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="relative border-t border-carbon-700 align-top text-ti-200 hover:bg-carbon-700/30">
              <td className="px-3 py-2">
                {/* The plan number's link covers the whole row (docs/15: คลิกแถว → รายละเอียด). */}
                <Link href={`/plans/${row.id}`} className="font-mono font-semibold text-ti-50 after:absolute after:inset-0 hover:text-ember-400">{row.planNo}</Link>
                <span className="block text-xs text-ti-500">เปิด {when.format(new Date(row.openedAt))}</span>
              </td>
              <td className="px-3 py-2">
                <span className="block">{row.docType === "PO" ? `PO ${row.docNo}` : row.docNo}</span>
                <span className="block text-xs text-ti-400">{row.vendorName ?? "ยังไม่ระบุ Vendor"}</span>
              </td>
              <td className="px-3 py-2">
                <span className="block">{row.modelCode}</span>
                {row.pumpType && <span className="block text-xs text-ti-400">{row.pumpType}</span>}
              </td>
              <td className="px-3 py-2 text-right font-mono">{row.lotQty.toLocaleString("th-TH")}</td>
              <td className="px-3 py-2">
                <span className="font-mono">{row.qcDoneTotal} / {row.qcRequired}</span>
                <QcBar done={row.qcDoneTotal} required={row.qcRequired} className="mt-1 w-20" />
              </td>
              <td className="px-3 py-2"><ChecklistBadge status={row.status} /></td>
              <td className="px-3 py-2"><ProgressBadge progress={planProgress(row)} /></td>
              <td className="px-3 py-2 text-sm"><Deadline deadline={row.qcDeadline} today={today} docType={row.docType} /></td>
              <td className="px-3 py-2">{row.waitingGoods && <WaitingFlag />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlanCard({ row, today }: { row: PlanListItem; today: string }) {
  return (
    <li>
      <Link href={`/plans/${row.id}`} className="block space-y-2 app-panel rounded-panel border border-carbon-700 bg-carbon-800 p-4 hover:border-carbon-600">
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono font-semibold text-ti-50">{row.planNo}</span>
          {row.status === "CANCELLED" ? <ChecklistBadge status={row.status} /> : <ProgressBadge progress={planProgress(row)} />}
        </div>
        <p className="text-sm text-ti-200">
          {row.modelCode} · {row.docType === "PO" ? `PO ${row.docNo}` : row.docNo}
          <span className="block text-xs text-ti-400">{row.vendorName ?? "ยังไม่ระบุ Vendor"}</span>
        </p>
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-mono text-ti-200">QC {row.qcDoneTotal} / {row.qcRequired}</span>
          <span className="flex items-center gap-2 text-xs">
            {row.waitingGoods && <WaitingFlag />}
            {row.docType === "INVOICE" && <Deadline deadline={row.qcDeadline} today={today} docType={row.docType} compact />}
          </span>
        </div>
        <QcBar done={row.qcDoneTotal} required={row.qcRequired} />
      </Link>
    </li>
  );
}

function WaitingFlag() {
  return <span className="inline-block whitespace-nowrap rounded-full border border-ember-500/50 px-2 py-0.5 text-xs text-ember-400">รอของ</span>;
}

function Shell({ canOpen, total, dimmed, children }: { canOpen: boolean; total?: number; dimmed: boolean; children: ReactNode }) {
  return (
    <div className="min-w-0 w-full space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl text-ti-50">
            รายการแผนตรวจ{total !== undefined && <span className={`ml-2 font-mono text-base text-ti-400 transition-opacity ${dimmed ? "opacity-60" : ""}`}>({total})</span>}
          </h1>
          <p className="text-sm text-ti-400">1 แผน = 1 Invoice/PO × 1 Model — คลิกแผนเพื่อดูรายละเอียด</p>
        </div>
        {canOpen && (
          <Link href="/plans/new" className="inline-flex h-11 items-center rounded-control app-primary-action bg-ember-500 px-4 text-sm font-semibold text-carbon-900 hover:bg-ember-400">
            ＋ เปิดแผน
          </Link>
        )}
      </header>
      {children}
    </div>
  );
}

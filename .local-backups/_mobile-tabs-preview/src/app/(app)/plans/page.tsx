import Link from "next/link";
import { Suspense } from "react";
import { requirePageAccess } from "@/lib/auth/dal";
import { canAccessPage } from "@/lib/auth/page-access";
import { dbProblem, dbProblemMessages, isDbError } from "@/lib/db/errors";
import { activeFilterCount, parsePlanListQuery, PLAN_PAGE_SIZE, planListHref, type PlanListValues } from "@/lib/plans/list-query";
import { CHECKLIST_STATUSES, PROGRESS_LABELS, thaiToday, type ChecklistStatus, type Progress } from "@/lib/plans/rules";
import { getPlanStore } from "@/lib/plans/runtime";
import type { PlanFilterOptions, PlanListRow, PlanSort } from "@/lib/plans/store";
import { MoreFilters } from "./MoreFilters";
import { ChecklistBadge, Deadline, ProgressBadge, planProgress, QcBar, when } from "./PlanBits";

export const metadata = { title: "แผนตรวจ" };

type SearchParams = Record<string, string | string[] | undefined>;

const SORT_LABELS: Record<PlanSort, string> = { opened: "เปิดล่าสุดก่อน", plan_no: "เลขแผน น้อย → มาก", deadline: "กำหนด 90 วัน ใกล้สุดก่อน" };
const fieldClass = "h-11 w-full rounded-[10px] border border-carbon-600 bg-carbon-900 px-3 text-sm text-ti-50 focus:border-ember-500 md:w-auto";

export default function PlansPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={<p className="p-6 text-ti-400">กำลังโหลด…</p>}>
      <Plans searchParams={searchParams} />
    </Suspense>
  );
}

async function Plans({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageAccess("plans", "/plans");
  const canOpen = canAccessPage(user.roles, "plan-open");
  const { values, filter } = parsePlanListQuery(await searchParams);

  let data: { rows: PlanListRow[]; total: number; options: PlanFilterOptions };
  try {
    const store = getPlanStore();
    data = { ...(await store.listPlans(filter)), options: await store.planFilterOptions() };
  } catch (error) {
    if (!isDbError(error)) throw error;
    console.error("[db] plan list failed", error.message);
    return (
      <Shell canOpen={canOpen}>
        <p role="alert" className="rounded-[10px] border border-red-500/50 bg-carbon-800 px-3 py-2 text-sm text-red-300">{dbProblemMessages[dbProblem(error)]}</p>
      </Shell>
    );
  }

  const today = thaiToday(new Date());
  const pages = Math.max(1, Math.ceil(data.total / PLAN_PAGE_SIZE));
  const filtered = Boolean(values.q) || activeFilterCount(values) > 0;

  return (
    <Shell canOpen={canOpen} total={data.total}>
      <Filters values={values} options={data.options} filtered={filtered} />

      {data.rows.length === 0 ? (
        <p className="app-panel rounded-xl border border-carbon-700 bg-carbon-800 p-5 text-sm text-ti-400">
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
          <PlanTable rows={data.rows} values={values} today={today} />
          <ul className="space-y-3 md:hidden" aria-label="รายการแผนตรวจ">
            {data.rows.map((row) => <PlanCard key={row.id} row={row} today={today} />)}
          </ul>
        </>
      )}

      {pages > 1 && (
        <nav aria-label="หน้า" className="flex items-center justify-between text-sm text-ti-400">
          {values.page > 1 ? <Link href={planListHref(values, { page: values.page - 1 })} className="underline-offset-4 hover:underline">← ก่อนหน้า</Link> : <span />}
          <span>หน้า {values.page} / {pages}</span>
          {values.page < pages ? <Link href={planListHref(values, { page: values.page + 1 })} className="underline-offset-4 hover:underline">ถัดไป →</Link> : <span />}
        </nav>
      )}

      <p className="flex flex-wrap items-center gap-2 text-xs text-ti-500">
        <span>ความคืบหน้า:</span>
        {(Object.keys(PROGRESS_LABELS) as Progress[]).map((progress) => <ProgressBadge key={progress} progress={progress} />)}
      </p>
    </Shell>
  );
}

function Filters({ values, options, filtered }: { values: PlanListValues; options: PlanFilterOptions; filtered: boolean }) {
  return (
    <form method="get" action="/plans" role="search" className="flex flex-wrap items-end gap-3">
      <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm text-ti-400">
        <span>ค้นหา</span>
        <input name="q" type="search" defaultValue={values.q} maxLength={100} placeholder="เลขแผน / Invoice / PO / Model / Vendor" className="h-11 w-full rounded-[10px] border border-carbon-600 bg-carbon-900 px-3 text-sm text-ti-50 placeholder:text-ti-500 focus:border-ember-500" />
      </label>
      <MoreFilters active={activeFilterCount(values)}>
        <label className="flex flex-col gap-1 text-sm text-ti-400">
          <span>สถานะ</span>
          <select name="status" defaultValue={values.status} className={fieldClass}>
            <option value="">ทั้งหมด (ยกเว้นยกเลิก)</option>
            {(Object.keys(CHECKLIST_STATUSES) as ChecklistStatus[]).map((key) => <option key={key} value={key}>{CHECKLIST_STATUSES[key].label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-ti-400">
          <span>Vendor</span>
          <select name="vendor" defaultValue={values.vendor} className={fieldClass}>
            <option value="">ทั้งหมด</option>
            {options.vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-ti-400">
          <span>ประเภทปั๊ม</span>
          <select name="ptype" defaultValue={values.ptype} className={fieldClass}>
            <option value="">ทั้งหมด</option>
            {options.pumpTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-ti-400">
          <span>เปิดตั้งแต่</span>
          <input name="from" type="date" defaultValue={values.from} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ti-400">
          <span>ถึง</span>
          <input name="to" type="date" defaultValue={values.to} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ti-400">
          <span>เรียง</span>
          <select name="sort" defaultValue={values.sort} className={fieldClass}>
            {(Object.keys(SORT_LABELS) as PlanSort[]).map((sort) => <option key={sort} value={sort}>{SORT_LABELS[sort]}</option>)}
          </select>
        </label>
      </MoreFilters>
      <div className="flex gap-2">
        <button type="submit" className="h-11 rounded-[10px] border border-ti-600 px-4 text-sm text-ti-200 hover:border-ti-400">ค้นหา</button>
        {filtered && <Link href={planListHref(values, { q: "", status: "", vendor: "", ptype: "", from: "", to: "", page: 1 })} className="inline-flex h-11 items-center px-2 text-sm text-ti-400 underline-offset-4 hover:underline">ล้าง</Link>}
      </div>
    </form>
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

function PlanTable({ rows, values, today }: { rows: PlanListRow[]; values: PlanListValues; today: string }) {
  return (
    <div className="hidden overflow-x-auto app-panel rounded-xl border border-carbon-700 bg-carbon-800 md:block">
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
                <span className="block text-xs text-ti-500">เปิด {when.format(row.openedAt)}</span>
              </td>
              <td className="px-3 py-2">
                <span className="block">{row.docType === "PO" ? `PO ${row.docNo}` : row.docNo}</span>
                <span className="block text-xs text-ti-400">{row.vendorName}</span>
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

function PlanCard({ row, today }: { row: PlanListRow; today: string }) {
  return (
    <li>
      <Link href={`/plans/${row.id}`} className="block space-y-2 app-panel rounded-xl border border-carbon-700 bg-carbon-800 p-4 hover:border-carbon-600">
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono font-semibold text-ti-50">{row.planNo}</span>
          {row.status === "CANCELLED" ? <ChecklistBadge status={row.status} /> : <ProgressBadge progress={planProgress(row)} />}
        </div>
        <p className="text-sm text-ti-200">
          {row.modelCode} · {row.docType === "PO" ? `PO ${row.docNo}` : row.docNo}
          <span className="block text-xs text-ti-400">{row.vendorName}</span>
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

function Shell({ canOpen, total, children }: { canOpen: boolean; total?: number; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl text-ti-50">
            รายการแผนตรวจ{total !== undefined && <span className="ml-2 font-mono text-base text-ti-400">({total})</span>}
          </h1>
          <p className="text-sm text-ti-400">1 แผน = 1 Invoice/PO × 1 Model — คลิกแผนเพื่อดูรายละเอียด</p>
        </div>
        {canOpen && (
          <Link href="/plans/new" className="inline-flex h-11 items-center rounded-[10px] app-primary-action bg-ember-500 px-4 text-sm font-semibold text-carbon-900 hover:bg-ember-400">
            ＋ เปิดแผน
          </Link>
        )}
      </header>
      {children}
    </div>
  );
}

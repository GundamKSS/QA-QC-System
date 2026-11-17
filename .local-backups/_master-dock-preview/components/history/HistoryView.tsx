"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CardsSkeleton } from "@/components/feedback/CardsSkeleton";
import { LoadError } from "@/components/feedback/LoadError";
import { dateText } from "@/components/plans/PlanBits";
import type { HistoryItem, HistoryPayload } from "@/lib/plans/history";
import { HISTORY_KINDS, HISTORY_PAGE_SIZE, HISTORY_RANGES, historyHref, type HistoryValues } from "@/lib/plans/history-query";
import { WORK_ORDER_STATUS_LABELS, WORK_ORDER_TYPE_LABELS } from "@/lib/plans/rules";
import { useHistoryData } from "./useHistoryData";

type Props = {
  /** QC Head / QA Head: gets the all / mine switch and a link from each card to its plan (docs/18 §2). */
  isHead: boolean;
  /** The filter the address asks for, already parsed by the page (`parseHistoryQuery`). */
  values: HistoryValues;
};

/**
 * ประวัติ (docs/18): work orders that are no longer in anyone's hands (sent, closed, cancelled).
 * Inspectors see their own; QC Head / QA Head see everyone's and can narrow to "ของฉัน".
 * The page checks the role; one page of the list is read from `GET /api/history`.
 */
export function HistoryView({ isHead, values }: Props) {
  const { data, loading, error, reload } = useHistoryData(values);
  return (
    <Shell isHead={isHead} values={values} total={data?.total} dimmed={loading && data !== null}>
      {error && <LoadError message={error} onRetry={reload} />}
      {data ? <Rows data={data} values={values} isHead={isHead} loading={loading} /> : !error && <CardsSkeleton label="กำลังโหลดประวัติ" />}
    </Shell>
  );
}

function Rows({ data, values, isHead, loading }: { data: HistoryPayload; values: HistoryValues; isHead: boolean; loading: boolean }) {
  const { rows, me, view, page, total } = data;
  const pages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
  return (
    // While a new filter or page loads, the rows and the page links stay as they were (dimmed) instead of blanking.
    <div aria-busy={loading} className={`space-y-5 transition-opacity ${loading ? "opacity-60" : ""}`}>
      {view === "mine" && !me && <p role="alert" className="text-sm text-red-300">ไม่พบบัญชีของคุณในฐานข้อมูล QCheck — กรุณาออกจากระบบแล้วเข้าใหม่</p>}
      {rows.length === 0 ? (
        <p className="rounded-panel border border-dashed border-carbon-600 p-5 text-sm text-ti-400">ยังไม่มีประวัติในช่วงนี้</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="ประวัติใบงาน">
          {rows.map((job) => <Row key={job.id} job={job} me={me} href={isHead ? `/plans/${job.planId}?tab=work` : null} />)}
        </ul>
      )}
      {pages > 1 && (
        <nav aria-label="หน้า" className="flex items-center justify-between text-sm text-ti-400">
          {page > 1 ? <Link href={historyHref(values, { page: page - 1 })} className="underline-offset-4 hover:underline">← ก่อนหน้า</Link> : <span />}
          <span>หน้า {page} / {pages}</span>
          {page < pages ? <Link href={historyHref(values, { page: page + 1 })} className="underline-offset-4 hover:underline">ถัดไป →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}

function Row({ job, me, href }: { job: HistoryItem; me: string | null; href: string | null }) {
  const cancelled = job.status === "CANCELLED";
  const others = job.assignees.filter((person) => person.userId !== me);
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono font-semibold text-ti-50">{job.woNo}</span>
        <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${cancelled ? "border-fail/50 text-fail" : "border-carbon-600 text-ti-400"}`}>{WORK_ORDER_STATUS_LABELS[job.status]}</span>
      </div>
      <p className="text-sm text-ti-200">
        {job.modelCode} · {job.docType === "PO" ? `PO ${job.docNo}` : job.docNo}
        <span className="block text-xs text-ti-400">{job.vendorName ?? "ยังไม่ระบุ Vendor"}</span>
      </p>
      <p className="text-xs text-ti-400">เรียกเข้า {job.calledQty.toLocaleString("th-TH")} เครื่อง · {dateText(job.calledDate)} · {WORK_ORDER_TYPE_LABELS[job.type]}</p>
      {!cancelled && job.type === "QC" && <p className="font-mono text-sm text-ti-200">ต้องตรวจ {job.qtyNeed} · ตรวจแล้ว {job.qtyDone}</p>}
      {cancelled && job.cancelReason && <p className="text-xs text-ti-400">เหตุผล: {job.cancelReason}</p>}
      <p className="text-xs text-ti-400">{me ? (others.length ? `ร่วมกับ: ${others.map((person) => person.name).join(", ")}` : "") : `QC: ${job.assignees.map((person) => person.name).join(", ")}`}</p>
    </>
  );
  return (
    <li className={`rounded-panel border border-carbon-700 bg-carbon-800 p-4 ${cancelled ? "opacity-80" : ""}`}>
      {href ? <Link href={href} className="block space-y-2 hover:opacity-90">{body}</Link> : <div className="space-y-2">{body}</div>}
    </li>
  );
}

function Shell({ isHead, values, total, dimmed, children }: { isHead: boolean; values: HistoryValues; total?: number; dimmed: boolean; children: ReactNode }) {
  const pill = (active: boolean) => `rounded-control px-3 py-2 ${active ? "bg-carbon-700 text-ti-50" : "text-ti-400 hover:text-ti-200"}`;
  return (
    <div className="min-w-0 w-full space-y-5 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl text-ti-50">ประวัติ{total !== undefined && <span className={`ml-2 font-mono text-base text-ti-400 transition-opacity ${dimmed ? "opacity-60" : ""}`}>({total})</span>}</h1>
        <p className="text-sm text-ti-400">ใบงานที่ส่งแล้ว ปิดแล้ว หรือยกเลิก — ใบงานที่กำลังทำอยู่ที่ “งานของฉัน”</p>
      </header>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <nav aria-label="สถานะ" className="flex rounded-panel border border-carbon-600 bg-carbon-900 p-1">
          {(Object.keys(HISTORY_KINDS) as (keyof typeof HISTORY_KINDS)[]).map((kind) => (
            <Link key={kind} href={historyHref(values, { kind, page: 1 })} aria-current={values.kind === kind ? "page" : undefined} className={pill(values.kind === kind)}>{HISTORY_KINDS[kind]}</Link>
          ))}
        </nav>
        <nav aria-label="ช่วงเวลา" className="flex rounded-panel border border-carbon-600 bg-carbon-900 p-1">
          {(Object.keys(HISTORY_RANGES) as (keyof typeof HISTORY_RANGES)[]).map((range) => (
            <Link key={range} href={historyHref(values, { range, page: 1 })} aria-current={values.range === range ? "page" : undefined} className={pill(values.range === range)}>{HISTORY_RANGES[range]}</Link>
          ))}
        </nav>
        {isHead && (
          <nav aria-label="มุมมอง" className="flex rounded-panel border border-carbon-600 bg-carbon-900 p-1">
            <Link href={historyHref(values, { mine: false, page: 1 })} aria-current={values.mine ? undefined : "page"} className={pill(!values.mine)}>ทั้งหมด</Link>
            <Link href={historyHref(values, { mine: true, page: 1 })} aria-current={values.mine ? "page" : undefined} className={pill(values.mine)}>ของฉัน</Link>
          </nav>
        )}
      </div>
      {children}
    </div>
  );
}

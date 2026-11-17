"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CardsSkeleton } from "@/components/feedback/CardsSkeleton";
import { LoadError } from "@/components/feedback/LoadError";
import { StartInspectionModal } from "@/components/inspections/StartInspectionModal";
import { dateText, QcBar } from "@/components/plans/PlanBits";
import type { JobItem, JobsPayload, JobsViewName } from "@/lib/plans/jobs";
import { OPEN_WORK_ORDER_STATUSES, WORK_ORDER_STATUS_LABELS, WORK_ORDER_TYPE_LABELS } from "@/lib/plans/rules";
import { useJobsData } from "./useJobsData";

type Props = {
  /** QC Head: gets the all / mine switch and can open the plan behind a work order. */
  isHead: boolean;
  /** The view the address asks for, already settled by the page (`jobsView`). */
  view: JobsViewName;
  /** `?notification=<work order id>:<status>` from an alert's link; names the card to bring into view. */
  notification: string | null;
};

/**
 * "งานของฉัน" (FR-JOB-03/04, docs/16 §5): work orders show up as soon as a QC Head picks the person —
 * no accept button (J4). QC Head sees everyone's by default and can narrow to their own (W6).
 * The page checks the role; the list is read from `GET /api/jobs`.
 */
export function JobsView({ isHead, view, notification }: Props) {
  const { data, loading, error, reload } = useJobsData(view, notification);
  const targetId = notification?.split(":")[0] || null;
  const [inspectingJob, setInspectingJob] = useState<JobItem | null>(null);
  useScrollToAlert(targetId, notification, data !== null && !loading);

  // The title follows the list on screen, so a switch never shows one view's list under the other's title.
  const all = data ? data.view === "all" : view === "all";
  return (
    <Shell isHead={isHead} view={view} all={all}>
      {error && <LoadError message={error} onRetry={reload} />}
      {data ? (
        <Lists
          data={data}
          loading={loading}
          isHead={isHead}
          targetId={targetId}
          onStartInspection={setInspectingJob}
        />
      ) : (
        !error && <CardsSkeleton label="กำลังโหลดใบงาน" />
      )}
      {inspectingJob && (
        <StartInspectionModal
          isOpen={inspectingJob !== null}
          workOrder={{
            id: inspectingJob.id,
            woNo: inspectingJob.woNo,
            planId: inspectingJob.planId,
            modelCode: inspectingJob.modelCode,
            description: inspectingJob.description,
            qtyNeed: inspectingJob.qtyNeed,
            qtyDone: inspectingJob.qtyDone,
            vendorName: inspectingJob.vendorName,
          }}
          onClose={() => setInspectingJob(null)}
        />
      )}
    </Shell>
  );
}

/**
 * An alert's link names a work order. The browser cannot scroll to its `#work-order-…` card by itself, because the
 * card is not on the page yet when the page loads — so once the fresh list is on screen, bring the card into view (once per alert).
 */
function useScrollToAlert(targetId: string | null, notification: string | null, ready: boolean) {
  const scrolledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !targetId || !notification || scrolledFor.current === notification) return;
    scrolledFor.current = notification;
    document.getElementById(`work-order-${targetId}`)?.scrollIntoView({ block: "start" });
  }, [ready, targetId, notification]);
}

function Lists({
  data,
  loading,
  isHead,
  targetId,
  onStartInspection,
}: {
  data: JobsPayload;
  loading: boolean;
  isHead: boolean;
  targetId: string | null;
  onStartInspection: (job: JobItem) => void;
}) {
  const { jobs, me } = data;
  const all = data.view === "all";
  const open = jobs.filter((job) => OPEN_WORK_ORDER_STATUSES.includes(job.status));
  const done = jobs.filter((job) => !OPEN_WORK_ORDER_STATUSES.includes(job.status));
  return (
    <div aria-busy={loading} className={`space-y-5 transition-opacity ${loading ? "opacity-60" : ""}`}>
      {!me && !all && <p role="alert" className="text-sm text-red-300">ไม่พบบัญชีของคุณในฐานข้อมูล QCheck — กรุณาออกจากระบบแล้วเข้าใหม่</p>}
      <section aria-labelledby="jobs-open" className="space-y-3">
        <h2 id="jobs-open" className="text-base font-medium text-ti-50">กำลังทำ ({open.length})</h2>
        {open.length === 0 ? (
          <p className="rounded-panel border border-dashed border-carbon-600 p-5 text-sm text-ti-400">{all ? "ยังไม่มีใบงานที่กำลังทำ" : "ยังไม่มีใบงานที่มอบให้คุณ"}</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {open.map((job) => (
              <Card
                key={job.id}
                job={job}
                me={me}
                linkToPlan={isHead}
                highlighted={job.id === targetId}
                onStartInspection={onStartInspection}
              />
            ))}
          </ul>
        )}
      </section>
      {done.length > 0 && (
        // An alert whose work order has moved on since is still found: the box opens for it.
        <details open={done.some((job) => job.id === targetId) || undefined} className="space-y-3">
          <summary className="cursor-pointer text-sm text-ti-400 hover:text-ti-200">ส่งแล้ว / ปิดแล้ว ({done.length})</summary>
          <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {done.map((job) => (
              <Card
                key={job.id}
                job={job}
                me={me}
                linkToPlan={isHead}
                highlighted={job.id === targetId}
                onStartInspection={onStartInspection}
              />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Card({
  job,
  me,
  linkToPlan,
  highlighted,
  onStartInspection,
}: {
  job: JobItem;
  me: string | null;
  linkToPlan: boolean;
  highlighted: boolean;
  onStartInspection: (job: JobItem) => void;
}) {
  const others = job.assignees.filter((person) => person.userId !== me);
  const fix = job.type === "CALLIN_FIX";
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono font-semibold text-ti-50">{job.woNo}</span>
        <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${OPEN_WORK_ORDER_STATUSES.includes(job.status) ? "border-ember-500/60 text-ember-400" : "border-carbon-600 text-ti-400"}`}>
          {WORK_ORDER_STATUS_LABELS[job.status]}
        </span>
      </div>
      <p className="text-sm text-ti-200">
        {job.modelCode} · {job.docType === "PO" ? `PO ${job.docNo}` : job.docNo}
        <span className="block text-xs text-ti-400">{job.vendorName ?? "ยังไม่ระบุ Vendor"}{job.description ? ` · ${job.description}` : ""}</span>
      </p>
      <p className="text-xs text-ti-400">เรียกเข้า {job.calledQty.toLocaleString("th-TH")} เครื่อง · {dateText(job.calledDate)} · {WORK_ORDER_TYPE_LABELS[job.type]}</p>
      {fix ? (
        <p className="rounded-control border border-ember-500/40 px-3 py-2 text-xs text-ember-400">เรียกเข้าแก้ไข — ไม่ต้องตรวจในแอป (ตรวจเพิ่มได้)</p>
      ) : (
        <div className="space-y-1">
          <p className="font-mono text-sm text-ti-200">ต้องตรวจ {job.qtyNeed} · ตรวจแล้ว {job.qtyDone}</p>
          <QcBar done={job.qtyDone} required={job.qtyNeed} />
        </div>
      )}
      <p className="text-xs text-ti-400">
        {me && job.assignees.some((person) => person.userId === me) ? (others.length ? `ร่วมกับ: ${others.map((person) => person.name).join(", ")}` : "") : `QC: ${job.assignees.map((person) => person.name).join(", ")}`}
      </p>
      {job.assignees.some((p) => p.targetQty != null) && (
        <div className="flex flex-wrap gap-1.5 pt-1 text-xs">
          {job.assignees.map((person) => {
            const isMe = person.userId === me;
            return (
              <span
                key={person.userId}
                className={`inline-flex items-center rounded-control border px-2 py-0.5 font-mono ${
                  isMe
                    ? "border-ember-500/60 bg-ember-500/10 font-semibold text-ember-300"
                    : "border-carbon-600 bg-carbon-900 text-ti-300"
                }`}
              >
                {person.name}: {person.targetQty != null ? `${person.targetQty} ตัว` : "-"}
                {isMe && " (คุณ)"}
              </span>
            );
          })}
        </div>
      )}
    </>
  );
  return (
    <li id={`work-order-${job.id}`} className={`scroll-mt-20 space-y-2 app-panel rounded-panel border bg-carbon-800 p-4 ${highlighted ? "border-ember-500" : "border-carbon-700"}`}>
      {linkToPlan ? (
        <Link href={`/plans/${job.planId}?tab=work`} className="block space-y-2 hover:opacity-90">{body}</Link>
      ) : (
        body
      )}
      {OPEN_WORK_ORDER_STATUSES.includes(job.status) && !fix && (
        <button
          type="button"
          onClick={() => onStartInspection(job)}
          className="h-11 w-full rounded-control app-primary-action bg-ember-500 hover:bg-ember-400 font-semibold text-sm text-carbon-900 transition-colors"
        >
          เริ่มตรวจ
        </button>
      )}
    </li>
  );
}

function Shell({ isHead, view, all, children }: { isHead: boolean; view: JobsViewName; all: boolean; children: ReactNode }) {
  const viewingAll = view === "all";
  return (
    <div className="min-w-0 w-full space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl text-ti-50">{all ? "ใบงานทั้งหมด" : "งานของฉัน"}</h1>
          <p className="text-sm text-ti-400">ใบงานขึ้นทันทีที่หัวหน้าเลือกผู้ตรวจ — ไม่ต้องกดรับงาน</p>
        </div>
        {isHead && (
          <nav aria-label="มุมมอง" className="flex rounded-panel border border-carbon-600 bg-carbon-900 p-1 text-sm">
            <Link href="/jobs" aria-current={viewingAll ? "page" : undefined} className={`rounded-control px-3 py-2 ${viewingAll ? "bg-carbon-700 text-ti-50" : "text-ti-400 hover:text-ti-200"}`}>ทั้งหมด</Link>
            <Link href="/jobs?view=mine" aria-current={viewingAll ? undefined : "page"} className={`rounded-control px-3 py-2 ${viewingAll ? "text-ti-400 hover:text-ti-200" : "bg-carbon-700 text-ti-50"}`}>ของฉัน</Link>
          </nav>
        )}
      </header>
      {children}
    </div>
  );
}

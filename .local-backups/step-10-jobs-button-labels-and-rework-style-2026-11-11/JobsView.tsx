"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CardsSkeleton } from "@/components/feedback/CardsSkeleton";
import { LoadError } from "@/components/feedback/LoadError";
import { StartInspectionModal } from "@/components/inspections/StartInspectionModal";
import { dateText, QcBar } from "@/components/plans/PlanBits";
import type { PendingReworkItem } from "@/lib/inspections/types";
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

type FilterKey = "all" | "rework" | "returned" | "in_progress" | "not_started" | "done";

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
  const { jobs, me, reworks = [] } = data;
  const all = data.view === "all";
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  const open = jobs.filter((job) => OPEN_WORK_ORDER_STATUSES.includes(job.status));
  const done = jobs.filter((job) => !OPEN_WORK_ORDER_STATUSES.includes(job.status));

  // Categorize open work orders by urgency & progress
  const returnedJobs = open.filter((job) => job.status === "RETURNED");
  const inProgressJobs = open
    .filter((job) => job.status === "IN_PROGRESS" && job.qtyDone > 0 && job.type !== "CALLIN_FIX")
    .sort((a, b) => a.calledDate.localeCompare(b.calledDate));
  const notStartedJobs = open
    .filter((job) => job.status === "IN_PROGRESS" && job.qtyDone === 0 && job.type !== "CALLIN_FIX")
    .sort((a, b) => a.calledDate.localeCompare(b.calledDate));
  const fixJobs = open
    .filter((job) => job.type === "CALLIN_FIX")
    .sort((a, b) => a.calledDate.localeCompare(b.calledDate));

  // Quick Filter Chips definition
  const chips: { key: FilterKey; label: string; count: number; badgeClass?: string }[] = [
    { key: "all", label: "ทั้งหมด", count: open.length + reworks.length },
    ...(reworks.length > 0
      ? [
          {
            key: "rework" as const,
            label: "Rework ค้าง",
            count: reworks.length,
            badgeClass: "text-fail bg-fail/20 border border-fail/40",
          },
        ]
      : []),
    ...(returnedJobs.length > 0
      ? [
          {
            key: "returned" as const,
            label: "ถูกตีกลับ",
            count: returnedJobs.length,
            badgeClass: "text-ember-400 bg-ember-500/20 border border-ember-500/40",
          },
        ]
      : []),
    {
      key: "in_progress",
      label: "กำลังตรวจ",
      count: inProgressJobs.length,
      badgeClass: "text-amber-300 bg-amber-500/15 border border-amber-500/30",
    },
    {
      key: "not_started",
      label: "ยังไม่เริ่ม",
      count: notStartedJobs.length,
      badgeClass: "text-emerald-300 bg-emerald-500/15 border border-emerald-500/30",
    },
    ...(done.length > 0
      ? [
          {
            key: "done" as const,
            label: "ส่งแล้ว/ปิดแล้ว",
            count: done.length,
            badgeClass: "text-ti-400 bg-carbon-800 border border-carbon-700",
          },
        ]
      : []),
  ];

  return (
    <div aria-busy={loading} className={`space-y-5 transition-opacity ${loading ? "opacity-60" : ""}`}>
      {!me && !all && <p role="alert" className="text-sm text-red-300">ไม่พบบัญชีของคุณในฐานข้อมูล QCheck — กรุณาออกจากระบบแล้วเข้าใหม่</p>}

      {/* Quick Filter Chips Bar */}
      <nav aria-label="กรองความเร่งด่วน" className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-none -mx-1 px-1">
        {chips.map((chip) => {
          const isActive = activeFilter === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setActiveFilter(chip.key)}
              className={`shrink-0 inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-xs font-medium transition-all border ${
                isActive
                  ? "border-ember-500 bg-carbon-700 text-ti-50 shadow-sm"
                  : "border-carbon-700 bg-carbon-800/80 text-ti-300 hover:border-carbon-600 hover:text-ti-100"
              }`}
            >
              <span>{chip.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[11px] font-mono font-semibold ${
                  chip.badgeClass || (isActive ? "bg-ember-500/20 text-ember-300" : "bg-carbon-900 text-ti-400")
                }`}
              >
                {chip.count}
              </span>
            </button>
          );
        })}
      </nav>

      {/* View: All (Grouped by Urgency) */}
      {activeFilter === "all" && (
        <div className="space-y-6">
          {/* Section 1: Urgent (Reworks + Returned Jobs) */}
          {(reworks.length > 0 || returnedJobs.length > 0) && (
            <section aria-labelledby="jobs-urgent" className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 id="jobs-urgent" className="text-base font-semibold text-fail flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-fail animate-pulse" />
                  งานด่วนที่ต้องทำก่อน ({reworks.length + returnedJobs.length})
                </h2>
                <span className="text-xs text-ti-400">Rework ค้าง / ใบงานถูกตีกลับ</span>
              </div>
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {reworks.map((rw) => (
                  <ReworkCard key={rw.id} rework={rw} />
                ))}
                {returnedJobs.map((job) => (
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
            </section>
          )}

          {/* Section 2: In-Progress Jobs (กำลังตรวจค้างอยู่) */}
          {inProgressJobs.length > 0 && (
            <section aria-labelledby="jobs-inprogress" className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 id="jobs-inprogress" className="text-base font-medium text-ti-50 flex items-center gap-2">
                  <span className="text-amber-400 text-sm">⏳</span>
                  กำลังตรวจค้างอยู่ ({inProgressJobs.length})
                </h2>
                <span className="text-xs text-ti-400">เรียงตามวันที่เรียกเข้าเก่าสุด</span>
              </div>
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {inProgressJobs.map((job) => (
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
            </section>
          )}

          {/* Section 3: Not Started Jobs (งานใหม่) */}
          {notStartedJobs.length > 0 && (
            <section aria-labelledby="jobs-notstarted" className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 id="jobs-notstarted" className="text-base font-medium text-ti-50 flex items-center gap-2">
                  <span className="text-emerald-400 text-sm">📋</span>
                  งานใหม่รอเริ่มตรวจ ({notStartedJobs.length})
                </h2>
                <span className="text-xs text-ti-400">เรียงตามวันที่เรียกเข้า</span>
              </div>
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {notStartedJobs.map((job) => (
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
            </section>
          )}

          {/* Section 4: Call-in Fix (เรียกเข้าแก้ไข) */}
          {fixJobs.length > 0 && (
            <section aria-labelledby="jobs-fix" className="space-y-3">
              <h2 id="jobs-fix" className="text-base font-medium text-ti-50">
                เรียกเข้าแก้ไข ({fixJobs.length})
              </h2>
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {fixJobs.map((job) => (
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
            </section>
          )}

          {open.length === 0 && reworks.length === 0 && (
            <p className="rounded-panel border border-dashed border-carbon-600 p-5 text-sm text-ti-400">
              {all ? "ยังไม่มีใบงานที่กำลังทำ" : "ยังไม่มีใบงานที่มอบให้คุณ"}
            </p>
          )}

          {/* Section 5: Done (ส่งแล้ว / ปิดแล้ว) */}
          {done.length > 0 && (
            <details open={done.some((job) => job.id === targetId) || undefined} className="space-y-3">
              <summary className="cursor-pointer text-sm text-ti-400 hover:text-ti-200">
                ส่งแล้ว / ปิดแล้ว ({done.length})
              </summary>
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
      )}

      {/* Filtered View: Rework */}
      {activeFilter === "rework" && (
        <section aria-labelledby="filter-rework" className="space-y-3">
          <h2 id="filter-rework" className="text-base font-semibold text-fail flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-fail" />
            รายการ Rework ค้าง ({reworks.length})
          </h2>
          {reworks.length === 0 ? (
            <p className="rounded-panel border border-dashed border-carbon-600 p-5 text-sm text-ti-400">ไม่มีรายการ Rework ค้าง</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {reworks.map((rw) => (
                <ReworkCard key={rw.id} rework={rw} />
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Filtered View: Returned */}
      {activeFilter === "returned" && (
        <section aria-labelledby="filter-returned" className="space-y-3">
          <h2 id="filter-returned" className="text-base font-medium text-ember-400">
            ใบงานที่ถูกตีกลับ ({returnedJobs.length})
          </h2>
          {returnedJobs.length === 0 ? (
            <p className="rounded-panel border border-dashed border-carbon-600 p-5 text-sm text-ti-400">ไม่มีใบงานที่ถูกตีกลับ</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {returnedJobs.map((job) => (
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
      )}

      {/* Filtered View: In Progress */}
      {activeFilter === "in_progress" && (
        <section aria-labelledby="filter-inprogress" className="space-y-3">
          <h2 id="filter-inprogress" className="text-base font-medium text-amber-300">
            ใบงานที่กำลังตรวจค้างอยู่ ({inProgressJobs.length})
          </h2>
          {inProgressJobs.length === 0 ? (
            <p className="rounded-panel border border-dashed border-carbon-600 p-5 text-sm text-ti-400">ไม่มีใบงานที่กำลังตรวจค้างอยู่</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {inProgressJobs.map((job) => (
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
      )}

      {/* Filtered View: Not Started */}
      {activeFilter === "not_started" && (
        <section aria-labelledby="filter-notstarted" className="space-y-3">
          <h2 id="filter-notstarted" className="text-base font-medium text-emerald-300">
            ใบงานใหม่รอเริ่มตรวจ ({notStartedJobs.length})
          </h2>
          {notStartedJobs.length === 0 ? (
            <p className="rounded-panel border border-dashed border-carbon-600 p-5 text-sm text-ti-400">ไม่มีใบงานใหม่รอเริ่มตรวจ</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {notStartedJobs.map((job) => (
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
      )}

      {/* Filtered View: Done */}
      {activeFilter === "done" && (
        <section aria-labelledby="filter-done" className="space-y-3">
          <h2 id="filter-done" className="text-base font-medium text-ti-300">
            ใบงานที่ส่งแล้ว / ปิดแล้ว ({done.length})
          </h2>
          {done.length === 0 ? (
            <p className="rounded-panel border border-dashed border-carbon-600 p-5 text-sm text-ti-400">ไม่มีใบงานที่ส่งแล้วหรือปิดแล้ว</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
          )}
        </section>
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono font-semibold text-ti-50">{job.woNo}</span>
          {job.reworkCount > 0 && (
            <span className="rounded-full border border-fail/60 bg-fail/10 px-2 py-0.5 text-xs font-semibold text-fail">
              Rework ค้าง {job.reworkCount} เครื่อง
            </span>
          )}
        </div>
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

function ReworkCard({ rework }: { rework: PendingReworkItem }) {
  return (
    <li
      id={`rework-${rework.id}`}
      className="scroll-mt-20 space-y-3 app-panel rounded-panel border border-fail/40 bg-carbon-800 p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="font-mono text-base font-bold text-ti-50">
            {rework.serialPump}
          </span>
          <span className="block text-xs text-ti-400">
            ใบงาน {rework.woNo} · {rework.planNo}
          </span>
        </div>
        <span className="whitespace-nowrap rounded-full border border-fail/60 bg-fail/10 px-2 py-0.5 text-xs font-semibold text-fail">
          รอบ {rework.roundNo} (รอแก้)
        </span>
      </div>

      <p className="text-sm text-ti-200">
        {rework.modelCode}
        {rework.description && (
          <span className="text-xs text-ti-400 block">{rework.description}</span>
        )}
      </p>

      <div className="rounded-control border border-fail/30 bg-fail/5 p-2.5 space-y-1 text-xs">
        <div className="flex items-center justify-between font-medium text-fail">
          <span>ไม่ผ่าน {rework.failedItemCount} หัวข้อ</span>
          <span className="text-[11px] text-ti-400">จาก {rework.role}</span>
        </div>
        {rework.defectNames && (
          <p className="text-ti-300 line-clamp-2">อาการ: {rework.defectNames}</p>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-ti-400">
        <span>ผู้ตรวจ: {rework.inspectorName}</span>
        {rework.submittedAt && (
          <span>{dateText(rework.submittedAt.slice(0, 10))}</span>
        )}
      </div>

      <Link
        href={`/inspections/${rework.id}/rework`}
        className="flex h-11 w-full items-center justify-center rounded-control border border-fail/70 bg-fail/15 hover:bg-fail/25 text-sm font-semibold text-red-200 transition-colors shadow-sm"
      >
        เปิดใบ Rework (แก้ไขข้อที่ไม่ผ่าน) →
      </Link>
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

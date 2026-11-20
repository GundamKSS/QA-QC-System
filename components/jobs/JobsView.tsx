"use client";

import Link from "next/link";
import { AppBack } from "@/components/ui/AppBack";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CardsSkeleton } from "@/components/feedback/CardsSkeleton";
import { LoadError } from "@/components/feedback/LoadError";
import { StartInspectionModal } from "@/components/inspections/StartInspectionModal";
import { dateText, QcBar } from "@/components/plans/PlanBits";
import { readOfflineInspections } from "@/lib/inspections/offline-sync";
import type { InspectionDraft, PendingReworkItem } from "@/lib/inspections/types";
import type { JobAssignee, JobItem, JobsPayload, JobsViewName } from "@/lib/plans/jobs";
import { OPEN_WORK_ORDER_STATUSES, WORK_ORDER_STATUS_LABELS, WORK_ORDER_TYPE_LABELS, thaiToday } from "@/lib/plans/rules";
import { useJobsData } from "./useJobsData";

type Props = {
  /** QC Head or QA Head: gets the all / mine switch and can open the plan behind a work order. */
  isHead: boolean;
  /** The view the address asks for, already settled by the page (`jobsView`). */
  view: JobsViewName;
  /** `?notification=<work order id>:<status>` from an alert's link; names the card to bring into view. */
  notification: string | null;
  /** Filter to QC or QA work orders */
  side?: "QC" | "QA";
  /** Custom title */
  title?: string;
  /** Custom subtitle */
  subtitle?: string;
  /** Base URL for view switcher links (default: "/jobs") */
  baseUrl?: string;
};

/**
 * "งานของฉัน" (FR-JOB-03/04, docs/16 §5): work orders show up as soon as a QC Head picks the person —
 * no accept button (J4). QC Head sees everyone's by default and can narrow to their own (W6).
 * The page checks the role; the list is read from `GET /api/jobs`.
 */
export function JobsView({
  isHead,
  view,
  notification,
  side,
  title,
  subtitle,
  baseUrl = "/jobs",
}: Props) {
  const { data, loading, error, reload } = useJobsData(view, notification, side);
  const targetId = notification?.split(":")[0] || null;
  const [inspectingJob, setInspectingJob] = useState<JobItem | null>(null);
  useScrollToAlert(targetId, notification, data !== null && !loading);

  // The title follows the list on screen, so a switch never shows one view's list under the other's title.
  const all = data ? data.view === "all" : view === "all";
  return (
    <Shell
      isHead={isHead}
      view={view}
      all={all}
      side={side}
      title={title}
      subtitle={subtitle}
      baseUrl={baseUrl}
    >
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
            role: inspectingJob.type === "QA" ? "QA" : "QC",
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

type FilterKey = "all" | "rework" | "in_progress" | "todo" | "done";

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

  const todayStr = thaiToday(new Date());
  const currentMonth = todayStr.slice(0, 7); // "YYYY-MM"
  const currentMonthText = new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(new Date());

  // ตรวจสอบว่าสำหรับผู้ตรวจรายบุคคล งานนี้ตัวเองตรวจเสร็จสมบูรณ์แล้วหรือไม่
  // (ตรวจครบตามยอด targetQty และไม่มีงาน rework ค้างที่ต้องแก้)
  const isMineCompleted = (job: JobItem) => {
    if (!me) return false;
    const person = job.assignees.find((p) => String(p.userId) === String(me));
    if (!person) return false;
    const target = person.targetQty ?? null;
    const done = person.doneQty ?? 0;
    const rework = person.reworkPending ?? 0;
    const drafts = person.drafts?.length ?? 0;
    return target != null && done >= target && rework === 0 && drafts === 0;
  };

  // ตรวจสอบว่างานนี้เสร็จสิ้นแล้วหรือไม่ (ใช้เหมือนกันทั้งในหน้าแท็บ "ทั้งหมด" และ "ของฉัน"):
  // 1) ถ้าผู้ใช้ล็อกอินได้รับมอบหมายงานนี้: ยึดตามยอดที่ตัวเองทำเสร็จตามที่ HeadQC มอบหมาย (targetQty)
  // 2) ถ้าผู้ใช้ไม่ได้อยู่ในรายชื่อผู้ตรวจ (เช่น หัวหน้าดูงานรวมของทีมในแท็บทั้งหมด): ถือว่าเสร็จเมื่อตรวจครบตามยอดใบงาน (qtyNeed) หรือทุกคนตรวจครบตามเป้า
  const isJobCompleted = (job: JobItem) => {
    // ถ้าสถานะใบงานถูกปิด/ส่งแล้ว ถือว่าเสร็จสิ้นทั้งหมด
    if (!OPEN_WORK_ORDER_STATUSES.includes(job.status)) return true;

    // ถ้าตัวเองได้รับมอบหมายในงานนี้ ให้ยึดตามยอดที่ตัวเองทำเสร็จตามที่ HeadQC มอบหมาย
    if (me && job.assignees.some((p) => String(p.userId) === String(me))) {
      return isMineCompleted(job);
    }

    // สำหรับงานที่ตัวเองไม่ได้เป็นผู้ตรวจ (ดูในแท็บทั้งหมด) ให้ถือว่าเสร็จเมื่อตรวจครบตามยอดใบงาน หรือผู้ตรวจทุกคนตรวจครบตามเป้า
    const isOverallComplete = job.qtyNeed > 0 && job.qtyDone >= job.qtyNeed && (job.reworkCount ?? 0) === 0;
    const isAllAssigneesComplete =
      job.assignees.length > 0 &&
      job.assignees.every(
        (p) => p.targetQty != null && (p.doneQty ?? 0) >= p.targetQty && (p.reworkPending ?? 0) === 0 && (p.drafts?.length ?? 0) === 0
      );

    return isOverallComplete || isAllAssigneesComplete;
  };

  // งานที่ยังตรวจไม่ครบ จะคงอยู่ใน open เสมอ ไม่ว่าจะข้ามเดือนหรือไม่ก็ตาม (ทั้งในแท็บทั้งหมดและงานของฉัน)
  const open = jobs.filter((job) => !isJobCompleted(job));
  const allDone = jobs.filter((job) => isJobCompleted(job));

  // "งานที่เสร็จแล้ว เมื่อเริ่มเดือนใหม่ ให้ไปดูที่ประวัติ เพราะอยากให้เห็นแค่งานของเดือนนั้นๆ"
  // แสดงเฉพาะงานที่เสร็จสิ้นของเดือนปัจจุบันในหน้า Jobs งานเดือนก่อนหน้าดูได้ที่ /history
  const done = allDone.filter((job) => job.calledDate.slice(0, 7) >= currentMonth);
  const previousMonthDoneCount = allDone.length - done.length;

  // Categorize open work orders by the 4 priorities:
  // 1. งานที่ต้อง rework (Rework items + ใบงานที่ถูกตีกลับ)
  const returnedJobs = open.filter((job) => job.status === "RETURNED");
  const reworkTotalCount = reworks.length + returnedJobs.length;

  // 2. งานที่ทำค้างอยู่ (มีเครื่องที่เปิดตรวจค้างไว้จริง ๆ)
  const inProgressJobs = open
    .filter((job) => {
      if (job.status !== "IN_PROGRESS" || job.type === "CALLIN_FIX") return false;
      const mine = me ? job.assignees.find((p) => String(p.userId) === String(me)) : null;
      if (mine) return (mine.drafts?.length ?? 0) > 0;
      return job.assignees.some((p) => (p.drafts?.length ?? 0) > 0);
    })
    .sort((a, b) => a.calledDate.localeCompare(b.calledDate));

  // 3. งานที่ต้องทำ (ยังไม่เริ่มตรวจ + งานที่ยังเหลือยอดต้องตรวจต่อ + งานเรียกเข้าแก้ไข)
  const notStartedJobs = open
    .filter((job) => {
      if (job.status !== "IN_PROGRESS" || job.type === "CALLIN_FIX") return false;
      const mine = me ? job.assignees.find((p) => String(p.userId) === String(me)) : null;
      if (mine) return (mine.drafts?.length ?? 0) === 0;
      return !job.assignees.some((p) => (p.drafts?.length ?? 0) > 0);
    })
    .sort((a, b) => a.calledDate.localeCompare(b.calledDate));

  const fixJobs = open
    .filter((job) => job.status !== "RETURNED" && job.type === "CALLIN_FIX")
    .sort((a, b) => a.calledDate.localeCompare(b.calledDate));

  const todoTotalCount = notStartedJobs.length + fixJobs.length;

  // Quick Filter Chips definition: เรียงลำดับ 4 ความสำคัญตามข้อตกลงที่ประชุม
  const chips: { key: FilterKey; label: string; count: number; badgeClass?: string }[] = [
    { key: "all", label: "ทั้งหมด", count: open.length + reworks.length + done.length },
    {
      key: "rework",
      label: "งานที่ต้อง rework",
      count: reworkTotalCount,
      badgeClass: reworkTotalCount > 0 ? "text-ti-50 bg-fail/30 border border-fail/60 font-semibold" : undefined,
    },
    {
      key: "in_progress",
      label: "งานที่ทำค้างอยู่",
      count: inProgressJobs.length,
      badgeClass: inProgressJobs.length > 0 ? "text-amber-300 bg-amber-500/15 border border-amber-500/30" : undefined,
    },
    {
      key: "todo",
      label: "งานที่ต้องทำ",
      count: todoTotalCount,
      badgeClass: todoTotalCount > 0 ? "text-emerald-300 bg-emerald-500/15 border border-emerald-500/30" : undefined,
    },
    {
      key: "done",
      label: "งานที่เสร็จแล้ว",
      count: done.length,
      badgeClass: "text-ti-400 bg-carbon-800 border border-carbon-700",
    },
  ];

  return (
    <div aria-busy={loading} className={`space-y-5 transition-opacity ${loading ? "opacity-60" : ""}`}>
      {!me && !all && <p role="alert" className="text-sm text-red-300">ไม่พบบัญชีของคุณในฐานข้อมูล QA & QC System — กรุณาออกจากระบบแล้วเข้าใหม่</p>}

      {/* Quick Filter Chips Bar (Swipeable on mobile) */}
      <nav aria-label="กรองความเร่งด่วน" className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
        {chips.map((chip) => {
          const isActive = activeFilter === chip.key;
          const isRework = chip.key === "rework";
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setActiveFilter(chip.key)}
              className={`shrink-0 inline-flex items-center gap-1.5 sm:gap-2 h-8 sm:h-9 px-3 sm:px-3.5 rounded-full text-xs font-medium transition-all border ${
                isActive
                  ? isRework
                    ? "border-fail bg-fail/20 text-ti-50 shadow-sm font-semibold"
                    : "border-ember-500 bg-carbon-700 text-ti-50 shadow-sm"
                  : "border-carbon-700 bg-carbon-800/80 text-ti-300 hover:border-carbon-600 hover:text-ti-100"
              }`}
            >
              <span className="whitespace-nowrap">{chip.label}</span>
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

      {/* View: All (Grouped by 4 Priority Levels) */}
      {activeFilter === "all" && (
        <div className="space-y-6">
          {/* Priority 1: 1. งานที่ต้อง rework (Reworks + Returned Jobs) */}
          {reworkTotalCount > 0 && (
            <section aria-labelledby="jobs-rework" className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
                <h2 id="jobs-rework" className="text-base font-semibold text-fail flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 shrink-0 rounded-full bg-fail animate-pulse" />
                  งานที่ต้อง rework ({reworkTotalCount})
                </h2>
                <span className="text-xs text-ti-400">Rework ค้าง / ใบงานถูกตีกลับ</span>
              </div>
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
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

          {/* Priority 2: 2. งานที่ทำค้างอยู่ */}
          {inProgressJobs.length > 0 && (
            <section aria-labelledby="jobs-inprogress" className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
                <h2 id="jobs-inprogress" className="text-base font-medium text-ti-50 flex items-center gap-2">
                  <span className="text-amber-400 text-sm shrink-0">●</span>
                  งานที่ทำค้างอยู่ ({inProgressJobs.length})
                </h2>
                <span className="text-xs text-ti-400">เรียงตามวันที่เรียกเข้าเก่าสุด</span>
              </div>
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
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

          {/* Priority 3: 3. งานที่ต้องทำ (งานใหม่รอเริ่มตรวจ + เรียกเข้าแก้ไข) */}
          {todoTotalCount > 0 && (
            <section aria-labelledby="jobs-todo" className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
                <h2 id="jobs-todo" className="text-base font-medium text-ti-50 flex items-center gap-2">
                  <span className="text-emerald-400 text-sm shrink-0">●</span>
                  งานที่ต้องทำ ({todoTotalCount})
                </h2>
                <span className="text-xs text-ti-400">งานใหม่รอเริ่มตรวจ / เรียกเข้าแก้ไข</span>
              </div>
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
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

          {open.length === 0 && reworkTotalCount === 0 && (
            <p className="rounded-panel border border-dashed border-carbon-600 p-5 text-sm text-ti-400">
              {all ? "ไม่มีใบงานที่ค้างอยู่ — ทุกงานเสร็จสิ้นแล้ว หรือยังไม่มีใบงานใหม่" : "คุณตรวจครบทุกใบงานที่ได้รับมอบหมายแล้ว หรือยังไม่มีใบงานที่มอบให้คุณ"}
            </p>
          )}

          {/* Priority 4: 4. งานที่เสร็จแล้ว (เฉพาะเดือนปัจจุบัน) */}
          {done.length > 0 && (
            <section aria-labelledby="jobs-done" className="space-y-3 pt-2 border-t border-carbon-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
                <h2 id="jobs-done" className="text-base font-medium text-ti-300 flex items-center gap-2">
                  <span className="text-ti-400 text-sm">✓</span>
                  งานที่เสร็จแล้ว ({done.length})
                </h2>
                <span className="text-xs text-ti-400">เฉพาะเดือนปัจจุบัน ({currentMonthText})</span>
              </div>
              {previousMonthDoneCount > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-carbon-700 bg-carbon-800/60 px-3.5 py-2 text-xs text-ti-300">
                  <span>งานที่เสร็จสิ้นของเดือนก่อนหน้า ({previousMonthDoneCount} ใบงาน) ย้ายไปเก็บที่หน้าประวัติ</span>
                  <Link href={all ? "/history?kind=done" : "/history?kind=done&view=mine"} className="font-medium text-ember-400 hover:text-ember-300 hover:underline shrink-0">
                    ไปที่หน้าประวัติ →
                  </Link>
                </div>
              )}
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
            </section>
          )}

          {done.length === 0 && previousMonthDoneCount > 0 && (
            <div className="pt-2 border-t border-carbon-800 flex flex-wrap items-center justify-between gap-2 text-xs text-ti-400">
              <span>งานที่เสร็จสิ้นของเดือนก่อนหน้า ({previousMonthDoneCount} ใบงาน) สามารถดูได้ที่หน้าประวัติ</span>
              <Link href={all ? "/history?kind=done" : "/history?kind=done&view=mine"} className="font-medium text-ember-400 hover:text-ember-300 hover:underline">
                ไปที่หน้าประวัติ →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Filtered View: 1. งานที่ต้อง rework */}
      {activeFilter === "rework" && (
        <section aria-labelledby="filter-rework" className="space-y-3">
          <h2 id="filter-rework" className="text-base font-semibold text-fail flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-fail" />
            งานที่ต้อง rework ({reworkTotalCount})
          </h2>
          {reworkTotalCount === 0 ? (
            <p className="rounded-panel border border-dashed border-carbon-600 p-5 text-sm text-ti-400">ไม่มีรายการ Rework ค้าง หรือใบงานที่ถูกตีกลับ</p>
          ) : (
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
          )}
        </section>
      )}

      {/* Filtered View: 2. งานที่ทำค้างอยู่ */}
      {activeFilter === "in_progress" && (
        <section aria-labelledby="filter-inprogress" className="space-y-3">
          <h2 id="filter-inprogress" className="text-base font-medium text-amber-300 flex items-center gap-2">
            <span className="text-amber-400 text-sm">●</span>
            งานที่ทำค้างอยู่ ({inProgressJobs.length})
          </h2>
          {inProgressJobs.length === 0 ? (
            <p className="rounded-panel border border-dashed border-carbon-600 p-5 text-sm text-ti-400">ไม่มีงานที่กำลังตรวจค้างอยู่</p>
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

      {/* Filtered View: 3. งานที่ต้องทำ */}
      {activeFilter === "todo" && (
        <section aria-labelledby="filter-todo" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <h2 id="filter-todo" className="text-base font-medium text-emerald-300 flex items-center gap-2">
              <span className="text-emerald-400 text-sm shrink-0">●</span>
              งานที่ต้องทำ ({todoTotalCount})
            </h2>
            <span className="text-xs text-ti-400">งานใหม่รอเริ่มตรวจ / เรียกเข้าแก้ไข</span>
          </div>
          {todoTotalCount === 0 ? (
            <p className="rounded-panel border border-dashed border-carbon-600 p-5 text-sm text-ti-400">ไม่มีงานที่ต้องทำ</p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
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
          )}
        </section>
      )}

      {/* Filtered View: 4. งานที่เสร็จแล้ว */}
      {activeFilter === "done" && (
        <section aria-labelledby="filter-done" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="filter-done" className="text-base font-medium text-ti-300 flex items-center gap-2">
              <span className="text-ti-400 text-sm">✓</span>
              งานที่เสร็จแล้ว ({done.length})
            </h2>
            <span className="text-xs text-ti-400">เฉพาะเดือนปัจจุบัน ({currentMonthText})</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-carbon-700 bg-carbon-800/60 px-3.5 py-2 text-xs text-ti-300">
            <span>
              {previousMonthDoneCount > 0
                ? `งานที่เสร็จสิ้นของเดือนก่อนหน้า (${previousMonthDoneCount} ใบงาน) ย้ายไปเก็บที่หน้าประวัติ`
                : "งานที่เสร็จสิ้นของเดือนก่อนหน้าสามารถดูได้ที่หน้าประวัติ"}
            </span>
            <Link href={all ? "/history?kind=done" : "/history?kind=done&view=mine"} className="font-medium text-ember-400 hover:text-ember-300 hover:underline shrink-0">
              ไปที่หน้าประวัติ
            </Link>
          </div>
          {done.length === 0 ? (
            <p className="rounded-panel border border-dashed border-carbon-600 p-5 text-sm text-ti-400">
              {all ? "ไม่มีใบงานที่เสร็จสิ้นในเดือนนี้" : "ยังไม่มีงานที่คุณตรวจครบในเดือนนี้"}
            </p>
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

function progressPct(person: JobAssignee) {
  const target = person.targetQty ?? null;
  return target ? Math.min(100, Math.round(((person.doneQty ?? 0) / target) * 100)) : 0;
}

/** The signed-in inspector's own share of a work order: how many machines to check, how many done, what still needs fixing. */
function MyShare({ person, complete }: { person: JobAssignee; complete: boolean }) {
  const done = person.doneQty ?? 0;
  const pending = person.reworkPending ?? 0;
  return (
    <div className="space-y-1.5 rounded-control border border-carbon-600 bg-carbon-900 p-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="font-semibold text-ti-50 min-w-0 break-words">
          {person.name}{person.targetQty != null ? ` (${person.targetQty} ตัว)` : ""}
        </span>
        <span className={`font-mono font-semibold whitespace-nowrap shrink-0 ${complete ? "text-emerald-300" : "text-ember-300"}`}>
          ตรวจแล้ว {done}{person.targetQty != null ? ` / ${person.targetQty}` : ""} ตัว
        </span>
      </div>
      {person.targetQty != null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-carbon-700">
          <div className={`h-full ${complete ? "bg-emerald-400" : "bg-ember-500"}`} style={{ width: `${progressPct(person)}%` }} />
        </div>
      )}
      {complete && pending === 0 && <p className="font-medium text-emerald-400">✓ ตรวจครบตามยอดของฉันแล้ว</p>}
      {pending > 0 && <p className="font-semibold text-fail">⚠ มี {pending} ตัวไม่ผ่าน ต้องแก้ไขจนผ่าน (ดูในหัวข้อ Rework)</p>}
    </div>
  );
}

/** One inspector's progress on a work order — what QC Head sees for each person. */
function PersonProgress({ person }: { person: JobAssignee }) {
  const done = person.doneQty ?? 0;
  const target = person.targetQty ?? null;
  const complete = target != null && done >= target;
  const pending = person.reworkPending ?? 0;
  return (
    <li className="space-y-1 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="font-medium text-ti-100 min-w-0 break-words">
          {person.name}{target != null ? ` (${target} ตัว)` : ""}
        </span>
        <span className="flex flex-wrap items-center gap-1.5 font-mono shrink-0">
          <span className={`whitespace-nowrap ${complete ? "text-emerald-300" : "text-ember-300"}`}>
            ตรวจแล้ว {done}{target != null ? `/${target}` : ""} ตัว
          </span>
          {complete && pending === 0 && <span className="whitespace-nowrap rounded bg-emerald-500/15 px-1.5 text-emerald-300">✓ เสร็จ</span>}
          {pending > 0 && <span className="whitespace-nowrap rounded border border-fail/40 bg-fail/15 px-1.5 text-fail">รอแก้ {pending}</span>}
          {(person.rejectedQty ?? 0) > 0 && <span className="whitespace-nowrap rounded border border-carbon-600 px-1.5 text-ti-400">Reject {person.rejectedQty}</span>}
        </span>
      </div>
      {target != null && (
        <div className="h-1 overflow-hidden rounded-full bg-carbon-700">
          <div className={`h-full ${complete ? "bg-emerald-400" : "bg-ember-500"}`} style={{ width: `${progressPct(person)}%` }} />
        </div>
      )}
    </li>
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
  const myAssignee = me ? job.assignees.find((person) => String(person.userId) === String(me)) : null;
  const isMyTargetReached = myAssignee?.targetQty != null && (myAssignee.doneQty ?? 0) >= myAssignee.targetQty;

  // เครื่องที่เปิดตรวจไว้แต่ยังไม่ส่งผล (ทั้งจาก server และ offline storage)
  const [offlineDrafts] = useState<InspectionDraft[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const offline = readOfflineInspections();
      return Object.values(offline)
        .filter((item) => item.workOrderId === job.id && item.status === "IN_PROGRESS" && !item.parentInspectionId)
        .map((item) => ({ inspectionId: item.id, serialPump: item.serialPump }));
    } catch {
      return [];
    }
  });

  const allDrafts = useMemo(() => {
    const list = [...(myAssignee?.drafts ?? [])];
    for (const od of offlineDrafts) {
      if (!list.some((d) => d.inspectionId === od.inspectionId)) {
        list.push(od);
      }
    }
    return list;
  }, [myAssignee?.drafts, offlineDrafts]);

  const hasDrafts = allDrafts.length > 0;
  const isMyComplete = isMyTargetReached && (myAssignee?.reworkPending ?? 0) === 0 && !hasDrafts;
  const isJobFullyInspected = job.qtyNeed > 0 && job.qtyDone >= job.qtyNeed && job.reworkCount === 0;
  const fix = job.type === "CALLIN_FIX";
  const myDoneCount = myAssignee?.doneQty ?? 0;
  const isStarted = (myAssignee ? myDoneCount : job.qtyDone) > 0;
  const nextUnitNumber = (myAssignee ? myDoneCount : job.qtyDone) + 1;
  const myTargetTotal = myAssignee?.targetQty ?? job.qtyNeed;
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
          <span className="font-mono font-semibold text-ti-50">{job.woNo}</span>
          {job.reworkCount > 0 && (
            <span className="rounded-full border border-fail/70 bg-fail/20 px-2.5 py-0.5 text-xs font-semibold text-ti-50 shadow-sm shrink-0">
              Rework ค้าง {job.reworkCount} เครื่อง
            </span>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {myAssignee && isMyComplete && OPEN_WORK_ORDER_STATUSES.includes(job.status) ? (
            <>
              <span className="whitespace-nowrap rounded-full border border-emerald-500/60 bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                เสร็จสิ้น (ส่วนตัว)
              </span>
              <span className="text-[10px] text-ti-400 font-mono">
                ใบงานรวม: {WORK_ORDER_STATUS_LABELS[job.status]}
              </span>
            </>
          ) : isJobFullyInspected && OPEN_WORK_ORDER_STATUSES.includes(job.status) ? (
            <>
              <span className="whitespace-nowrap rounded-full border border-emerald-500/60 bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                ✓ ตรวจครบแล้ว
              </span>
              <span className="text-[10px] text-ti-400 font-mono">
                ใบงานรวม: {WORK_ORDER_STATUS_LABELS[job.status]}
              </span>
            </>
          ) : (
            <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${OPEN_WORK_ORDER_STATUSES.includes(job.status) ? "border-ember-500/60 text-ember-400" : "border-carbon-600 text-ti-400"}`}>
              {WORK_ORDER_STATUS_LABELS[job.status]}
            </span>
          )}
        </div>
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
      {myAssignee ? (
        <MyShare person={myAssignee} complete={isMyComplete} />
      ) : (
        job.assignees.length > 0 && (
          <ul className="space-y-1.5 pt-1" aria-label="ความคืบหน้าผู้ตรวจ">
            {job.assignees.map((person) => (
              <PersonProgress key={person.userId} person={person} />
            ))}
          </ul>
        )
      )}
    </>
  );
  return (
    <li id={`work-order-${job.id}`} className={`min-w-0 scroll-mt-20 space-y-2.5 app-panel rounded-panel border bg-carbon-800 p-3.5 sm:p-4 ${highlighted ? "border-ember-500" : "border-carbon-700"}`}>
      {linkToPlan ? (
        <Link href={job.type === "QA" ? `/plans/${job.planId}` : `/plans/${job.planId}?tab=work`} className="block min-w-0 space-y-2 hover:opacity-90">{body}</Link>
      ) : hasDrafts && allDrafts.length === 1 ? (
        <Link href={`/inspections/${allDrafts[0].inspectionId}`} className="block min-w-0 space-y-2 hover:opacity-90">{body}</Link>
      ) : (
        body
      )}
      {OPEN_WORK_ORDER_STATUSES.includes(job.status) && hasDrafts ? (
        <div className="space-y-2 pt-1">
          {allDrafts.map((draft) => (
            <Link
              key={draft.inspectionId}
              href={`/inspections/${draft.inspectionId}`}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-control app-primary-action bg-ember-500 hover:bg-ember-400 px-3 py-2 text-center font-semibold text-xs sm:text-sm text-carbon-900 transition-colors shadow-sm"
            >
              <span className="truncate">ตรวจต่อเครื่องที่ค้างอยู่ ({draft.serialPump})</span>
              <span className="shrink-0">→</span>
            </Link>
          ))}
        </div>
      ) : OPEN_WORK_ORDER_STATUSES.includes(job.status) && !fix ? (
        isMyComplete ? (
          <button
            type="button"
            disabled
            className="min-h-11 w-full rounded-control border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 font-medium text-xs sm:text-sm text-emerald-300 cursor-not-allowed opacity-90"
          >
            คุณตรวจครบตามยอดแล้ว (รอผู้ตรวจท่านอื่นให้ครบใบงาน)
          </button>
        ) : isMyTargetReached && (myAssignee?.reworkPending ?? 0) > 0 ? (
          <button
            type="button"
            disabled
            className="min-h-11 w-full rounded-control border border-fail/40 bg-fail/15 px-3 py-2 font-medium text-xs sm:text-sm text-fail cursor-not-allowed"
          >
            ตรวจครบตามยอดแล้ว แต่มีค้าง Rework {myAssignee?.reworkPending} ตัว (รอแก้ไขให้ผ่าน)
          </button>
        ) : isJobFullyInspected ? (
          <button
            type="button"
            disabled
            className="min-h-11 w-full rounded-control border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 font-medium text-xs sm:text-sm text-emerald-300 cursor-not-allowed opacity-90"
          >
            ตรวจครบตามยอดทั้งใบงานแล้ว
          </button>
        ) : !myAssignee ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-carbon-700 bg-carbon-900/60 p-2.5 text-xs text-ti-300">
            <span className="text-ti-400 min-w-0 flex-1 leading-relaxed break-words">
              รอผู้ตรวจดำเนินงาน ({job.assignees.filter((p) => p.targetQty != null && (p.doneQty ?? 0) < p.targetQty).map((p) => `${p.name} (เหลือ ${(p.targetQty ?? 0) - (p.doneQty ?? 0)} ตัว)`).join(", ") || "รอตรวจ"})
            </span>
            {linkToPlan && (
              <Link href={job.type === "QA" ? `/plans/${job.planId}` : `/plans/${job.planId}?tab=work`} className="font-medium text-ember-400 hover:text-ember-300 hover:underline shrink-0 whitespace-nowrap ml-auto">
                ดูใบงาน →
              </Link>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onStartInspection(job)}
            className="min-h-11 w-full rounded-control app-primary-action bg-ember-500 hover:bg-ember-400 px-3 py-2 font-semibold text-xs sm:text-sm text-carbon-900 transition-colors"
          >
            {isStarted
              ? `ตรวจต่อ (เครื่องที่ ${nextUnitNumber}${myTargetTotal ? `/${myTargetTotal}` : ""})`
              : "เริ่มตรวจเครื่องแรก"}
          </button>
        )
      ) : null}
    </li>
  );
}

function ReworkCard({ rework }: { rework: PendingReworkItem }) {
  return (
    <li
      id={`rework-${rework.id}`}
      className="min-w-0 scroll-mt-20 space-y-3 app-panel rounded-panel border border-fail/40 bg-carbon-800 p-3.5 sm:p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="font-mono text-base font-bold text-ti-50 break-all">
            {rework.serialPump}
          </span>
          <span className="block text-xs text-ti-400 break-words">
            ใบงาน {rework.woNo} · {rework.planNo}
          </span>
        </div>
        <span className="shrink-0 whitespace-nowrap rounded-full border border-fail/70 bg-fail/20 px-2.5 py-0.5 text-xs font-semibold text-ti-50">
          รอบ {rework.roundNo} (รอแก้)
        </span>
      </div>

      <p className="text-sm text-ti-200 break-words">
        {rework.modelCode}
        {rework.description && (
          <span className="text-xs text-ti-400 block">{rework.description}</span>
        )}
      </p>

      <div className="rounded-control border border-fail/40 bg-fail/10 p-2.5 space-y-1 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-1 font-semibold text-ti-50">
          <span className="text-fail">ไม่ผ่าน {rework.failedItemCount} หัวข้อ</span>
          <span className="text-[11px] text-ti-400">จาก {rework.role}</span>
        </div>
        {rework.defectNames && (
          <p className="text-ti-200 line-clamp-2 break-words">อาการ: {rework.defectNames}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-ti-400">
        <span>ผู้ตรวจ: {rework.inspectorName}</span>
        {rework.submittedAt && (
          <span>{dateText(rework.submittedAt.slice(0, 10))}</span>
        )}
      </div>

      <Link
        href={`/inspections/${rework.id}/rework`}
        className="flex min-h-11 w-full items-center justify-center rounded-control bg-fail hover:brightness-105 px-3 py-2 text-sm font-bold text-white transition-all shadow-sm active:scale-[0.99]"
      >
        ตรวจใหม่อีกครั้ง
      </Link>
    </li>
  );
}

function Shell({
  isHead,
  view,
  all,
  side,
  title,
  subtitle,
  baseUrl = "/jobs",
  children,
}: {
  isHead: boolean;
  view: JobsViewName;
  all: boolean;
  side?: "QC" | "QA";
  title?: string;
  subtitle?: string;
  baseUrl?: string;
  children: ReactNode;
}) {
  const viewingAll = view === "all";
  const defaultTitle = all
    ? side === "QA"
      ? "ใบงานสุ่มตรวจ QA ทั้งหมด"
      : "ใบงานทั้งหมด"
    : side === "QA"
      ? "งานสุ่มตรวจ QA ของฉัน"
      : "งานของฉัน";
  const defaultSubtitle =
    side === "QA"
      ? "ใบงาน QA ขึ้นทันทีที่ Head QA มอบหมาย — เริ่มสุ่มตรวจตามเกณฑ์ AQL"
      : "ใบงานขึ้นทันทีที่หัวหน้าเลือกผู้ตรวจ — ไม่ต้องกดรับงาน";

  return (
    <div className="min-w-0 w-full space-y-4 sm:space-y-5 p-4 sm:p-6">
      <AppBack href="/home">กลับหน้าหลัก</AppBack>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl text-ti-50">{title || defaultTitle}</h1>
          <p className="text-xs sm:text-sm text-ti-400">{subtitle || defaultSubtitle}</p>
        </div>
        {isHead && (
          <nav aria-label="มุมมอง" className="flex w-full sm:w-auto rounded-panel border border-carbon-600 bg-carbon-900 p-1 text-sm">
            <Link
              href={baseUrl}
              aria-current={viewingAll ? "page" : undefined}
              className={`flex-1 sm:flex-initial text-center rounded-control px-3 py-1.5 sm:py-2 font-medium ${viewingAll ? "bg-carbon-700 text-ti-50" : "text-ti-400 hover:text-ti-200"}`}
            >
              ทั้งหมด
            </Link>
            <Link
              href={`${baseUrl}?view=mine`}
              aria-current={viewingAll ? undefined : "page"}
              className={`flex-1 sm:flex-initial text-center rounded-control px-3 py-1.5 sm:py-2 font-medium ${viewingAll ? "text-ti-400 hover:text-ti-200" : "bg-carbon-700 text-ti-50"}`}
            >
              ของฉัน
            </Link>
          </nav>
        )}
      </header>
      {children}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIcon,
  CheckCircleIcon,
  ClockIcon,
  PlansIcon,
  RefreshIcon,
  ScanIcon,
  ShieldCheckIcon,
} from "@/components/dom/Icons";
import type { QaQueueItem, QaQueuePayload } from "@/lib/qa/queue";

type FilterKey = "all" | "in_progress" | "pending" | "completed";

export function QaQueueView() {
  const [data, setData] = useState<QaQueuePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  const fetchQueue = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/qa-queue");
      if (!res.ok) {
        throw new Error(`โหลดข้อมูลคิว QA ไม่สำเร็จ (รหัส ${res.status})`);
      }
      const json = await res.json();
      setData(json.data ?? json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการโหลดคิว QA");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    void (async () => {
      try {
        const res = await fetch("/api/qa-queue");
        if (!res.ok) {
          throw new Error(`โหลดข้อมูลคิว QA ไม่สำเร็จ (รหัส ${res.status})`);
        }
        const json = await res.json();
        if (!ignore) {
          setError(null);
          setData(json.data ?? json);
        }
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการโหลดคิว QA");
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  const filteredQueue = useMemo(() => {
    if (!data?.queue) return [];
    if (activeFilter === "all") return data.queue;
    if (activeFilter === "in_progress") {
      return data.queue.filter((item) => item.status === "QA_IN_PROGRESS");
    }
    if (activeFilter === "pending") {
      return data.queue.filter(
        (item) => item.status === "QA_PENDING" || item.status === "QC_COMPLETED"
      );
    }
    if (activeFilter === "completed") {
      return data.queue.filter((item) => item.status === "COMPLETED");
    }
    return data.queue;
  }, [data, activeFilter]);

  return (
    <div className="w-full max-w-7xl 2xl:max-w-[1600px] mx-auto space-y-5 px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-28 sm:pb-12">
      {/* Top Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-block size-2.5 rounded-full bg-ember-500 animate-pulse shrink-0" />
            <h1 className="text-xl font-bold tracking-tight text-ti-50 sm:text-2xl lg:text-3xl">
              คิวงานสุ่มตรวจ QA
              <span className="text-xs sm:text-sm font-normal text-ti-300 font-mono block sm:inline sm:ml-2">
                (QA Sampling Queue)
              </span>
            </h1>
          </div>
          <p className="text-xs text-ti-400 sm:text-sm max-w-2xl leading-relaxed">
            รายการล็อตที่ผ่านการตรวจ QC ครบ 100% แล้ว และรอ QA สุ่มตรวจรับรองคุณภาพตามเกณฑ์ AQL
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchQueue()}
          disabled={loading}
          aria-label="รีเฟรชข้อมูลคิว QA"
          className="inline-flex items-center justify-center gap-1.5 self-start rounded-control border border-carbon-600 bg-carbon-800/90 px-3.5 py-2 text-xs font-semibold text-ti-100 transition-colors hover:border-carbon-500 hover:text-ti-50 hover:bg-carbon-700/80 disabled:opacity-50 sm:self-auto cursor-pointer shadow-xs shrink-0 active:scale-95"
        >
          <RefreshIcon className={`size-3.5 text-ti-300 ${loading ? "animate-spin text-ember-500" : ""}`} />
          <span>{loading ? "กำลังโหลด…" : "รีเฟรชข้อมูล"}</span>
        </button>
      </header>

      {/* Metric Counters (Interactive Filter Cards) */}
      {data && (
        <section aria-label="สถิติภาพรวมคิวงาน QA" className="grid grid-cols-3 gap-2 sm:gap-4">
          {/* Card 1: Pending */}
          <button
            type="button"
            onClick={() => setActiveFilter((prev) => (prev === "pending" ? "all" : "pending"))}
            className={`group text-left rounded-2xl border p-2.5 sm:p-4 shadow-xs transition-all cursor-pointer ${
              activeFilter === "pending"
                ? "border-amber-500/80 bg-amber-500/10 ring-2 ring-amber-500/30"
                : "border-carbon-700/80 bg-carbon-800/80 hover:border-carbon-600 hover:bg-carbon-800"
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <p className="text-[10px] sm:text-xs font-semibold text-ti-400 whitespace-nowrap">
                รอดำเนินการ
              </p>
              <ClockIcon className="size-3 sm:size-4 shrink-0 text-amber-500" />
            </div>
            <p className="mt-1 font-mono text-xl sm:text-3xl font-extrabold text-amber-500">
              {data.pendingCount}
            </p>
            <p className="text-[10px] sm:text-xs text-ti-400 mt-0.5 whitespace-nowrap truncate">
              รอเริ่มสุ่มตรวจ
            </p>
          </button>

          {/* Card 2: In Progress */}
          <button
            type="button"
            onClick={() => setActiveFilter((prev) => (prev === "in_progress" ? "all" : "in_progress"))}
            className={`group text-left rounded-2xl border p-2.5 sm:p-4 shadow-xs transition-all cursor-pointer ${
              activeFilter === "in_progress"
                ? "border-sky-500/80 bg-sky-500/10 ring-2 ring-sky-500/30"
                : "border-carbon-700/80 bg-carbon-800/80 hover:border-carbon-600 hover:bg-carbon-800"
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <p className="text-[10px] sm:text-xs font-semibold text-ti-400 whitespace-nowrap">
                กำลังสุ่มตรวจ
              </p>
              <ActivityIcon className="size-3 sm:size-4 shrink-0 text-sky-500 dark:text-sky-400" />
            </div>
            <p className="mt-1 font-mono text-xl sm:text-3xl font-extrabold text-sky-600 dark:text-sky-400">
              {data.inProgressCount}
            </p>
            <p className="text-[10px] sm:text-xs text-ti-400 mt-0.5 whitespace-nowrap truncate">
              อยู่ในกระบวนการ
            </p>
          </button>

          {/* Card 3: Completed Today */}
          <button
            type="button"
            onClick={() => setActiveFilter((prev) => (prev === "completed" ? "all" : "completed"))}
            className={`group text-left rounded-2xl border p-2.5 sm:p-4 shadow-xs transition-all cursor-pointer ${
              activeFilter === "completed"
                ? "border-pass/80 bg-pass/10 ring-2 ring-pass/30"
                : "border-carbon-700/80 bg-carbon-800/80 hover:border-carbon-600 hover:bg-carbon-800"
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <p className="text-[10px] sm:text-xs font-semibold text-ti-400 whitespace-nowrap">
                เสร็จสิ้นวันนี้
              </p>
              <CheckCircleIcon className="size-3 sm:size-4 shrink-0 text-pass" />
            </div>
            <p className="mt-1 font-mono text-xl sm:text-3xl font-extrabold text-pass">
              {data.completedTodayCount}
            </p>
            <p className="text-[10px] sm:text-xs text-ti-400 mt-0.5 whitespace-nowrap truncate">
              อนุมัติปิดล็อตแล้ว
            </p>
          </button>
        </section>
      )}

      {/* Filter Chips Bar (Quick Filters) */}
      {data && data.queue.length > 0 && (
        <nav
          aria-label="กรองสถานะคิวงาน"
          className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1 text-xs"
        >
          <button
            type="button"
            onClick={() => setActiveFilter("all")}
            className={`rounded-control px-3 py-1.5 font-medium transition cursor-pointer whitespace-nowrap ${
              activeFilter === "all"
                ? "bg-carbon-700 text-ti-50 shadow-xs border border-carbon-600"
                : "text-ti-400 hover:text-ti-200 hover:bg-carbon-800"
            }`}
          >
            ทั้งหมด ({data.queue.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("in_progress")}
            className={`rounded-control px-3 py-1.5 font-medium transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeFilter === "in_progress"
                ? "bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-xs"
                : "text-ti-400 hover:text-ti-200 hover:bg-carbon-800"
            }`}
          >
            <span className="size-1.5 rounded-full bg-sky-400 animate-pulse" />
            กำลังสุ่มตรวจ ({data.inProgressCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("pending")}
            className={`rounded-control px-3 py-1.5 font-medium transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeFilter === "pending"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs"
                : "text-ti-400 hover:text-ti-200 hover:bg-carbon-800"
            }`}
          >
            <span className="size-1.5 rounded-full bg-amber-400" />
            รอดำเนินการ ({data.pendingCount})
          </button>
        </nav>
      )}

      {/* Error Banner */}
      {error && (
        <div role="alert" className="rounded-2xl border border-fail/40 bg-fail/10 p-4 text-center">
          <p className="text-sm font-semibold text-fail">{error}</p>
          <button
            type="button"
            onClick={() => void fetchQueue()}
            className="mt-3 inline-flex items-center gap-1.5 rounded-control bg-fail px-4 py-1.5 text-xs font-bold text-white transition hover:bg-fail/90 cursor-pointer shadow-xs active:scale-95"
          >
            <RefreshIcon className="size-3.5" />
            <span>ลองใหม่อีกครั้ง</span>
          </button>
        </div>
      )}

      {/* Skeleton Loading State */}
      {loading && !data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-44 animate-pulse rounded-2xl border border-carbon-700 bg-carbon-800/50"
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {data && filteredQueue.length === 0 && (
        <div className="rounded-2xl border border-carbon-700/80 bg-carbon-800/50 px-4 py-12 text-center max-w-md mx-auto">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-pass/30 bg-pass/10 text-pass shadow-xs">
            <ShieldCheckIcon className="size-7" />
          </div>
          <p className="mt-3 text-base font-bold text-ti-50">
            {activeFilter === "all"
              ? "ไม่มีล็อตที่รอตรวจ QA ในขณะนี้"
              : `ไม่มีรายการในหมวดนี้`}
          </p>
          <p className="mt-1 text-xs text-ti-400 max-w-xs mx-auto leading-relaxed">
            {activeFilter === "all"
              ? "เมื่อหัวหน้า QC ยืนยันส่งมอบล็อตที่ตรวจครบแล้ว รายการจะแสดงขึ้นที่นี่โดยอัตโนมัติ"
              : "ลองสลับไปดูหมวดอื่น หรือกดรีเฟรชข้อมูลเพื่อตรวจสอบรายการล่าสุด"}
          </p>
          {activeFilter !== "all" && (
            <button
              type="button"
              onClick={() => setActiveFilter("all")}
              className="mt-4 inline-flex items-center gap-1 rounded-control border border-carbon-600 bg-carbon-800 px-3 py-1.5 text-xs font-semibold text-ti-200 hover:text-ti-50 cursor-pointer shadow-xs"
            >
              แสดงทั้งหมด
            </button>
          )}
        </div>
      )}

      {/* Queue Card List / Responsive Grid */}
      {data && filteredQueue.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
          {filteredQueue.map((item) => (
            <QueueCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function QueueCard({ item }: { item: QaQueueItem }) {
  const isPending = item.status === "QA_PENDING" || item.status === "QC_COMPLETED";
  const isInProgress = item.status === "QA_IN_PROGRESS";
  const isCompleted = item.status === "COMPLETED";

  const qaPercent =
    item.qaRequired > 0 ? Math.min(100, Math.round((item.qaDoneTotal / item.qaRequired) * 100)) : 0;

  return (
    <article className="flex flex-col justify-between rounded-2xl border border-carbon-700/80 bg-carbon-800/95 p-4 sm:p-5 shadow-sm transition-all hover:border-carbon-600">
      {/* Top Details & Badges */}
      <div className="space-y-2">
        {/* Badges Bar */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${
              isPending
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                : isInProgress
                  ? "bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30"
                  : "bg-pass/15 text-pass border border-pass/30"
            }`}
          >
            {isPending ? (
              <>
                <ClockIcon className="size-3 shrink-0" />
                <span>รอ QA สุ่มตรวจ</span>
              </>
            ) : isInProgress ? (
              <>
                <ActivityIcon className="size-3 shrink-0 animate-pulse" />
                <span>กำลังสุ่มตรวจ</span>
              </>
            ) : (
              <>
                <CheckCircleIcon className="size-3 shrink-0" />
                <span>ผ่านการสุ่มตรวจแล้ว</span>
              </>
            )}
          </span>

          <span className="text-xs font-mono font-bold text-ti-50">{item.planNo}</span>
          <span className="text-xs text-ti-400">·</span>
          <span className="text-xs font-mono text-ti-400">
            {item.docType} {item.docNo}
          </span>
        </div>

        {/* Model Title & Description */}
        <div>
          <h2 className="text-base sm:text-lg font-bold text-ti-50 tracking-tight leading-snug">
            {item.brandName} {item.modelCode}
            {item.pumpType && (
              <span className="ml-2 text-xs font-normal text-ti-300 font-mono">({item.pumpType})</span>
            )}
          </h2>
          {item.modelDescription && (
            <p className="mt-0.5 text-xs text-ti-300 line-clamp-1">{item.modelDescription}</p>
          )}
        </div>

        {/* Vendor & Quantity Metrics */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-xs text-ti-400">
          {item.vendorName && (
            <span className="truncate max-w-[280px]">
              ผู้ผลิต: <strong className="text-ti-100 font-medium">{item.vendorName}</strong>
            </span>
          )}
          <span>
            ยอดทั้งล็อต: <strong className="text-ti-50 font-bold">{item.lotQty.toLocaleString("th-TH")}</strong> เครื่อง
          </span>
          <span>
            QC ตรวจครบ: <strong className="text-pass font-bold">{item.qcDoneTotal}/{item.lotCalledTotal}</strong>
          </span>
        </div>
      </div>

      {/* Bottom Section: AQL Progress Gauge & Actions */}
      <div className="mt-4 pt-3 border-t border-carbon-700/60 space-y-3">
        {/* AQL Progress Bar & Count */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-ti-400 font-medium">เกณฑ์สุ่มตรวจ AQL:</span>
            <span className="text-ti-200">
              ตรวจแล้ว{" "}
              <strong className="font-mono font-bold text-ember-600 dark:text-ember-400">
                {item.qaDoneTotal}
              </strong>{" "}
              / <strong className="font-mono font-bold text-ti-50">{item.qaRequired}</strong> เครื่อง{" "}
              <span className="text-ti-400 text-[11px] font-mono">({qaPercent}%)</span>
            </span>
          </div>

          <div
            className="w-full h-2 rounded-full bg-carbon-700/60 overflow-hidden"
            role="progressbar"
            aria-valuenow={item.qaDoneTotal}
            aria-valuemin={0}
            aria-valuemax={item.qaRequired}
            aria-label={`ความคืบหน้าการสุ่มตรวจ ${qaPercent}%`}
          >
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                isCompleted ? "bg-pass" : isInProgress ? "bg-sky-500" : "bg-amber-500"
              }`}
              style={{ width: `${qaPercent}%` }}
            />
          </div>
        </div>

        {/* Actions Button Row */}
        <div className="flex items-center gap-2 pt-0.5">
          <Link
            href={`/scan?planId=${item.id}&role=QA`}
            className={`flex-1 min-h-10 inline-flex items-center justify-center gap-1.5 rounded-control px-4 py-2 text-xs font-bold transition-all active:scale-95 shadow-sm ${
              isCompleted
                ? "border border-carbon-600 bg-carbon-800 text-ti-100 hover:border-ti-400 hover:text-ti-50"
                : isInProgress
                  ? "app-primary-action bg-sky-600 hover:bg-sky-500 text-white shadow-sky-600/20"
                  : "app-primary-action bg-ember-500 hover:bg-ember-400 text-white shadow-ember-500/20"
            }`}
          >
            {isCompleted ? (
              <>
                <CheckCircleIcon className="size-3.5" />
                <span>ดูผลตรวจ</span>
              </>
            ) : isInProgress ? (
              <>
                <ActivityIcon className="size-3.5" />
                <span>ตรวจต่อ (สุ่มตรวจ)</span>
              </>
            ) : (
              <>
                <ScanIcon className="size-3.5" />
                <span>เริ่มสุ่มตรวจล็อตนี้</span>
              </>
            )}
          </Link>
          <Link
            href={`/plans/${item.id}`}
            className="min-h-10 inline-flex items-center gap-1 rounded-control border border-carbon-600 bg-carbon-800/80 px-3.5 py-2 text-xs font-semibold text-ti-200 hover:border-ti-400 hover:text-ti-50 transition shadow-xs active:scale-95"
            title="ดูรายละเอียดแผนงาน"
          >
            <PlansIcon className="size-3.5 text-ti-400" />
            <span>แผนงาน</span>
          </Link>
        </div>
      </div>
    </article>
  );
}

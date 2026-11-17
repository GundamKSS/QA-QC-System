"use client";

import { useEffect, useRef, useState } from "react";
import { useNetworkSync } from "@/lib/inspections/offline-sync";

type Props = {
  className?: string;
};

/**
 * Smart Cloud Status Indicator & Connection Popover (Option A).
 * - Unified Cloud iconography (eliminates Wi-Fi vs Cloud confusion).
 * - Silent and calm when healthy (no intrusive bright-green button in normal state).
 * - Alerts visibly when offline or when items are pending upload.
 * - Tap/Click opens a helpful popover with network diagnostics, outbox count, and retry action.
 */
export function NetworkSyncBadge({ className = "" }: Props) {
  const { status, isOnline, pingMs, pendingCount, syncingProgress, recheck } = useNetworkSync();
  const [isOpen, setIsOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  async function handleRecheck() {
    setIsChecking(true);
    setFeedback(null);
    try {
      await recheck();
      setFeedback("ตรวจสอบการเชื่อมต่อเรียบร้อย");
      setTimeout(() => setFeedback(null), 2500);
    } catch {
      setFeedback("ไม่สามารถเชื่อมต่อได้");
      setTimeout(() => setFeedback(null), 2500);
    } finally {
      setIsChecking(false);
    }
  }

  // 1. Determine Button Visual States
  const isSyncing = status === "syncing";
  const isOffline = !isOnline || status === "offline";
  const hasPending = pendingCount > 0;

  let buttonColor = "border-carbon-700/80 bg-carbon-800 text-ti-300 hover:border-carbon-600 hover:bg-carbon-700 hover:text-ti-100";
  let buttonTitle = `ออนไลน์ · ข้อมูลตรงกับระบบ${pingMs !== null ? ` (${pingMs} ms)` : ""} (กดดูรายละเอียด)`;

  if (isOffline) {
    buttonColor = "border-[#dc2626]/40 bg-[#dc2626]/12 text-[#dc2626] hover:bg-[#dc2626]/20";
    buttonTitle = `โหมดออฟไลน์อัตโนมัติ${hasPending ? ` · รอส่ง ${pendingCount} รายการ` : ""} (กดดูรายละเอียด)`;
  } else if (isSyncing) {
    buttonColor = "border-ember-500/50 bg-ember-500/12 text-ember-400 hover:bg-ember-500/20";
    buttonTitle = `กำลังอัปโหลดข้อมูลเบื้องหลัง… (กดดูรายละเอียด)`;
  } else if (hasPending) {
    buttonColor = "border-ember-500/40 bg-ember-500/10 text-ember-400 hover:bg-ember-500/20";
    buttonTitle = `ออนไลน์ · มี ${pendingCount} รายการรออัปโหลด (กดดูรายละเอียด)`;
  }

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      {/* Main Status Button (Fixed Size 36x36px) */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title={buttonTitle}
        aria-label={buttonTitle}
        className={`relative inline-flex size-9 shrink-0 items-center justify-center rounded-control border transition-all ${buttonColor}`}
      >
        {isOffline ? (
          /* Cloud Off Icon (Disconnected) */
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m2 2 20 20" />
            <path d="M5.782 5.782A7 7 0 0 0 4 14.9a7 7 0 0 0 5 4.1h8.5a4.5 4.5 0 0 0 1.5-.26" />
            <path d="M21.72 16.27A4.5 4.5 0 0 0 17.5 10.5h-1.79A7.008 7.008 0 0 0 10 5.07" />
          </svg>
        ) : isSyncing ? (
          /* Cloud Upload Pulse Icon (Syncing) */
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-pulse"
            aria-hidden="true"
          >
            <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
            <path d="M12 12v9" />
            <path d="m16 16-4-4-4 4" />
          </svg>
        ) : (
          /* Cloud Base Icon (Healthy / In Sync) */
          <>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
            </svg>
            {/* Subtle healthy green indicator dot */}
            {!hasPending && (
              <span
                className="absolute bottom-1.5 right-1.5 size-1.5 rounded-full bg-[#16a34a] ring-2 ring-carbon-800"
                aria-hidden="true"
              />
            )}
          </>
        )}

        {/* Pending Items Badge (Red if offline, Amber if online) */}
        {hasPending && (
          <span
            className={`absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[10px] font-bold text-white shadow-sm ${
              isOffline ? "bg-[#dc2626]" : "bg-ember-500"
            }`}
          >
            {pendingCount}
          </span>
        )}
      </button>

      {/* Floating Status Popover Details Card */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="สถานะการเชื่อมต่อและข้อมูล"
          className="absolute right-0 top-full mt-2 w-72 sm:w-80 rounded-2xl border border-carbon-700 bg-carbon-800 p-4 shadow-2xl z-50 text-left space-y-3.5 backdrop-blur-md"
        >
          {/* Popover Header */}
          <div className="flex items-center justify-between border-b border-carbon-700/80 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-ti-100">สถานะเครือข่ายและข้อมูล</span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="ปิดหน้าต่างสถานะ"
              className="flex size-6 items-center justify-center rounded-control text-ti-400 hover:bg-carbon-700 hover:text-ti-100 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Section 1: Network Connection */}
          <div className="rounded-xl border border-carbon-700/70 bg-carbon-900/60 p-3 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-ti-400">การเชื่อมต่อเครือข่าย</span>
              <span
                className={`inline-flex items-center gap-1.5 font-medium ${
                  isOffline ? "text-[#dc2626]" : "text-[#16a34a]"
                }`}
              >
                <span
                  className={`size-2 rounded-full ${isOffline ? "bg-[#dc2626]" : "bg-[#16a34a]"}`}
                />
                {isOffline ? "ออฟไลน์ (Offline)" : "ออนไลน์ (Online)"}
              </span>
            </div>
            <p className="text-[11px] text-ti-300">
              {isOffline
                ? "ระบบทำงานในโหมดออฟไลน์อัตโนมัติ บันทึกข้อมูลลงเครื่องทันทีโดยไม่ต้องใช้เน็ต"
                : `เชื่อมต่อเซิร์ฟเวอร์สำเร็จ${pingMs !== null ? ` (ปิง ${pingMs} ms)` : ""}`}
            </p>
          </div>

          {/* Section 2: Data Outbox & Sync Status */}
          <div className="rounded-xl border border-carbon-700/70 bg-carbon-900/60 p-3 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-ti-400">การซิงค์ข้อมูล (Cloud Sync)</span>
              <span
                className={`font-medium ${
                  isSyncing
                    ? "text-ember-400"
                    : hasPending
                      ? "text-ember-400"
                      : "text-[#16a34a]"
                }`}
              >
                {isSyncing
                  ? "กำลังอัปโหลด…"
                  : hasPending
                    ? `รออัปโหลด ${pendingCount} รายการ`
                    : "ข้อมูลตรงกับระบบแล้ว"}
              </span>
            </div>
            <p className="text-[11px] text-ti-300">
              {isSyncing
                ? syncingProgress
                  ? `กำลังทยอยส่งข้อมูล ${syncingProgress.done}/${syncingProgress.total} รายการ…`
                  : "กำลังส่งผลการตรวจขึ้นเซิร์ฟเวอร์เบื้องหลัง…"
                : hasPending
                  ? "ผลการตรวจถูกจัดเก็บในเครื่องอย่างปลอดภัย และจะทยอยส่งขึ้นระบบอัตโนมัติเมื่อมีสัญญาณเน็ต"
                  : "ผลการตรวจและข้อมูลทั้งหมดได้รับการจัดเก็บลงฐานข้อมูลเรียบร้อย"}
            </p>
          </div>

          {/* Section 3: Action Buttons & Feedback */}
          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={() => void handleRecheck()}
              disabled={isChecking}
              className="w-full flex items-center justify-center gap-2 rounded-control border border-ti-600 bg-carbon-700/70 hover:bg-carbon-700 py-2 text-xs font-medium text-ti-100 disabled:opacity-50 transition-colors"
            >
              {isChecking ? (
                <>
                  <svg
                    className="size-3.5 animate-spin text-ti-300"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" />
                  </svg>
                  <span>กำลังทดสอบการเชื่อมต่อ…</span>
                </>
              ) : (
                <>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                    <path d="M16 21h5v-5" />
                  </svg>
                  <span>ทดสอบการเชื่อมต่อใหม่</span>
                </>
              )}
            </button>

            {feedback && (
              <p className="text-center text-[11px] font-medium text-pass animate-in fade-in">
                {feedback}
              </p>
            )}

            <p className="text-center text-[10px] text-ti-400">
              ระบบ QA & QC System ตรวจสอบและซิงค์ข้อมูลเบื้องหลังอัตโนมัติ
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useNetworkSync } from "@/lib/inspections/offline-sync";

type Props = {
  className?: string;
};

/**
 * Automatic Recording Mode & Background Sync Status Header Icon.
 * - Online (low ping): Green connected icon (LIVE mode)
 * - Offline (disconnected or high ping): Red disconnected icon (PAPER_BACKFILL mode, periodic retry)
 * - Syncing: Compact background upload indicator ("กำลังอัปโหลด…")
 * - Synced: Cloud icon with a green checkmark so the user knows background upload finished
 */
export function NetworkSyncBadge({ className = "" }: Props) {
  const { status, isOnline, pingMs, pendingCount, syncingProgress, recheck } = useNetworkSync();

  if (status === "syncing") {
    const progressText =
      syncingProgress && syncingProgress.total > 1
        ? `${syncingProgress.done}/${syncingProgress.total}`
        : "";
    return (
      <button
        type="button"
        onClick={() => void recheck()}
        title="กำลังอัปโหลดข้อมูลที่ค้างอยู่เบื้องหลัง…"
        aria-label="กำลังอัปโหลดข้อมูลเบื้องหลัง"
        className={`inline-flex h-8 items-center gap-1.5 rounded-full border border-ember-500/40 bg-ember-500/10 px-2.5 text-[11px] font-medium text-ember-400 transition-all ${className}`}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-pulse shrink-0"
          aria-hidden="true"
        >
          <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
          <path d="M12 12v9" />
          <path d="m16 16-4-4-4 4" />
        </svg>
        <span className="whitespace-nowrap">
          กำลังอัปโหลด{progressText ? ` ${progressText}` : "…"}
        </span>
      </button>
    );
  }

  if (status === "synced") {
    const label = `อัปโหลดข้อมูลเสร็จเรียบร้อยแล้ว · ออนไลน์${pingMs ? ` (${pingMs} ms)` : ""}`;
    return (
      <button
        type="button"
        onClick={() => void recheck()}
        title={label}
        aria-label={label}
        className={`relative inline-flex size-9 shrink-0 items-center justify-center rounded-control border border-[#16a34a]/40 bg-[#16a34a]/12 text-[#16a34a] hover:bg-[#16a34a]/20 transition-colors ${className}`}
      >
        {/* Cloud with Green Checkmark icon */}
        <svg
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
          <path d="m9 15 2 2 4-4" />
        </svg>
      </button>
    );
  }

  if (!isOnline || status === "offline") {
    const pingDetail = pingMs !== null ? ` (ปิงสูง ${pingMs} ms)` : "";
    const pendingDetail = pendingCount > 0 ? ` · รออัปโหลด ${pendingCount} รายการ` : "";
    const label = `โหมดออฟไลน์อัตโนมัติ${pingDetail}${pendingDetail} — กำลังเช็คการเชื่อมต่อเป็นระยะ`;

    return (
      <button
        type="button"
        onClick={() => void recheck()}
        title={label}
        aria-label={label}
        className={`relative inline-flex size-9 shrink-0 items-center justify-center rounded-control border border-[#dc2626]/40 bg-[#dc2626]/12 text-[#dc2626] hover:bg-[#dc2626]/20 transition-colors ${className}`}
      >
        {/* Disconnected Wi-Fi Off icon (Red) */}
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
          <path d="M2 2l20 20" />
          <path d="M8.5 16.5a5 5 0 0 1 7 0" />
          <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
          <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
          <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
          <path d="M5 12.86a10 10 0 0 1 5.17-2.89" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
        {pendingCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#dc2626] px-1 font-mono text-[10px] font-bold text-white">
            {pendingCount}
          </span>
        )}
      </button>
    );
  }

  const label = `โหมดออนไลน์อัตโนมัติ${pingMs !== null ? ` (ปิง ${pingMs} ms)` : ""}`;
  return (
    <button
      type="button"
      onClick={() => void recheck()}
      title={label}
      aria-label={label}
      className={`relative inline-flex size-9 shrink-0 items-center justify-center rounded-control border border-[#16a34a]/40 bg-[#16a34a]/12 text-[#16a34a] hover:bg-[#16a34a]/20 transition-colors ${className}`}
    >
      {/* Connected Wi-Fi Online icon (Green) */}
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
        <path d="M12 20h.01" />
        <path d="M2 8.82a15 15 0 0 1 20 0" />
        <path d="M5 12.859a10 10 0 0 1 14 0" />
        <path d="M8.5 16.429a5 5 0 0 1 7 0" />
      </svg>
    </button>
  );
}

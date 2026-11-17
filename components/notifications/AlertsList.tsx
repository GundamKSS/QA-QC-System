"use client";

import Link from "next/link";
import { AppBack } from "@/components/ui/AppBack";
import { CheckCircleIcon, ChevronRightIcon, JobsIcon, WarningIcon } from "@/components/dom/Icons";
import { NavIcon } from "@/components/shell/NavIcon";
import { useNotifications } from "./NotificationProvider";

function notificationDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

export function AlertsList() {
  const { items, unreadCount, loading, error, refresh, markRead, markAllRead, isRead } = useNotifications();

  return (
    <div className="min-w-0 w-full space-y-5 p-4 sm:p-6 lg:p-8">
      <AppBack href="/home">กลับหน้าหลัก</AppBack>
      <header className="space-y-4 border-b border-carbon-700/70 pb-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-control border border-carbon-700 bg-carbon-800 text-ember-400">
            <NavIcon name="alerts" className="size-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl text-ti-50">แจ้งเตือน</h1>
            <p className="text-sm text-ti-400">งานที่ได้รับมอบหมายและงานที่ส่งกลับมาแก้ไข</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="text-sm text-ti-200">
            {loading && items.length === 0 ? "กำลังตรวจสอบงาน…" : error && items.length === 0 ? "ยังไม่สามารถโหลดแจ้งเตือนได้" : (
              <>
                ยังไม่อ่าน <span className="font-mono font-medium text-ember-400">{unreadCount.toLocaleString("th-TH")}</span> รายการ
                <span className="mx-2 text-ti-600" aria-hidden="true">·</span>
                <span className="text-ti-400">ทั้งหมด {items.length.toLocaleString("th-TH")}</span>
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="app-metal-action min-h-11 rounded-control border border-carbon-600 bg-carbon-800 px-3 text-sm text-ti-200 transition-colors hover:border-ti-400 hover:text-ti-50 disabled:cursor-wait disabled:opacity-50"
            >
              {loading ? "กำลังอัปเดต…" : "รีเฟรช"}
            </button>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="min-h-11 rounded-control border border-carbon-600 px-3 text-sm text-ti-200 transition-colors hover:border-ember-400 hover:text-ember-400 disabled:cursor-default disabled:opacity-40"
            >
              อ่านทั้งหมดแล้ว
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-panel border border-fail/40 bg-carbon-800 p-4">
          <WarningIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-fail" />
          <div className="space-y-1">
            <p className="text-sm text-fail">{error}</p>
            <p className="text-xs text-ti-400">
              ตรวจสอบการเชื่อมต่อแล้วกดรีเฟรช{items.length > 0 ? " รายการที่แสดงอาจยังไม่เป็นปัจจุบัน" : "เพื่อโหลดแจ้งเตือนอีกครั้ง"}
            </p>
          </div>
        </div>
      )}

      {loading && items.length === 0 ? (
        <div role="status" aria-label="กำลังโหลดแจ้งเตือน" className="space-y-3">
          {[0, 1, 2].map((index) => (
            <div key={index} aria-hidden="true" className="app-panel space-y-3 rounded-panel border border-carbon-700 bg-carbon-800 p-5">
              <div className="h-3 w-24 animate-pulse rounded bg-carbon-700" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-carbon-700" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-carbon-700" />
            </div>
          ))}
        </div>
      ) : items.length > 0 ? (
        <ul aria-label="แจ้งเตือนงาน" className="space-y-3">
          {items.map((item) => {
            const read = isRead(item.id);
            const returned = item.kind === "returned";
            const dateText = notificationDate(item.createdAt);
            return (
              <li key={item.id} className={`app-panel overflow-hidden rounded-panel border bg-carbon-800 ${read ? "border-carbon-700" : "border-ember-400/50"}`}>
                <Link
                  href={item.href}
                  onClick={() => markRead(item.id)}
                  className="group flex items-start gap-3 p-4 transition-colors hover:bg-carbon-700/35 sm:gap-4 sm:p-5"
                >
                  <span className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-control border ${read ? "border-carbon-700 text-ti-400" : "border-ember-400/30 bg-ember-500/10 text-ember-400"}`}>
                    {returned ? <WarningIcon aria-hidden="true" className="size-5" /> : <JobsIcon aria-hidden="true" className="size-5" />}
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono text-xs text-ti-400">{item.woNo}</span>
                      <span className={`inline-flex items-center gap-1.5 text-xs ${read ? "text-ti-400" : "text-ember-400"}`}>
                        {read ? <CheckCircleIcon aria-hidden="true" className="size-3.5" /> : <span aria-hidden="true" className="size-1.5 rounded-full bg-ember-400" />}
                        {read ? "อ่านแล้ว" : "ยังไม่อ่าน"}
                      </span>
                    </div>
                    <h2 className="break-words text-base font-medium text-ti-50">{item.title}</h2>
                    <p className="break-words text-sm text-ti-200">{item.body}</p>
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-1">
                      {dateText && <time dateTime={item.createdAt} className="text-xs text-ti-400">{dateText}</time>}
                      <span className="ml-auto inline-flex items-center gap-1 text-sm text-ember-400 group-hover:text-ti-50">
                        ดูใบงาน <ChevronRightIcon aria-hidden="true" className="size-3.5" />
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : !error ? (
        <div className="app-panel rounded-panel border border-carbon-700 bg-carbon-800 px-6 py-12 text-center">
          <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full border border-carbon-700 bg-carbon-900/50 text-ti-400">
            <NavIcon name="alerts" className="size-6" />
          </span>
          <h2 className="text-lg text-ti-50">ยังไม่มีงานที่ต้องติดตาม</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ti-400">เมื่อมีงานมอบหมายหรืองานส่งกลับมาแก้ไข แจ้งเตือนจะแสดงที่นี่</p>
        </div>
      ) : null}

      <p className="text-xs text-ti-400">สถานะอ่านแล้วบันทึกเฉพาะบนอุปกรณ์นี้ การอ่านแจ้งเตือนไม่ได้เปลี่ยนสถานะใบงาน</p>
    </div>
  );
}

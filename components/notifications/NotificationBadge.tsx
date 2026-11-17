"use client";

import { useNotifications } from "./NotificationProvider";

export function NotificationBadge({ className = "" }: { className?: string }) {
  const { unreadCount } = useNotifications();
  if (unreadCount === 0) return null;
  return <span className={`inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-ember-500 px-1 font-mono text-[10px] font-semibold leading-4 text-carbon-950 ${className}`}>
    <span aria-hidden="true">{unreadCount > 9 ? "9+" : unreadCount}</span>
    <span className="sr-only">ยังไม่อ่าน {unreadCount} รายการ</span>
  </span>;
}

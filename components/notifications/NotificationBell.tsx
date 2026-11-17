"use client";

import { NavIcon } from "@/components/shell/NavIcon";
import { useNotifications } from "./NotificationProvider";

/** The top-bar bell: rings now and then while there are unread alerts (stops once all are read). */
export function NotificationBell() {
  const { unreadCount } = useNotifications();
  return (
    <span aria-hidden="true" className={`inline-flex origin-top ${unreadCount > 0 ? "animate-bell-ring" : ""}`}>
      <NavIcon name="alerts" className="size-5" />
    </span>
  );
}

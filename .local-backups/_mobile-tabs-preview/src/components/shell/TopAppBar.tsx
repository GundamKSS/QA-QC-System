"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { QMark } from "@/components/dom/Wordmark";
import type { Role } from "@/lib/auth/types";
import { bottomTabs, isActive, sidebarSections } from "./nav";
import { NavIcon } from "./NavIcon";
import { NotificationBadge } from "@/components/notifications/NotificationBadge";

/** Title of the current place, taken from the same nav data as the tabs and sidebar. */
function pageTitle(pathname: string, roles: Role[]): string {
  const items = [...bottomTabs(roles), ...sidebarSections(roles).flatMap((section) => section.items)];
  return items.find((item) => pathname === item.href)?.label ?? items.find((item) => isActive(pathname, item))?.label ?? "QCheck";
}

/** docs/09 §1: current page title (+ sync status once the Outbox exists). */
export function TopAppBar({ roles }: { roles: Role[] }) {
  const pathname = usePathname();

  return (
    <header className="app-topbar sticky top-0 z-20 h-14 bg-carbon-800 border-b border-carbon-700/60 px-4 sm:px-6 flex items-center gap-3">
      <Link href="/home" aria-label="QCheck หน้าหลัก" className="md:hidden">
        <QMark className="h-6 w-auto" />
      </Link>
      <p className="text-base font-medium text-ti-50 truncate">{pageTitle(pathname, roles)}</p>
      <Link href="/alerts" className="relative ml-auto flex size-11 shrink-0 items-center justify-center rounded-lg text-ti-200 hover:bg-carbon-700">
        <span className="sr-only">แจ้งเตือน</span>
        <NavIcon name="alerts" className="size-5" />
        <NotificationBadge className="absolute right-0.5 top-0.5" />
      </Link>
    </header>
  );
}

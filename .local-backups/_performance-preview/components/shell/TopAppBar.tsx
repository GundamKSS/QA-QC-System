"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { QMark } from "@/components/dom/Wordmark";
import type { Role } from "@/lib/auth/types";
import { masterBySlug } from "@/lib/master/registry";
import { bottomTabs, isActive, sidebarSections } from "./nav";
import { NotificationBadge } from "@/components/notifications/NotificationBadge";
import { NotificationBell } from "@/components/notifications/NotificationBell";

/** Title of the current place, taken from the same nav data as the tabs and sidebar. */
function pageTitle(pathname: string, roles: Role[]): string {
  const items = [...bottomTabs(roles), ...sidebarSections(roles).flatMap((section) => section.items)];
  return items.find((item) => pathname === item.href)?.label ?? items.find((item) => isActive(pathname, item))?.label ?? "QCheck";
}

/** docs/09 §1: current page title (+ sync status once the Outbox exists). */
export function TopAppBar({ roles }: { roles: Role[] }) {
  const pathname = usePathname();
  const isMasterTable = pathname.startsWith("/master/") && pathname !== "/master";
  const [scrollActive, setScrollActive] = useState(false);
  const isScrolled = isMasterTable && scrollActive;
  const title = pageTitle(pathname, roles);
  const masterTitle = isMasterTable ? masterBySlug(pathname.split("/")[2] ?? "")?.label : undefined;

  useEffect(() => {
    if (!isMasterTable) return;

    const check = () => {
      const y = window.scrollY;
      setScrollActive((prev) => {
        if (!prev && y >= 50) return true;
        if (prev && y <= 28) return false;
        return prev;
      });
    };

    const frame = window.requestAnimationFrame(check);
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [isMasterTable]);

  return (
    <header className="app-topbar sticky top-0 z-20 h-14 bg-carbon-800 border-b border-carbon-700/60 px-4 sm:px-6 md:pl-[104px] flex items-center gap-3">
      {isMasterTable ? (
        <Link
          href="/master"
          aria-label="กลับไปข้อมูลหลัก"
          className={`topbar-back master-back ${isScrolled ? "topbar-back-visible" : "topbar-back-hidden"}`}
          tabIndex={isScrolled ? 0 : -1}
          aria-hidden={!isScrolled}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m12 5-7 7 7 7M5 12h14" />
          </svg>
          <span>ข้อมูลหลัก</span>
        </Link>
      ) : (
        <Link href="/home" aria-label="QCheck หน้าหลัก" className="md:hidden">
          <QMark className="h-6 w-auto" />
        </Link>
      )}
      <div className="app-location">
        <span lang="en">QCHECK / WORKSPACE</span>
        {masterTitle ? (
          /* Both titles stay mounted so CSS can cross-fade them when the filters dock (master-table.css). */
          <p className="app-location-swap text-base font-medium text-ti-50"><span>{title}</span><span>{masterTitle}</span></p>
        ) : (
          <p className="text-base font-medium text-ti-50 truncate">{title}</p>
        )}
      </div>
      {isMasterTable && <div id="master-filter-dock" className="topbar-filter-slot" />}
      <Link href="/alerts" className="relative ml-auto flex size-11 shrink-0 items-center justify-center rounded-full text-ti-200 hover:bg-carbon-700">
        <span className="sr-only">แจ้งเตือน</span>
        <NotificationBell />
        <NotificationBadge className="absolute right-0.5 top-0.5" />
      </Link>
    </header>
  );
}

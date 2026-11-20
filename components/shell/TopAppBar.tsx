"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { QMark } from "@/components/dom/Wordmark";
import type { ProgramRole, Role } from "@/lib/auth/types";
import { masterBySlug } from "@/lib/master/registry";
import { bottomTabs, isActive, sidebarSections } from "./nav";
import { NetworkSyncBadge } from "@/components/inspections/NetworkSyncBadge";

/** Title of the current place, taken from the same nav data as the tabs and sidebar. */
function pageTitle(pathname: string, roles: Role[], programRole?: ProgramRole): string {
  const items = [...bottomTabs(roles, programRole), ...sidebarSections(roles, programRole).flatMap((section) => section.items)];
  return items.find((item) => pathname === item.href)?.label ?? items.find((item) => isActive(pathname, item))?.label ?? "QA & QC System";
}

/** Back destination & label for the in-header dock button across all pages. */
function getBackTarget(pathname: string): { href: string; label: string } | null {
  if (pathname === "/home" || pathname === "/" || pathname === "/login" || pathname === "/change-password") return null;
  if (pathname.startsWith("/inspections/")) return null; // Inspection runner has custom header

  // Subpages
  if (/^\/master\/checklist-templates\/[^/]+$/i.test(pathname)) {
    return { href: "/master/checklist-templates", label: "เทมเพลตเช็คลิสต์" };
  }
  if (/^\/master\/model-checklists\/[^/]+$/i.test(pathname)) {
    return { href: "/master/checklist-templates", label: "เทมเพลตเช็คลิสต์" };
  }
  if (pathname === "/master/model-checklists") {
    return { href: "/master/checklist-templates", label: "เทมเพลตเช็คลิสต์" };
  }
  if (pathname.startsWith("/master/") && pathname !== "/master") {
    return { href: "/master", label: "ข้อมูลหลัก" };
  }
  if (/^\/plans\/\d+\/work-orders\/new$/i.test(pathname)) {
    const id = pathname.split("/")[2];
    return { href: `/plans/${id}?tab=work`, label: "แผนงาน" };
  }
  if (/^\/plans\/\d+$/i.test(pathname) || pathname === "/plans/new") {
    return { href: "/plans", label: "รายการแผน" };
  }
  if (/^\/inspections\/[^/]+\/rework$/i.test(pathname)) {
    return { href: "/jobs", label: "งานของฉัน" };
  }

  // Main pages (plans, jobs, history, alerts, master, admin/users, scan, more)
  return { href: "/home", label: "หน้าหลัก" };
}

/** docs/09 §1: current page title (+ sync status once the Outbox exists). */
export function TopAppBar({ roles, programRole }: { roles: Role[]; programRole?: ProgramRole }) {
  const pathname = usePathname();
  const isInspectionRunner = pathname.startsWith("/inspections/");
  const isMasterTable = /^\/master\/[^/]+$/i.test(pathname);
  const backTarget = useMemo(() => getBackTarget(pathname), [pathname]);
  const [scrollState, setScrollState] = useState<{
    pathname: string;
    scrollActive: boolean;
    headerHidden: boolean;
  }>({ pathname, scrollActive: false, headerHidden: false });

  const isSameRoute = scrollState.pathname === pathname;
  const scrollActive = isSameRoute && scrollState.scrollActive;
  const headerHidden = isSameRoute && scrollState.headerHidden;
  const isScrolled = backTarget !== null && scrollActive;
  const title = pageTitle(pathname, roles, programRole);
  const masterTitle = isMasterTable
    ? masterBySlug(pathname.split("/")[2] ?? "")?.label
    : /^\/master\/checklist-templates\/[^/]+$/i.test(pathname)
    ? "จัดลำดับเช็คลิสต์ (Checklist Template)"
    : undefined;

  useEffect(() => {
    let lastY = Math.max(0, window.scrollY);
    let downScrollDistance = 0;

    const check = () => {
      const y = Math.max(0, window.scrollY);
      const delta = y - lastY;

      // Accumulate downward scroll distance; reset if user scrolls upward
      if (delta > 0) {
        downScrollDistance += delta;
      } else if (delta < -2) {
        downScrollDistance = 0;
      }

      setScrollState((prev) => {
        const current =
          prev.pathname === pathname
            ? prev
            : { pathname, scrollActive: false, headerHidden: false };

        let nextScrollActive = current.scrollActive;
        if (backTarget) {
          if (!nextScrollActive && y >= 50) nextScrollActive = true;
          else if (nextScrollActive && y <= 28) nextScrollActive = false;
        } else {
          nextScrollActive = false;
        }

        let nextHeaderHidden = current.headerHidden;
        if (typeof window !== "undefined" && window.innerWidth >= 768) {
          // On PC mode (>= 768px): NEVER hide header!
          nextHeaderHidden = false;
          downScrollDistance = 0;
        } else if (y <= 24) {
          // Near the very top of the page: always keep header visible
          nextHeaderHidden = false;
          downScrollDistance = 0;
        } else if (delta < -4) {
          // Scrolling up (pulling page down): reveal immediately with fade!
          nextHeaderHidden = false;
          downScrollDistance = 0;
        } else if (downScrollDistance >= 120 && y > 72) {
          // Scrolling down (moving content up): wait ~3 steps (approx 120px) before fading away
          nextHeaderHidden = true;
        }

        if (
          prev.pathname === pathname &&
          prev.scrollActive === nextScrollActive &&
          prev.headerHidden === nextHeaderHidden
        ) {
          return prev;
        }
        return {
          pathname,
          scrollActive: nextScrollActive,
          headerHidden: nextHeaderHidden,
        };
      });

      lastY = y;
    };

    const frame = window.requestAnimationFrame(check);
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [pathname, backTarget]);

  const stickyHeaderClass = `sticky top-0 z-30 print:hidden transition-[transform,opacity] will-change-[transform,opacity] md:translate-y-0 md:opacity-100 md:pointer-events-auto md:transition-none ${
    headerHidden
      ? "max-md:-translate-y-full max-md:opacity-0 max-md:pointer-events-none duration-300 ease-in-out"
      : "translate-y-0 opacity-100 pointer-events-auto duration-200 ease-out"
  }`;

  if (isInspectionRunner) {
    return (
      <header className={`app-topbar ${stickyHeaderClass} bg-carbon-800 border-b border-carbon-700/60 pt-[env(safe-area-inset-top)]`}>
        <div className="h-16 px-3.5 sm:px-6 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <QMark className="h-7 w-auto shrink-0" />
            <span className="text-lg font-semibold text-ti-50 tracking-tight truncate">
              QA & QC System
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <NetworkSyncBadge />
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("qcheck:runner-cancel"))}
              className="h-11 rounded-2xl bg-ember-500 hover:bg-ember-400 px-4 text-xs font-semibold text-white shadow-sm transition-colors cursor-pointer"
              title="พักหรือยกเลิกการตรวจเครื่องนี้"
            >
              พัก / ยกเลิกตรวจ
            </button>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className={`app-topbar ${stickyHeaderClass} bg-carbon-800 border-b border-carbon-700/60 pt-[env(safe-area-inset-top)]`}>
      <div className="h-14 px-4 sm:px-6 flex items-center gap-3">
        {backTarget && (
          <Link
            href={backTarget.href}
            aria-label={`กลับไป${backTarget.label}`}
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
            <span>{backTarget.label}</span>
          </Link>
        )}
        {(!backTarget || !isScrolled) && (
          <Link href="/home" aria-label="QA & QC System หน้าหลัก" className="md:hidden">
            <QMark className="h-6 w-auto" />
          </Link>
        )}
        <div className="app-location">
          <span lang="en">QA & QC SYSTEM / WORKSPACE</span>
          {masterTitle ? (
            /* Both titles stay mounted so CSS can cross-fade them when the filters dock (master-table.css). */
            <p className="app-location-swap text-base font-medium text-ti-50"><span>{title}</span><span>{masterTitle}</span></p>
          ) : (
            <p className="text-base font-medium text-ti-50 truncate">{title}</p>
          )}
        </div>
        {isMasterTable && <div id="master-filter-dock" className="topbar-filter-slot" />}
        <NetworkSyncBadge className="ml-auto" />
      </div>
    </header>
  );
}

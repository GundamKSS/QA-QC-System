"use client";

import { ShellLink } from "./ShellLink";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/auth/types";
import { bottomTabs, isActive } from "./nav";
import { NavIcon } from "./NavIcon";
import { useKeyboardOpen } from "@/lib/hooks/useBrowserState";
import { NotificationBadge } from "@/components/notifications/NotificationBadge";

/** Mobile (< 768 px) compact bottom tab bar (up to 6 tabs). */
export function BottomTabBar({ roles }: { roles: Role[] }) {
  const pathname = usePathname();
  const keyboardOpen = useKeyboardOpen();
  // Hide bottom navigation during active checklist/rework runner sessions to prevent accidental exits and free thumb space.
  if (keyboardOpen || pathname.startsWith("/inspections/")) return null;

  return (
    <nav
      aria-label="เมนูหลัก"
      className="app-navigation app-mobile-tabs md:hidden fixed bottom-0 inset-x-0 z-40 bg-carbon-950/95 backdrop-blur-md border-t border-carbon-700/80 pb-[env(safe-area-inset-bottom)] select-none shadow-lg"
    >
      <ul className="flex h-12 items-stretch px-0.5">
        {bottomTabs(roles).map((tab) => {
          const active = isActive(pathname, tab);
          return (
            <li key={tab.href} className="min-w-0 flex-1 basis-0">
              <ShellLink
                href={tab.href}
                aria-current={active ? "page" : undefined}
                onClick={(event) => {
                  // docs/09 §3 ข้อ 5: tapping the open tab scrolls back to the top instead of reloading.
                  if (pathname === tab.href) {
                    event.preventDefault();
                    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
                  }
                }}
                className={`flex h-full w-full flex-col items-center justify-center gap-0.5 px-0.5 py-0.5 transition-colors ${
                  active ? "text-ember-500 font-semibold" : "text-ti-500 hover:text-ti-200"
                }`}
              >
                <span className="relative flex items-center justify-center">
                  <NavIcon name={tab.icon} className={`size-5 ${active ? "stroke-[2.2]" : "stroke-[1.6]"}`} />
                  {tab.href === "/alerts" && <NotificationBadge className="absolute -right-1.5 -top-1 scale-90" />}
                </span>
                <span className="truncate max-w-full text-center text-[9.5px] leading-tight min-[360px]:text-[10px] min-[390px]:text-[10.5px] tracking-tight">
                  {tab.label}
                </span>
              </ShellLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

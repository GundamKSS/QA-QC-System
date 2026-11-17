"use client";

import { ShellLink } from "./ShellLink";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/auth/types";
import { bottomTabs, isActive } from "./nav";
import { NavIcon } from "./NavIcon";
import { useKeyboardOpen } from "@/lib/hooks/useBrowserState";
import { NotificationBadge } from "@/components/notifications/NotificationBadge";

/** Mobile (< 768 px) bottom tab bar — docs/09 §2–3. Lives in the layout so it never flickers. */
export function BottomTabBar({ roles }: { roles: Role[] }) {
  const pathname = usePathname();
  const keyboardOpen = useKeyboardOpen();
  if (keyboardOpen) return null;

  return (
    <nav
      aria-label="เมนูหลัก"
      className="app-navigation app-mobile-tabs md:hidden fixed bottom-0 inset-x-0 z-40 bg-carbon-950 border-t border-carbon-700/80 pb-[env(safe-area-inset-bottom)] select-none"
    >
      <ul className="flex h-14 items-stretch">
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
                className={`flex h-full min-h-11 w-full flex-col items-center justify-center gap-1 px-0.5 transition-colors ${
                  active ? "text-ember-500 font-medium" : "text-ti-500 hover:text-ti-200"
                }`}
              >
                <span className="relative">
                  <NavIcon name={tab.icon} className={`size-6 ${active ? "stroke-[2.2]" : "stroke-[1.75]"}`} />
                  {tab.href === "/alerts" && <NotificationBadge className="absolute -right-2 -top-1" />}
                </span>
                <span className="whitespace-nowrap text-[11px] leading-none min-[375px]:text-xs">{tab.label}</span>
              </ShellLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

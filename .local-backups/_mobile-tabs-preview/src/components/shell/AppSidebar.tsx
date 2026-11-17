"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/dom/SignOutButton";
import { Wordmark } from "@/components/dom/Wordmark";
import { roleLabels } from "@/config/experience";
import type { SessionUser } from "@/lib/auth/types";
import { isActive, primaryRole, sidebarSections } from "./nav";
import { NavIcon } from "./NavIcon";
import { ShellLink } from "./ShellLink";
import { NotificationBadge } from "@/components/notifications/NotificationBadge";

/** Sidebar on ≥ 768 px — same destinations as the bottom tabs (docs/09 §5). */
export function AppSidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const role = primaryRole(user.roles);

  return (
    <aside
      aria-label="เมนูหลัก"
      className="app-navigation app-sidebar hidden md:flex flex-col w-64 shrink-0 h-dvh sticky top-0 bg-carbon-900 border-r border-carbon-700/60 z-30 select-none"
    >
      <div className="p-5 border-b border-carbon-700/50">
        <Link href="/home" className="inline-block rounded-md focus-visible:outline-2 focus-visible:outline-ember-500">
          <Wordmark />
        </Link>
      </div>

      <div className="flex-1 px-3 py-5 space-y-6 overflow-y-auto">
        {sidebarSections(user.roles).map((section) => (
          <nav key={section.title} aria-label={section.title}>
            <p className="px-3 mb-2 text-xs text-ti-500 font-medium">{section.title}</p>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <li key={item.href}>
                    <ShellLink
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                        active
                          ? "bg-carbon-800 text-ti-50 font-medium"
                          : "text-ti-400 hover:text-ti-50 hover:bg-carbon-800/50"
                      }`}
                    >
                      <NavIcon
                        name={item.icon}
                        className={`size-[18px] shrink-0 ${active ? "text-ember-500" : "text-ti-500"}`}
                      />
                      <span>{item.label}</span>
                      {item.href === "/alerts" && <NotificationBadge className="ml-auto" />}
                    </ShellLink>
                  </li>
                );
              })}
            </ul>
          </nav>
        ))}
      </div>

      <div className="shrink-0 p-4 border-t border-carbon-700/60 space-y-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ti-50 truncate">{user.fullName}</p>
          <p className="mt-0.5 text-xs text-ti-400 truncate">
            <span className="font-mono tracking-wider">{user.employeeCode}</span>
            {role && <> · {roleLabels[role]}</>}
          </p>
        </div>
        <SignOutButton className="w-full !h-9 text-xs" />
      </div>
    </aside>
  );
}

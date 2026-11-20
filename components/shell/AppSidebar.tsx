"use client";

import Link from "next/link";
import { useId, useRef } from "react";
import { useRailSurface } from "./useRailSurface";
import { railSurfacePath } from "./railSurface";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/dom/SignOutButton";
import { QMark } from "@/components/dom/Wordmark";
import { roleLabels } from "@/lib/config/experience";
import type { SessionUser } from "@/lib/auth/types";
import { isActive, primaryRole, sidebarSections } from "./nav";
import { NavIcon } from "./NavIcon";
import { ShellLink } from "./ShellLink";
import { NotificationBadge } from "@/components/notifications/NotificationBadge";

/**
 * Icon rail on ≥ 768 px — same destinations as the bottom tabs (docs/09 §5). It floats over the page on
 * frosted glass like the top bar, so the content area runs the full width underneath. Hovering (or
 * focusing) a menu stretches the same glass surface to reveal its name and description.
 */
export function AppSidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const root = useRef<HTMLElement>(null);
  const clip = useRef<SVGPathElement>(null);
  const outline = useRef<SVGPathElement>(null);
  const clipId = `rail-surface-${useId().replace(/:/g, "")}`;
  const initialPath = railSurfacePath(720, {extension:0, center:104, panelHeight:76});
  useRailSurface(root, clip, outline);
  const role = primaryRole(user.roles);
  const initials = user.fullName.trim().slice(0, 1) || user.employeeCode.slice(0, 1);

  return (
    <aside ref={root} aria-label="เมนูหลัก" className="app-rail hidden md:flex select-none">
      <svg className="app-rail-clip" width="0" height="0" aria-hidden="true" focusable="false"><defs><clipPath id={clipId} clipPathUnits="userSpaceOnUse"><path ref={clip} d={initialPath} /></clipPath></defs></svg>
      <div className="app-rail-glass" style={{clipPath:`url(#${clipId})`}} aria-hidden="true" />
      <svg className="app-rail-outline" aria-hidden="true" focusable="false"><path ref={outline} d={initialPath} /></svg>
      <Link href="/home" aria-label="QA & QC System หน้าหลัก" className="app-rail-brand">
        <QMark className="h-6 w-auto" />
      </Link>

      <div className="app-rail-sections">
        {sidebarSections(user.roles, user.programRole).map((section) => (
          <nav key={section.title} aria-label={section.title}>
            <ul>
              {section.items.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <li key={item.href}>
                    <ShellLink href={item.href} aria-current={active ? "page" : undefined} className="app-rail-link">
                      <span className="app-rail-icon">
                        <NavIcon name={item.icon} className="size-5" />
                        {item.href === "/alerts" && <NotificationBadge className="app-rail-badge" />}
                      </span>
                      <span className="app-rail-label">
                        <span className="min-w-0">
                          <span className="app-rail-label-title">{item.label}</span>
                          {item.hint && <span className="app-rail-label-hint">{item.hint}</span>}
                        </span>
                      </span>
                    </ShellLink>
                  </li>
                );
              })}
            </ul>
          </nav>
        ))}
      </div>

      <div className="app-rail-account">
        <button type="button" aria-label={`บัญชี ${user.fullName}`} className="app-rail-avatar">{initials}</button>
        <div className="app-rail-card" inert>
          <p className="text-sm font-medium text-ti-50 truncate">{user.fullName}</p>
          <p className="mt-0.5 text-xs text-ti-400 truncate">
            <span className="font-mono tracking-wider">{user.employeeCode}</span>
            {role && <> · {roleLabels[role]}</>}
          </p>
          <SignOutButton className="mt-3 w-full !h-9 text-xs" />
        </div>
      </div>
    </aside>
  );
}

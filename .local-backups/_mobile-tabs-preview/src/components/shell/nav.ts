import { ROLES, type Role } from "@/lib/auth/types";
import { canAccessPage } from "@/lib/auth/page-access";

/**
 * App-shell navigation (docs/09). Pure data so the tab rules can be tested without React;
 * the components map `icon` to an SVG.
 */
export type NavIcon = "home" | "dashboard" | "plans" | "jobs" | "scan" | "alerts" | "more" | "master" | "reports" | "settings" | "users";

export type NavItem = {
  label: string;
  href: string;
  icon: NavIcon;
  /** Path prefixes that light this item up (the href itself is always one). */
  also?: string[];
};

/** docs/09 §2: QC Insp. → QA Insp. → QC Head → QA Head → everything else in ROLES order. */
const PRIMARY_ORDER: Role[] = ["QC_INSPECTOR", "QA_INSPECTOR", "QC_HEAD", "QA_HEAD"];

export function primaryRole(roles: readonly Role[]): Role | null {
  return [...PRIMARY_ORDER, ...ROLES].find((role) => roles.includes(role)) ?? null;
}

const home: NavItem = { label: "หน้าหลัก", href: "/home", icon: "home" };
const alerts: NavItem = { label: "แจ้งเตือน", href: "/alerts", icon: "alerts" };
const more: NavItem = { label: "เพิ่มเติม", href: "/more", icon: "more" };
const scan: NavItem = { label: "สแกน", href: "/scan", icon: "scan" };

export function isAvailable(href: string): boolean {
  const path = href.split("?")[0];
  // /plans/<number> is a real plan; the Home mock rows link to ids like plan-001 and stay disabled.
  return (
    ["/home", "/more", "/alerts", "/admin/users", "/master", "/plans", "/plans/new", "/jobs"].includes(path) ||
    /^\/plans\/\d+(\/work-orders\/new)?$/.test(path)
  );
}

/** Five bottom tabs: a dedicated Home, two role shortcuts, Alerts and More. */
export function bottomTabs(roles: readonly Role[]): NavItem[] {
  switch (primaryRole(roles)) {
    case "QC_INSPECTOR":
      return [home, { label: "งานของฉัน", href: "/jobs", icon: "jobs" }, scan, alerts, more];
    case "QA_INSPECTOR":
      return [home, { label: "คิว QA", href: "/qa-queue", icon: "jobs" }, scan, alerts, more];
    case "QC_HEAD":
      return [
        home,
        { label: "แผน", href: "/plans", icon: "plans" },
        { label: "งาน", href: "/jobs", icon: "jobs" },
        alerts,
        more,
      ];
    case "QA_HEAD":
      return [home, { label: "แผน", href: "/plans", icon: "plans" }, { label: "คิว QA", href: "/qa-queue", icon: "jobs" }, alerts, more];
    default: {
      if (!canAccessPage(roles, "home")) return [];
      const secondary: NavItem = canAccessPage(roles, "settings")
        ? { label: "ตั้งค่า", href: "/settings", icon: "settings" }
        : canAccessPage(roles, "reports")
          ? { label: "รายงาน", href: "/reports", icon: "reports" }
          : { label: "ข้อมูลหลัก", href: "/master", icon: "master" };
      // The checklist module is already permitted for every role; ShellLink keeps
      // its shortcut disabled until the page exists. Do not duplicate Home to fill a slot.
      const extra: NavItem = canAccessPage(roles, "plans")
        ? { label: "แผน", href: "/plans", icon: "plans" }
        : secondary.href !== "/master" && canAccessPage(roles, "master")
          ? { label: "ข้อมูลหลัก", href: "/master", icon: "master" }
          : { label: "เช็กลิสต์", href: "/checklists", icon: "jobs" };
      return [home, secondary, extra, alerts, more];
    }
  }
}

/** Roles that may open a new inspection plan (A11: QC Head, QA Head, Admin). */
export const canOpenPlan = (roles: readonly Role[]) => canAccessPage(roles, "plan-open");

/** Master data: MASTER_ADMIN edits; heads, PM and management read (docs/02 §1). */
export const canSeeMaster = (roles: readonly Role[]) =>
  canAccessPage(roles, "master");

/** Sidebar on ≥ 768 px: the same places as the tabs, plus what mobile keeps under "เพิ่มเติม". */
export function sidebarSections(roles: readonly Role[]): { title: string; items: NavItem[] }[] {
  if (!canAccessPage(roles, "home")) return [];
  const work: NavItem[] = [
    { label: "หน้าหลัก", href: "/home", icon: "dashboard" },
  ];
  if (canAccessPage(roles, "plans")) work.push({ label: "แผนตรวจ", href: "/plans", icon: "plans" });
  if (canAccessPage(roles, "jobs")) work.push({ label: "งานของฉัน", href: "/jobs", icon: "jobs" });
  if (canAccessPage(roles, "qa-queue")) work.push({ label: "คิว QA", href: "/qa-queue", icon: "jobs" });
  if (canAccessPage(roles, "scan")) work.push({ label: "สแกน", href: "/scan", icon: "scan" });
  work.push({ label: "แจ้งเตือน", href: "/alerts", icon: "alerts" });

  const manage: NavItem[] = [];
  if (canAccessPage(roles, "reports")) manage.push({ label: "รายงาน", href: "/reports", icon: "reports" });
  if (canSeeMaster(roles)) manage.push({ label: "ข้อมูลหลัก", href: "/master", icon: "master" });
  if (canAccessPage(roles, "users")) manage.push({ label: "ผู้ใช้หน้างาน", href: "/admin/users", icon: "users" });
  if (canAccessPage(roles, "settings")) manage.push({ label: "อุปกรณ์ & ตั้งค่า", href: "/settings", icon: "settings" });

  return manage.length > 0
    ? [
        { title: "งานตรวจ", items: work },
        { title: "จัดการ", items: manage },
      ]
    : [{ title: "งานตรวจ", items: work }];
}

export function isActive(pathname: string, item: NavItem): boolean {
  return [item.href, ...(item.also ?? [])].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

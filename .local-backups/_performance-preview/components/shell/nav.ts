import { ROLES, type Role } from "@/lib/auth/types";
import { canAccessPage } from "@/lib/auth/page-access";

/**
 * App-shell navigation (docs/09). Pure data so the tab rules can be tested without React;
 * the components map `icon` to an SVG.
 */
export type NavIcon = "history" | "home" | "dashboard" | "plans" | "jobs" | "scan" | "alerts" | "more" | "master" | "reports" | "settings" | "users";

export type NavItem = {
  label: string;
  href: string;
  icon: NavIcon;
  /** Path prefixes that light this item up (the href itself is always one). */
  also?: string[];
  /** One line under the name in the laptop rail's hover card. */
  hint?: string;
};

/** docs/09 §2: QC Insp. → QA Insp. → QC Head → QA Head → everything else in ROLES order. */
const PRIMARY_ORDER: Role[] = ["QC_INSPECTOR", "QA_INSPECTOR", "QC_HEAD", "QA_HEAD"];

export function primaryRole(roles: readonly Role[]): Role | null {
  return [...PRIMARY_ORDER, ...ROLES].find((role) => roles.includes(role)) ?? null;
}

const home: NavItem = { label: "หน้าหลัก", href: "/home", icon: "home" };
const alerts: NavItem = { label: "แจ้งเตือน", href: "/alerts", icon: "alerts" };
/** Third tab of the four inspection roles (docs/18); the top-bar bell still opens Alerts. */
const history: NavItem = { label: "ประวัติ", href: "/history", icon: "history" };
const more: NavItem = { label: "เพิ่มเติม", href: "/more", icon: "more" };
const scan: NavItem = { label: "สแกน", href: "/scan", icon: "scan" };

export function isAvailable(href: string): boolean {
  const path = href.split("?")[0];
  // /plans/<number> is a real plan; the Home mock rows link to ids like plan-001 and stay disabled.
  return (
    ["/home", "/more", "/alerts", "/admin/users", "/master", "/plans", "/plans/new", "/jobs", "/history"].includes(path) ||
    /^\/plans\/\d+(\/work-orders\/new)?$/.test(path)
  );
}

/** Five bottom tabs: a dedicated Home, two role shortcuts, Alerts and More. */
export function bottomTabs(roles: readonly Role[]): NavItem[] {
  switch (primaryRole(roles)) {
    case "QC_INSPECTOR":
      return [home, { label: "งานของฉัน", href: "/jobs", icon: "jobs" }, scan, history, more];
    case "QA_INSPECTOR":
      return [home, { label: "คิว QA", href: "/qa-queue", icon: "jobs" }, scan, history, more];
    case "QC_HEAD":
      return [
        home,
        { label: "แผน", href: "/plans", icon: "plans" },
        { label: "งาน", href: "/jobs", icon: "jobs" },
        history,
        more,
      ];
    case "QA_HEAD":
      return [home, { label: "แผน", href: "/plans", icon: "plans" }, { label: "คิว QA", href: "/qa-queue", icon: "jobs" }, history, more];
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
    { label: "หน้าหลัก", href: "/home", icon: "dashboard", hint: "ภาพรวมแผน งาน และกำหนดส่งวันนี้" },
  ];
  if (canAccessPage(roles, "plans")) work.push({ label: "แผนตรวจ", href: "/plans", icon: "plans", hint: "เปิดแผน ติดตาม และเปิดใบงานเรียกเข้า" });
  if (canAccessPage(roles, "jobs")) work.push({ label: "งานของฉัน", href: "/jobs", icon: "jobs", hint: "ใบงานที่ได้รับมอบหมายและงานที่ต้องทำต่อ" });
  if (canAccessPage(roles, "qa-queue")) work.push({ label: "คิว QA", href: "/qa-queue", icon: "jobs", hint: "ล็อตที่รอ QA สุ่มตรวจตาม AQL" });
  if (canAccessPage(roles, "scan")) work.push({ label: "สแกน", href: "/scan", icon: "scan", hint: "สแกน QR/Serial เพื่อเริ่มตรวจเครื่อง" });
  work.push({ label: "แจ้งเตือน", href: "/alerts", icon: "alerts", hint: "งานใหม่ งานตีกลับ และเรื่องที่ต้องดู" });

  const manage: NavItem[] = [];
  if (canAccessPage(roles, "reports")) manage.push({ label: "รายงาน", href: "/reports", icon: "reports", hint: "Report QC/QA และสรุปผลการตรวจ" });
  if (canSeeMaster(roles)) manage.push({ label: "ข้อมูลหลัก", href: "/master", icon: "master", hint: "Brand, Model, Vendor, อาการ และวิธีแก้" });
  if (canAccessPage(roles, "users")) manage.push({ label: "ผู้ใช้หน้างาน", href: "/admin/users", icon: "users", hint: "เพิ่มผู้ใช้ PIN และกำหนดบทบาท" });
  if (canAccessPage(roles, "settings")) manage.push({ label: "อุปกรณ์ & ตั้งค่า", href: "/settings", icon: "settings", hint: "อุปกรณ์ส่วนกลางและค่าตั้งระบบ" });

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

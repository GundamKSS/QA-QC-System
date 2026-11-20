import { ROLES, type ProgramRole, type Role } from "@/lib/auth/types";
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
    ["/home", "/more", "/alerts", "/admin/users", "/admin/audit", "/master", "/plans", "/plans/new", "/jobs", "/history", "/scan", "/settings", "/qa-queue", "/reports"].includes(path) ||
    /^\/plans\/\d+(\/work-orders\/new|\/report)?$/.test(path)
  );
}

/** Mobile bottom tabs: dedicated Home, role-specific shortcuts, Alerts, and More (up to 6 tabs). */
export function bottomTabs(roles: readonly Role[], programRole?: ProgramRole): NavItem[] {
  switch (primaryRole(roles)) {
    case "QC_INSPECTOR":
      return [home, { label: "งานของฉัน", href: "/jobs", icon: "jobs" }, scan, history, alerts, more];
    case "QA_INSPECTOR":
      return [home, { label: "คิว QA", href: "/qa-queue", icon: "jobs" }, scan, history, alerts, more];
    case "QC_HEAD":
      return [
        home,
        { label: "แผน", href: "/plans", icon: "plans" },
        { label: "งาน", href: "/jobs", icon: "jobs" },
        history,
        alerts,
        more,
      ];
    case "QA_HEAD":
      return [
        home,
        { label: "แผน", href: "/plans", icon: "plans" },
        { label: "คิว QA", href: "/qa-queue", icon: "jobs" },
        history,
        alerts,
        more,
      ];
    default: {
      if (!canAccessPage(roles, "home", programRole)) return [];
      const tabs: NavItem[] = [home];
      if (canAccessPage(roles, "plans", programRole)) tabs.push({ label: "แผน", href: "/plans", icon: "plans" });
      if (canAccessPage(roles, "reports", programRole)) tabs.push({ label: "รายงาน", href: "/reports", icon: "reports" });
      if (canAccessPage(roles, "master", programRole)) tabs.push({ label: "ข้อมูลหลัก", href: "/master", icon: "master" });
      if (canAccessPage(roles, "users", programRole)) tabs.push({ label: "ผู้ใช้/สิทธิ์", href: "/admin/users", icon: "users" });
      if (canAccessPage(roles, "settings", programRole)) tabs.push({ label: "ตั้งค่า", href: "/settings", icon: "settings" });
      if (canAccessPage(roles, "checklists", programRole)) tabs.push({ label: "เช็กลิสต์", href: "/checklists", icon: "jobs" });

      const middle = tabs.slice(1, 4);
      return [home, ...middle, alerts, more];
    }
  }
}

/** Roles that may open a new inspection plan (A11: QC Head, QA Head, Admin). */
export const canOpenPlan = (roles: readonly Role[], programRole?: ProgramRole) => canAccessPage(roles, "plan-open", programRole);

/** Master data: MASTERDATA_ADMIN and ADMIN edit; heads, PM and management read (docs/02 §1). */
export const canSeeMaster = (roles: readonly Role[], programRole?: ProgramRole) =>
  canAccessPage(roles, "master", programRole);

/** Sidebar on ≥ 768 px: the same places as the tabs, plus what mobile keeps under "เพิ่มเติม". */
export function sidebarSections(roles: readonly Role[], programRole?: ProgramRole): { title: string; items: NavItem[] }[] {
  if (!canAccessPage(roles, "home", programRole)) return [];
  const work: NavItem[] = [
    { label: "หน้าหลัก", href: "/home", icon: "dashboard", hint: "ภาพรวมแผน งาน และกำหนดส่งวันนี้" },
  ];
  if (canAccessPage(roles, "plans", programRole)) {
    const isQaHead = roles.includes("QA_HEAD") && !roles.includes("QC_HEAD");
    work.push({
      label: isQaHead ? "แผนตรวจ QA" : "แผนตรวจ",
      href: "/plans",
      icon: "plans",
      hint: isQaHead ? "รับงานต่อจาก QC และจ่ายงานให้ผู้ตรวจ QA" : "เปิดแผน ติดตาม และเปิดใบงานเรียกเข้า",
    });
  }
  const isQaOnly =
    programRole !== "DEV" &&
    roles.some((r) => r.startsWith("QA")) &&
    !roles.some((r) => r.startsWith("QC")) &&
    !roles.includes("ADMIN");
  const isQcOnly =
    programRole !== "DEV" &&
    roles.some((r) => r.startsWith("QC")) &&
    !roles.some((r) => r.startsWith("QA")) &&
    !roles.includes("ADMIN");

  if (canAccessPage(roles, "jobs", programRole) && !isQaOnly) {
    const isHead = programRole === "DEV" || roles.includes("QC_HEAD") || roles.includes("ADMIN");
    work.push({
      label: isHead ? "ใบงาน QC ทั้งหมด" : "งานของฉัน",
      href: "/jobs",
      icon: "jobs",
      hint: isHead ? "ใบงาน QC ทั้งหมดและติดตามผู้ตรวจ" : "ใบงาน QC ที่ได้รับมอบหมายและงานที่ต้องทำต่อ",
    });
  }
  if (canAccessPage(roles, "qa-queue", programRole) && !isQcOnly) {
    const isQaHead = programRole === "DEV" || roles.includes("QA_HEAD") || roles.includes("ADMIN");
    work.push({
      label: isQaHead ? "ใบงาน QA ทั้งหมด" : "งานของฉัน",
      href: "/qa-queue",
      icon: "jobs",
      hint: isQaHead ? "ใบงาน QA ทั้งหมดและติดตามผู้ตรวจ" : "ใบงาน QA ที่ได้รับมอบหมายและงานที่ต้องตรวจต่อ",
    });
  }
  if (canAccessPage(roles, "scan", programRole)) work.push({ label: "สแกน", href: "/scan", icon: "scan", hint: "สแกน QR/Serial เพื่อเริ่มตรวจเครื่อง" });
  work.push({ label: "แจ้งเตือน", href: "/alerts", icon: "alerts", hint: "งานใหม่ งานตีกลับ และเรื่องที่ต้องดู" });

  const manage: NavItem[] = [];
  if (canAccessPage(roles, "reports", programRole)) manage.push({ label: "รายงาน", href: "/reports", icon: "reports", hint: "Report QC/QA และสรุปผลการตรวจ" });
  if (canSeeMaster(roles, programRole)) manage.push({ label: "ข้อมูลหลัก", href: "/master", icon: "master", hint: "Brand, Model, Vendor, อาการ และวิธีแก้" });
  if (canAccessPage(roles, "users", programRole)) manage.push({ label: "ผู้ใช้และสิทธิ์", href: "/admin/users", icon: "users", hint: "กำหนดสิทธิ์ผู้ใช้ระบบกลางและผู้ใช้หน้างาน PIN" });
  if (canAccessPage(roles, "audit", programRole)) manage.push({ label: "ประวัติการใช้งาน (Audit)", href: "/admin/audit", icon: "history", hint: "ตรวจสอบประวัติการเข้าสู่ระบบและแก้ไขข้อมูล" });
  if (canAccessPage(roles, "settings", programRole)) manage.push({ label: "การตั้งค่า และอุปกรณ์", href: "/settings", icon: "settings", hint: "อุปกรณ์ส่วนกลางและค่าตั้งระบบ" });

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

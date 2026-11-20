import { describe, expect, it } from "vitest";
import { canAccessPage, type AppPage } from "@/lib/auth/page-access";
import { ROLES, type Role } from "@/lib/auth/types";
import { bottomTabs, sidebarSections } from "@/components/shell/nav";

/** Independent expected matrix: Head QC = Admin QC, Head QA = Admin QA, ADMIN = Super Admin (100% access). */
const expected: Record<AppPage, readonly Role[]> = {
  home: ROLES, alerts: ROLES, account: ROLES, checklists: ROLES,
  plans: ["QC_HEAD", "QA_HEAD", "ADMIN"],
  "plan-open": ["QC_HEAD", "ADMIN"],
  "work-order": ["QC_HEAD", "ADMIN"],
  jobs: ["QC_HEAD", "QC_INSPECTOR", "QA_HEAD", "QA_INSPECTOR", "ADMIN"],
  history: ["QC_HEAD", "QC_INSPECTOR", "QA_HEAD", "QA_INSPECTOR", "ADMIN"],
  "qa-queue": ["QA_HEAD", "QA_INSPECTOR", "ADMIN"],
  scan: ["QC_HEAD", "QC_INSPECTOR", "QA_HEAD", "QA_INSPECTOR", "ADMIN"],
  master: ["MASTERDATA_ADMIN", "ADMIN", "QC_HEAD", "QA_HEAD", "PM", "MANAGEMENT"],
  "master-edit": ["MASTERDATA_ADMIN", "ADMIN"],
  reports: ["ADMIN", "QC_HEAD", "QC_INSPECTOR", "QA_HEAD", "QA_INSPECTOR", "PURCHASING", "PM", "MANAGEMENT"],
  settings: ["ADMIN"],
  users: ["ADMIN", "QC_HEAD", "QA_HEAD"],
  dashboard: ["ADMIN", "QA_HEAD", "PURCHASING", "PM", "MANAGEMENT"],
  audit: ["ADMIN", "QC_HEAD", "QA_HEAD", "MANAGEMENT"],
};

describe("page admission", () => {
  it.each(Object.keys(expected) as AppPage[])("checks every role for %s", page => {
    for (const role of ROLES) expect(canAccessPage([role], page), `${role}: ${page}`).toBe(expected[page].includes(role));
    expect(canAccessPage([], page)).toBe(false);
    expect(canAccessPage(["DEV" as Role], page)).toBe(false);
  });

  it("treats ADMIN as Super Admin with full access while keeping heads scoped", () => {
    expect(canAccessPage(["ADMIN"], "jobs")).toBe(true);
    expect(canAccessPage(["ADMIN"], "qa-queue")).toBe(true);
    expect(canAccessPage(["ADMIN"], "master-edit")).toBe(true);
    expect(canAccessPage(["QA_HEAD"], "master-edit")).toBe(false);
    expect(canAccessPage(["QA_HEAD", "MASTERDATA_ADMIN"], "master-edit")).toBe(true);
    expect(canAccessPage(["QC_HEAD"], "qa-queue")).toBe(false);
    expect(canAccessPage(["QA_HEAD"], "users")).toBe(true);
  });

  it("offers only permitted destinations on desktop and mobile for all nine roles", () => {
    const routes: Record<string, AppPage> = {
      "/home": "home", "/alerts": "alerts", "/more": "account", "/plans": "plans",
      "/jobs": "jobs", "/history": "history", "/qa-queue": "qa-queue", "/scan": "scan", "/master": "master",
      "/reports": "reports", "/settings": "settings", "/admin/users": "users", "/admin/audit": "audit",
      "/checklists": "checklists",
    };
    for (const role of ROLES) {
      const desktop = sidebarSections([role]).flatMap(section => section.items);
      for (const item of [...desktop, ...bottomTabs([role])]) {
        expect(expected[routes[item.href]].includes(role), `${role}: ${item.href}`).toBe(true);
      }
    }
    expect(sidebarSections([])).toEqual([]);
    expect(bottomTabs([])).toEqual([]);
  });
});

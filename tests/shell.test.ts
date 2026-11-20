import { describe, expect, it } from "vitest";
import { ROLES } from "@/lib/auth/types";
import { bottomTabs, canOpenPlan, canSeeMaster, isActive, isAvailable, primaryRole } from "@/components/shell/nav";

describe("app navigation", () => {
  it("keeps unique mobile destinations with a dedicated Home for every role (up to 6 tabs on mobile)", () => {
    for (const role of ROLES) {
      const tabs = bottomTabs([role]);
      expect(tabs.length).toBeGreaterThanOrEqual(5);
      expect(tabs.length).toBeLessThanOrEqual(6);
      expect(new Set(tabs.map(tab => tab.href)).size).toBe(tabs.length);
      expect(tabs[0]).toMatchObject({ label: "หน้าหลัก", href: "/home", icon: "home" });
      expect(tabs.filter(tab => isActive("/home", tab))).toEqual([tabs[0]]);
      expect(tabs.slice(-2).map(tab => tab.href)).toEqual(["/alerts", "/more"]);
    }
    for (const role of ["QC_INSPECTOR", "QA_INSPECTOR", "QC_HEAD", "QA_HEAD"] as const) {
      expect(bottomTabs([role])).toHaveLength(6);
    }
  });

  it("selects the destination being viewed without also selecting Home", () => {
    for (const role of ROLES) {
      const tabs = bottomTabs([role]);
      for (const tab of tabs) {
        expect(tabs.filter(item => isActive(tab.href, item))).toEqual([tab]);
      }
    }
    const tabs = bottomTabs(["QC_HEAD"]);
    expect(tabs.filter(tab => isActive("/plans/12/work-orders/new", tab)).map(tab => tab.href)).toEqual(["/plans"]);
  });

  it("gives QA a separate queue shortcut without routing it back to Home", () => {
    const queue = bottomTabs(["QA_INSPECTOR"]).find(tab => tab.label === "คิว QA");
    expect(queue?.href).toBe("/qa-queue");
    expect(isAvailable(queue!.href)).toBe(true);
  });

  it("prioritizes the inspection role consistently across navigation and account labels", () => {
    expect(primaryRole(["ADMIN", "QA_HEAD", "QA_INSPECTOR", "QC_INSPECTOR"])).toBe("QC_INSPECTOR");
  });

  it("does not offer head-only actions or master data to ordinary inspectors", () => {
    for (const role of ["QC_INSPECTOR", "QA_INSPECTOR"] as const) {
      expect(canOpenPlan([role])).toBe(false);
      expect(canSeeMaster([role])).toBe(false);
    }
    expect(canOpenPlan(["QC_HEAD"])).toBe(true);
    expect(canOpenPlan(["QA_HEAD"])).toBe(false);
    expect(canOpenPlan(["ADMIN"])).toBe(true);
    for (const role of ["MASTERDATA_ADMIN", "PURCHASING", "PM", "MANAGEMENT"] as const) expect(canOpenPlan([role])).toBe(false);
  });

  it("only enables destinations that have pages", () => {
    for (const path of ["/home", "/more", "/alerts", "/admin/users", "/admin/audit", "/master", "/plans", "/plans/new", "/plans/12", "/plans/12?tab=history", "/plans/12/work-orders/new", "/jobs", "/scan", "/settings", "/qa-queue", "/reports"]) expect(isAvailable(path)).toBe(true);
    for (const path of ["/plans/plan-001", "/checklists"]) expect(isAvailable(path)).toBe(false);
  });

  it("sends the plan and job tabs to the real pages on mobile (docs/16 §0)", () => {
    expect(bottomTabs(["QC_HEAD"]).map((tab) => tab.href)).toEqual(["/home", "/plans", "/jobs", "/history", "/alerts", "/more"]);
    expect(bottomTabs(["QA_HEAD"])[1].href).toBe("/plans");
    expect(bottomTabs(["QC_INSPECTOR"])[1].href).toBe("/jobs");
  });
});

import { describe, it, expect } from "vitest";
import { canAccessPage } from "@/lib/auth/page-access";
import { knownRoles } from "@/lib/auth/roles";
import { bottomTabs } from "@/components/shell/nav";
import { canUnlockLocalUser } from "@/lib/auth/local-admin";
import type { Role } from "@/lib/auth/types";

describe("QA Roles Connectivity & RBAC Audits", () => {
  describe("TC-01: Page Access RBAC & Permissions (3-Admin Model)", () => {
    it("Super Admin (ADMIN) has 100% access across all IT, QC, QA and Master pages", () => {
      for (const page of [
        "plans", "plan-open", "work-order", "jobs", "history", "qa-queue", "scan",
        "master", "master-edit", "reports", "settings", "users", "dashboard", "audit",
      ] as const) {
        expect(canAccessPage(["ADMIN"], page), `ADMIN must access ${page}`).toBe(true);
      }
    });

    it("Head QC (Admin QC) accesses QC pages and users, but not QA Queue", () => {
      expect(canAccessPage(["QC_HEAD"], "plans")).toBe(true);
      expect(canAccessPage(["QC_HEAD"], "plan-open")).toBe(true);
      expect(canAccessPage(["QC_HEAD"], "jobs")).toBe(true);
      expect(canAccessPage(["QC_HEAD"], "users")).toBe(true);
      expect(canAccessPage(["QC_HEAD"], "qa-queue")).toBe(false);
    });

    it("Head QA (Admin QA) accesses QA pages and users, but cannot open QC plans", () => {
      expect(canAccessPage(["QA_HEAD"], "plans")).toBe(true);
      expect(canAccessPage(["QA_HEAD"], "qa-queue")).toBe(true);
      expect(canAccessPage(["QA_HEAD"], "users")).toBe(true);
      expect(canAccessPage(["QA_HEAD"], "plan-open")).toBe(false);
    });

    it("Inspectors must not have direct access to plan management", () => {
      expect(canAccessPage(["QC_INSPECTOR"], "plans")).toBe(false);
      expect(canAccessPage(["QA_INSPECTOR"], "plans")).toBe(false);
      expect(canAccessPage(["QC_INSPECTOR"], "plan-open")).toBe(false);
      expect(canAccessPage(["QA_INSPECTOR"], "plan-open")).toBe(false);
    });

    it("Master Data Admin can edit master data while heads can only view", () => {
      expect(canAccessPage(["MASTERDATA_ADMIN"], "master-edit")).toBe(true);
      expect(canAccessPage(["QC_HEAD"], "master-edit")).toBe(false);
      expect(canAccessPage(["QA_HEAD"], "master-edit")).toBe(false);
      expect(knownRoles(["MASTER_ADMIN"])).toEqual(["MASTERDATA_ADMIN"]);
    });
  });

  describe("TC-02: Navigation & Tab Integrity (Zero 404 links)", () => {
    const ALL_ROLES: Role[][] = [
      ["QC_INSPECTOR"],
      ["QA_INSPECTOR"],
      ["QC_HEAD"],
      ["QA_HEAD"],
      ["MASTERDATA_ADMIN"],
      ["ADMIN"],
      ["ADMIN", "MASTERDATA_ADMIN", "QA_HEAD", "QC_HEAD"], // Super Admin
    ];

    it("All bottom tabs must keep between 5 and 6 tabs for mobile UX", () => {
      for (const roles of ALL_ROLES) {
        const tabs = bottomTabs(roles);
        expect(tabs.length).toBeGreaterThanOrEqual(5);
        expect(tabs.length).toBeLessThanOrEqual(6);
        expect(tabs[0].href).toBe("/home");
      }
    });

    it("QA Inspector must have QA Queue in bottom tabs instead of QC jobs", () => {
      const tabs = bottomTabs(["QA_INSPECTOR"]);
      const qaTab = tabs.find((t) => t.href === "/qa-queue");
      const qcTab = tabs.find((t) => t.href === "/jobs");
      expect(qaTab).toBeDefined();
      expect(qcTab).toBeUndefined();
    });

    it("QC Inspector must have Jobs in bottom tabs", () => {
      const tabs = bottomTabs(["QC_INSPECTOR"]);
      const qcTab = tabs.find((t) => t.href === "/jobs");
      expect(qcTab).toBeDefined();
    });
  });

  describe("TC-03: Local PIN Unlocking Delegation", () => {
    it("Admin can unlock any field user", () => {
      expect(canUnlockLocalUser(["ADMIN"], { roles: ["QC_INSPECTOR"] })).toBe(true);
      expect(canUnlockLocalUser(["ADMIN"], { roles: ["QA_INSPECTOR"] })).toBe(true);
    });

    it("QC Head (Admin QC) can unlock QC Inspectors but not QA Inspectors", () => {
      expect(canUnlockLocalUser(["QC_HEAD"], { roles: ["QC_INSPECTOR"] })).toBe(true);
      expect(canUnlockLocalUser(["QC_HEAD"], { roles: ["QA_INSPECTOR"] })).toBe(false);
    });

    it("QA Head (Admin QA) can unlock QA Inspectors but not QC Inspectors", () => {
      expect(canUnlockLocalUser(["QA_HEAD"], { roles: ["QA_INSPECTOR"] })).toBe(true);
      expect(canUnlockLocalUser(["QA_HEAD"], { roles: ["QC_INSPECTOR"] })).toBe(false);
    });

    it("Inspectors cannot unlock anyone", () => {
      expect(canUnlockLocalUser(["QC_INSPECTOR"], { roles: ["QC_INSPECTOR"] })).toBe(false);
      expect(canUnlockLocalUser(["QA_INSPECTOR"], { roles: ["QA_INSPECTOR"] })).toBe(false);
    });
  });
});

import { describe, expect, it } from "vitest";
import { canManageLocalUsers } from "@/lib/auth/local-admin";
import { canAccessPage, PAGE_ACCESS, type AppPage } from "@/lib/auth/page-access";
import { canInspectSide, hasAppAccess, parseProgramRole, resolveEffectiveRoles } from "@/lib/auth/roles";
import { ROLES } from "@/lib/auth/types";

describe("ProgramPermission (User / Admin / Dev) + QCheck sub-roles", () => {
  it("parses User, Admin, Dev case-insensitively and prioritizes DEV > ADMIN > USER", () => {
    expect(parseProgramRole("user")).toEqual({ programRole: "USER", unknown: [] });
    expect(parseProgramRole("Admin")).toEqual({ programRole: "ADMIN", unknown: [] });
    expect(parseProgramRole("dev")).toEqual({ programRole: "DEV", unknown: [] });
    expect(parseProgramRole("user, admin")).toEqual({ programRole: "ADMIN", unknown: [] });
    expect(parseProgramRole(["user", "dev", "admin"])).toEqual({ programRole: "DEV", unknown: [] });
    expect(parseProgramRole(["user", "QC_HEAD"])).toEqual({ programRole: "USER", unknown: ["QC_HEAD"] });
    expect(parseProgramRole("QC_INSPECTOR")).toEqual({ programRole: null, unknown: ["QC_INSPECTOR"] });
  });

  it("DEV sees everything and every page even without dbo.user_roles entries", () => {
    expect(resolveEffectiveRoles("DEV", [])).toEqual([...ROLES]);
    expect(hasAppAccess({ programRole: "DEV", roles: [] })).toBe(true);
    expect(canManageLocalUsers([], "DEV")).toBe(true);
    for (const page of Object.keys(PAGE_ACCESS) as AppPage[]) {
      expect(canAccessPage([], page, "DEV")).toBe(true);
    }
  });

  it("ADMIN gets user/permission management & settings automatically, and checks QCheck sub-roles for operational pages", () => {
    expect(resolveEffectiveRoles("ADMIN", [])).toEqual([]);
    expect(hasAppAccess({ programRole: "ADMIN", roles: [] })).toBe(true);
    expect(canManageLocalUsers([], "ADMIN")).toBe(true);

    // Automatic pages for ProgramPermission ADMIN
    expect(canAccessPage([], "home", "ADMIN")).toBe(true);
    expect(canAccessPage([], "users", "ADMIN")).toBe(true);
    expect(canAccessPage([], "settings", "ADMIN")).toBe(true);

    // Operational pages require sub-roles in QCheck just like USER
    expect(canAccessPage([], "plans", "ADMIN")).toBe(false);
    expect(canAccessPage([], "jobs", "ADMIN")).toBe(false);
    expect(canAccessPage([], "qa-queue", "ADMIN")).toBe(false);
    expect(canAccessPage([], "master-edit", "ADMIN")).toBe(false);

    // Once sub-roles are assigned in QCheck, those operational pages open up
    expect(canAccessPage(["QC_HEAD"], "plans", "ADMIN")).toBe(true);
    expect(canAccessPage(["QC_HEAD"], "plan-open", "ADMIN")).toBe(true);
    expect(canAccessPage(["QC_HEAD"], "master-edit", "ADMIN")).toBe(false);
  });

  it("USER with no sub-roles has no app access; with sub-roles accesses only matching pages", () => {
    expect(hasAppAccess({ programRole: "USER", roles: [] })).toBe(false);
    expect(canManageLocalUsers([], "USER")).toBe(false);
    expect(canAccessPage([], "home", "USER")).toBe(false);
    expect(canAccessPage([], "users", "USER")).toBe(false);

    expect(hasAppAccess({ programRole: "USER", roles: ["QC_INSPECTOR"] })).toBe(true);
    expect(canAccessPage(["QC_INSPECTOR"], "jobs", "USER")).toBe(true);
    expect(canAccessPage(["QC_INSPECTOR"], "plans", "USER")).toBe(false);
    expect(canAccessPage(["QC_INSPECTOR"], "users", "USER")).toBe(false);
  });

  it("enforces QC vs QA inspection side boundaries", () => {
    expect(canInspectSide(["QC_INSPECTOR"], "QC", "USER")).toBe(true);
    expect(canInspectSide(["QC_INSPECTOR"], "QA", "USER")).toBe(false);
    expect(canInspectSide(["QA_INSPECTOR"], "QA", "USER")).toBe(true);
    expect(canInspectSide(["QA_INSPECTOR"], "QC", "USER")).toBe(false);
    expect(canInspectSide(["ADMIN"], "QC", "ADMIN")).toBe(true);
    expect(canInspectSide(["ADMIN"], "QA", "ADMIN")).toBe(true);
    expect(canInspectSide([], "QC", "DEV")).toBe(true);
    expect(canInspectSide([], "QA", "DEV")).toBe(true);
    expect(canInspectSide([], "QC", "ADMIN")).toBe(false);
  });
});

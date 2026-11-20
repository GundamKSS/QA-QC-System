import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  dbConfigured: vi.fn(),
  listCentralUsers: vi.fn(),
  searchDatacenterEmployees: vi.fn(),
  grantCentralUserAccess: vi.fn(),
  updateCentralUserRoles: vi.fn(),
  audit: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/config", () => ({ dbConfigured: mocks.dbConfigured }));
vi.mock("@/lib/db/central-users", () => ({
  listCentralUsers: mocks.listCentralUsers,
  searchDatacenterEmployees: mocks.searchDatacenterEmployees,
  grantCentralUserAccess: mocks.grantCentralUserAccess,
  updateCentralUserRoles: mocks.updateCentralUserRoles,
}));
vi.mock("@/lib/auth/audit", () => ({
  audit: mocks.audit,
  auditContext: () => ({ ip: "127.0.0.1", userAgent: "vitest" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { GET, POST } from "@/app/api/admin/central-users/route";
import { GET as searchEmployees } from "@/app/api/admin/central-users/employees/route";
import { PATCH } from "@/app/api/admin/central-users/[id]/roles/route";

const req = (method: string, body?: unknown, origin = true, url = "http://localhost:3000/api/admin/central-users") =>
  new Request(url, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(origin ? { "sec-fetch-site": "same-origin" } : { "sec-fetch-site": "cross-site" }),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const adminUser = {
  id: "2",
  employeeCode: "TRW002",
  fullName: "Admin User",
  programRole: "ADMIN" as const,
  roles: [],
  mustChangePassword: false,
};

const devUser = {
  id: "1",
  employeeCode: "dev",
  fullName: "Dev",
  programRole: "DEV" as const,
  roles: [],
  mustChangePassword: false,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.dbConfigured.mockReturnValue(true);
});

describe("GET /api/admin/central-users", () => {
  it("returns 401 when signed out", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await GET(req("GET"))).status).toBe(401);
  });

  it("returns 403 for QC_HEAD (cannot manage central user permissions)", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "10",
      employeeCode: "TRW010",
      fullName: "QC Head",
      programRole: "USER",
      roles: ["QC_HEAD"],
      mustChangePassword: false,
    });
    expect((await GET(req("GET"))).status).toBe(403);
  });

  it("returns central users for ProgramPermission ADMIN even with empty sub-roles", async () => {
    mocks.getCurrentUser.mockResolvedValue(adminUser);
    const payload = { users: [{ id: "5", employeeCode: "TRW005", programRole: "USER", roles: [] }] };
    mocks.listCentralUsers.mockResolvedValue(payload);

    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(payload);
  });

  it("returns central users for DEV", async () => {
    mocks.getCurrentUser.mockResolvedValue(devUser);
    mocks.listCentralUsers.mockResolvedValue({ users: [] });
    expect((await GET(req("GET"))).status).toBe(200);
  });
});

describe("GET /api/admin/central-users/employees", () => {
  it("returns 403 for non-admin users", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "10",
      employeeCode: "TRW010",
      fullName: "QC Head",
      programRole: "USER",
      roles: ["QC_HEAD"],
      mustChangePassword: false,
    });
    expect((await searchEmployees(req("GET", undefined, true, "http://localhost:3000/api/admin/central-users/employees?q=101"))).status).toBe(403);
  });

  it("returns empty list without hitting DB when query is shorter than 2 chars", async () => {
    mocks.getCurrentUser.mockResolvedValue(adminUser);
    const res = await searchEmployees(req("GET", undefined, true, "http://localhost:3000/api/admin/central-users/employees?q=1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ employees: [] });
    expect(mocks.searchDatacenterEmployees).not.toHaveBeenCalled();
  });

  it("searches DATA_CENTER.dbo.Employee for Admin/Dev", async () => {
    mocks.getCurrentUser.mockResolvedValue(adminUser);
    const payload = {
      employees: [
        {
          employeeCode: "10138003",
          fullName: "สมชาย ทดสอบ",
          email: null,
          jobTitle: null,
          hasProgramPermission: false,
          canUse: false,
          programRole: null,
          qcheckUserId: null,
          roles: [],
        },
      ],
    };
    mocks.searchDatacenterEmployees.mockResolvedValue(payload);

    const res = await searchEmployees(req("GET", undefined, true, "http://localhost:3000/api/admin/central-users/employees?q=10138"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(payload);
    expect(mocks.searchDatacenterEmployees).toHaveBeenCalledWith("10138", 15);
  });
});

describe("POST /api/admin/central-users (grant from DATA_CENTER)", () => {
  it("rejects cross-site requests with 403", async () => {
    expect((await POST(req("POST", { employeeCode: "10138003", programRole: "USER" }, false))).status).toBe(403);
  });

  it("blocks ADMIN from granting DEV level (403)", async () => {
    mocks.getCurrentUser.mockResolvedValue(adminUser);
    const res = await POST(req("POST", { employeeCode: "10138003", programRole: "DEV", roles: [] }));
    expect(res.status).toBe(403);
    expect(mocks.grantCentralUserAccess).not.toHaveBeenCalled();
  });

  it("returns 422 when employeeCode is missing or role is unknown", async () => {
    mocks.getCurrentUser.mockResolvedValue(adminUser);
    expect((await POST(req("POST", { employeeCode: "", programRole: "USER" }))).status).toBe(422);
    expect((await POST(req("POST", { employeeCode: "10138003", programRole: "USER", roles: ["NOPE"] }))).status).toBe(422);
  });

  it("returns 404 when employee is not found in DATA_CENTER.dbo.Employee", async () => {
    mocks.getCurrentUser.mockResolvedValue(adminUser);
    mocks.grantCentralUserAccess.mockResolvedValue({ ok: false, error: "employee_not_found" });
    const res = await POST(req("POST", { employeeCode: "999999", programRole: "USER", roles: ["QC_INSPECTOR"] }));
    expect(res.status).toBe(404);
  });

  it("grants ProgramPermission (ProgramID=3) + QCheck sub-roles and writes audit", async () => {
    mocks.getCurrentUser.mockResolvedValue(adminUser);
    mocks.grantCentralUserAccess.mockResolvedValue({
      ok: true,
      created: true,
      user: { id: "42", employeeCode: "10138003", fullName: "สมชาย ทดสอบ" },
      before: { programRole: null, roles: [] },
      after: { programRole: "USER", roles: ["QC_INSPECTOR"] },
    });

    const res = await POST(req("POST", { employeeCode: "10138003", programRole: "USER", roles: ["QC_INSPECTOR"] }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ status: "done", user: { id: "42", employeeCode: "10138003" } });
    expect(mocks.grantCentralUserAccess).toHaveBeenCalledWith({
      employeeCode: "10138003",
      programRole: "USER",
      roles: ["QC_INSPECTOR"],
      actorId: "2",
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.create",
        target: { id: "42", employeeCode: "10138003" },
      }),
      expect.any(Object),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/users");
  });

  it("allows DEV to grant DEV level", async () => {
    mocks.getCurrentUser.mockResolvedValue(devUser);
    mocks.grantCentralUserAccess.mockResolvedValue({
      ok: true,
      created: true,
      user: { id: "43", employeeCode: "15969945007", fullName: "Dev Person" },
      before: { programRole: null, roles: [] },
      after: { programRole: "DEV", roles: [] },
    });
    const res = await POST(req("POST", { employeeCode: "15969945007", programRole: "DEV", roles: [] }));
    expect(res.status).toBe(201);
  });
});

describe("PATCH /api/admin/central-users/[id]/roles", () => {
  it("rejects cross-site requests with 403", async () => {
    expect((await PATCH(req("PATCH", { roles: ["QC_INSPECTOR"] }, false), ctx("5"))).status).toBe(403);
  });

  it("rejects unknown QCheck roles with 422", async () => {
    mocks.getCurrentUser.mockResolvedValue(adminUser);
    const res = await PATCH(req("PATCH", { roles: ["SUPERUSER"] }), ctx("5"));
    expect(res.status).toBe(422);
  });

  it("blocks ADMIN from promoting a user to DEV (403)", async () => {
    mocks.getCurrentUser.mockResolvedValue(adminUser);
    const res = await PATCH(req("PATCH", { roles: [], programRole: "DEV" }), ctx("5"));
    expect(res.status).toBe(403);
    expect(mocks.updateCentralUserRoles).not.toHaveBeenCalled();
  });

  it("updates sub-roles, logs audit, and revalidates /admin/users", async () => {
    mocks.getCurrentUser.mockResolvedValue(adminUser);
    mocks.updateCentralUserRoles.mockResolvedValue({
      ok: true,
      user: { id: "5", employeeCode: "TRW005", fullName: "Somchai" },
      before: [],
      after: ["QC_HEAD", "QC_INSPECTOR"],
      beforeProgramRole: "USER",
      afterProgramRole: "USER",
    });

    const res = await PATCH(req("PATCH", { roles: ["QC_INSPECTOR", "QC_HEAD"] }), ctx("5"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "done", roles: ["QC_HEAD", "QC_INSPECTOR"] });
    expect(mocks.updateCentralUserRoles).toHaveBeenCalledWith("5", ["QC_HEAD", "QC_INSPECTOR"], "2", undefined);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.roles_change",
        target: { id: "5", employeeCode: "TRW005" },
        before: { roles: [] },
        after: { roles: ["QC_HEAD", "QC_INSPECTOR"] },
      }),
      expect.any(Object),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/users");
  });

  it("passes nextProgramRole when changing ProgramPermission level", async () => {
    mocks.getCurrentUser.mockResolvedValue(adminUser);
    mocks.updateCentralUserRoles.mockResolvedValue({
      ok: true,
      user: { id: "5", employeeCode: "TRW005", fullName: "Somchai" },
      before: ["QC_HEAD"],
      after: ["QC_HEAD"],
      beforeProgramRole: "USER",
      afterProgramRole: "ADMIN",
    });

    const res = await PATCH(req("PATCH", { roles: ["QC_HEAD"], programRole: "ADMIN" }), ctx("5"));
    expect(res.status).toBe(200);
    expect(mocks.updateCentralUserRoles).toHaveBeenCalledWith("5", ["QC_HEAD"], "2", {
      nextProgramRole: "ADMIN",
      actorCanGrantDev: false,
    });
  });

  it("returns 404 when central user does not exist", async () => {
    mocks.getCurrentUser.mockResolvedValue(devUser);
    mocks.updateCentralUserRoles.mockResolvedValue({ ok: false, error: "not_found" });
    expect((await PATCH(req("PATCH", { roles: [] }), ctx("999"))).status).toBe(404);
  });
});

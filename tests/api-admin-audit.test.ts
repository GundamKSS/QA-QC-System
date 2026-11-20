import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUser, loadAuditLogs } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  loadAuditLogs: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({ getCurrentUser }));
vi.mock("@/lib/audit/service", () => ({ loadAuditLogs }));

import { GET } from "@/app/api/admin/audit/route";

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({
    id: "1",
    employeeCode: "ADM0001",
    fullName: "Admin",
    roles: ["ADMIN"],
    mustChangePassword: false,
  });
  loadAuditLogs.mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    pageSize: 50,
    totalPages: 1,
    dbAvailable: true,
  });
});

describe("GET /api/admin/audit", () => {
  it("returns 401 for unauthenticated requests", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost:3000/api/admin/audit"));
    expect(res.status).toBe(401);
    expect(loadAuditLogs).not.toHaveBeenCalled();
  });

  it("blocks roles without audit access with 403", async () => {
    for (const role of ["QC_INSPECTOR", "QA_INSPECTOR", "MASTERDATA_ADMIN", "PM", "PURCHASING"]) {
      getCurrentUser.mockResolvedValue({
        id: "5",
        employeeCode: "TRW0005",
        roles: [role],
        mustChangePassword: false,
      });
      const res = await GET(new Request("http://localhost:3000/api/admin/audit"));
      expect(res.status).toBe(403);
    }
    expect(loadAuditLogs).not.toHaveBeenCalled();
  });

  it("allows ADMIN, QC_HEAD, QA_HEAD, and MANAGEMENT and forwards parsed filters", async () => {
    for (const role of ["ADMIN", "QC_HEAD", "QA_HEAD", "MANAGEMENT"]) {
      getCurrentUser.mockResolvedValue({
        id: "2",
        employeeCode: "TRW0002",
        roles: [role],
        mustChangePassword: false,
      });
      const res = await GET(
        new Request("http://localhost:3000/api/admin/audit?q=TRW1001&group=login&from=2026-11-01&to=2026-11-19&page=2"),
      );
      expect(res.status).toBe(200);
    }
    expect(loadAuditLogs).toHaveBeenLastCalledWith({
      q: "TRW1001",
      group: "login",
      from: "2026-11-01",
      to: "2026-11-19",
      page: 2,
    });
  });

  it("maps SQL Server errors to 503 without exposing raw database messages", async () => {
    const dbErr = Object.assign(new Error("ConnectionError: private-sql-host"), {
      name: "ConnectionError",
      code: "ESOCKET",
    });
    loadAuditLogs.mockRejectedValue(dbErr);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(new Request("http://localhost:3000/api/admin/audit"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.message).not.toContain("private-sql-host");
    log.mockRestore();
  });
});

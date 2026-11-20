import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), dbConfigured: vi.fn(), masterCounts: vi.fn(), poolDb: vi.fn() }));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/config", () => ({ dbConfigured: mocks.dbConfigured }));
vi.mock("@/lib/master/repo", () => ({ poolDb: mocks.poolDb, masterCounts: mocks.masterCounts }));

import { GET } from "@/app/api/master/route";
import { authPolicy } from "@/lib/config/auth";
import { MASTER_NO_DATABASE } from "@/lib/master/counts";
import { MASTERS } from "@/lib/master/registry";

const masterAdmin = { id: "5", employeeCode: "TRW0005", fullName: "ผู้ดูแลข้อมูลหลัก", roles: ["MASTERDATA_ADMIN"], mustChangePassword: false };
const outage = Object.assign(new Error("raw"), { name: "ConnectionError", code: "ECONNREFUSED" });
const get = () => GET(new Request("http://localhost:3000/api/master", { headers: { "sec-fetch-site": "same-origin" } }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue(masterAdmin);
  mocks.dbConfigured.mockReturnValue(true);
  mocks.poolDb.mockReturnValue("db");
  mocks.masterCounts.mockResolvedValue({ total: 12, active: 9 });
});

describe("GET /api/master — access", () => {
  it("answers 401 with the sign-in address for a signed-out browser, touching nothing", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await get();
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ status: "error", redirectTo: "/login?next=%2Fmaster" });
    expect(mocks.masterCounts).not.toHaveBeenCalled();
  });

  it("sends someone who still owes a PIN change to the change-PIN page", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...masterAdmin, mustChangePassword: true });
    const response = await get();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ status: "error", redirectTo: authPolicy.changePasswordPath });
    expect(mocks.masterCounts).not.toHaveBeenCalled();
  });

  it.each(["QC_INSPECTOR", "QA_INSPECTOR", "PURCHASING"])("refuses %s: master data is for the roles that see the page", async (role) => {
    mocks.getCurrentUser.mockResolvedValue({ ...masterAdmin, roles: [role] });
    expect((await get()).status).toBe(403);
    expect(mocks.masterCounts).not.toHaveBeenCalled();
  });

  it.each(["MASTERDATA_ADMIN", "ADMIN", "QC_HEAD", "QA_HEAD", "PM", "MANAGEMENT"])("lets %s read — viewing is wider than editing", async (role) => {
    mocks.getCurrentUser.mockResolvedValue({ ...masterAdmin, roles: [role] });
    expect((await get()).status).toBe(200);
  });
});

describe("GET /api/master — answer", () => {
  it("is the counts themselves, one entry per registry table, and is never cached or shared", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Cookie");
    const body = await response.json();
    expect(Object.keys(body)).toEqual(["counts"]);
    expect(Object.keys(body.counts)).toEqual(MASTERS.map((def) => def.slug));
    expect(body.counts.brands).toEqual({ total: 12, active: 9 });
  });

  it("answers 503 with the no-database sentence in demo mode, touching no database", async () => {
    mocks.dbConfigured.mockReturnValue(false);
    const response = await get();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: "error", message: MASTER_NO_DATABASE });
    expect(mocks.masterCounts).not.toHaveBeenCalled();
  });

  it("answers a database outage as a 503 sentence, and a real bug as a thrown error", async () => {
    mocks.masterCounts.mockRejectedValue(outage);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await get();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toMatchObject({ status: "error" });
    expect(body.message).toContain("เชื่อมต่อฐานข้อมูลไม่ได้");
    expect(JSON.stringify(body)).not.toContain("ECONNREFUSED");
    log.mockRestore();

    mocks.masterCounts.mockRejectedValue(new TypeError("bug"));
    await expect(get()).rejects.toThrow("bug");
  });
});

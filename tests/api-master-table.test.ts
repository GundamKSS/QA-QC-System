import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), loadMasterTable: vi.fn() }));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/master/table", () => ({ loadMasterTable: mocks.loadMasterTable }));

import { GET } from "@/app/api/master/[table]/route";
import { authPolicy } from "@/lib/config/auth";
import { MASTER_NO_DATABASE } from "@/lib/master/counts";
import { masterBySlug } from "@/lib/master/registry";

const masterAdmin = { id: "5", employeeCode: "TRW0005", fullName: "ผู้ดูแลข้อมูลหลัก", roles: ["MASTER_ADMIN"], mustChangePassword: false };
const outage = Object.assign(new Error("raw"), { name: "ConnectionError", code: "ECONNREFUSED" });
const payload = { rows: [{ id: 1 }], total: 1, page: 1, pageSize: 50, editing: null, options: null };
const get = (table = "brands", query = "") =>
  GET(new Request(`http://localhost:3000/api/master/${table}${query}`, { headers: { "sec-fetch-site": "same-origin" } }), { params: Promise.resolve({ table }) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue(masterAdmin);
  mocks.loadMasterTable.mockResolvedValue({ kind: "loaded", payload });
});

describe("GET /api/master/[table] — access", () => {
  it("answers 401 with the sign-in address of that table's page for a signed-out browser, reading nothing", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await get("pump-types");
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ status: "error", redirectTo: "/login?next=%2Fmaster%2Fpump-types" });
    expect(mocks.loadMasterTable).not.toHaveBeenCalled();
  });

  it("answers an unknown table to a signed-out browser with 401 as well, so nobody can probe which tables exist", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await get("nope")).status).toBe(401);
  });

  it("sends someone who still owes a PIN change to the change-PIN page", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...masterAdmin, mustChangePassword: true });
    const response = await get();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ redirectTo: authPolicy.changePasswordPath });
    expect(mocks.loadMasterTable).not.toHaveBeenCalled();
  });

  it.each(["ADMIN", "QC_INSPECTOR", "QA_INSPECTOR", "PURCHASING"])("refuses %s, who may not open the master pages", async (role) => {
    mocks.getCurrentUser.mockResolvedValue({ ...masterAdmin, roles: [role] });
    expect((await get()).status).toBe(403);
    expect(mocks.loadMasterTable).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown table to someone who may read", async () => {
    const response = await get("nope");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ status: "error", message: "ไม่พบประเภทข้อมูลนี้" });
    expect(mocks.loadMasterTable).not.toHaveBeenCalled();
  });

  it.each(["MASTER_ADMIN", "QC_HEAD", "QA_HEAD", "PM", "MANAGEMENT"])("lets %s read", async (role) => {
    mocks.getCurrentUser.mockResolvedValue({ ...masterAdmin, roles: [role] });
    expect((await get()).status).toBe(200);
  });
});

describe("GET /api/master/[table] — answer", () => {
  it("is the payload itself, never cached or shared", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Cookie");
    expect(await response.json()).toEqual(payload);
  });

  it("reads the table of the path with the address parsed by the shared parser", async () => {
    await get("models", "?q=ก&status=inactive&page=2&edit=7&new=1&saved=3");
    expect(mocks.loadMasterTable).toHaveBeenCalledWith(masterBySlug("models"), true, { q: "ก", status: "inactive", page: 2, editId: 7, creating: true, saved: 3 });
  });

  it("falls back to the defaults for a strange address", async () => {
    await get("brands", "?status=zzz&page=-4&edit=abc");
    expect(mocks.loadMasterTable).toHaveBeenCalledWith(masterBySlug("brands"), true, { q: "", status: "all", page: 1, editId: null, creating: false, saved: null });
  });

  it("tells the service that Master Admin may edit and the other roles may not", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...masterAdmin, roles: ["QC_HEAD"] });
    await get();
    expect(mocks.loadMasterTable.mock.calls[0][1]).toBe(false);
  });

  it("answers 503 with the sentence of the page when there is no database (demo mode)", async () => {
    mocks.loadMasterTable.mockResolvedValue({ kind: "no_database" });
    const response = await get();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: "error", message: MASTER_NO_DATABASE });
  });

  it("answers a database outage as a 503 sentence without the raw error", async () => {
    mocks.loadMasterTable.mockRejectedValue(outage);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await get();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.message).toContain("เชื่อมต่อฐานข้อมูลไม่ได้");
    expect(JSON.stringify(body)).not.toContain("raw");
    log.mockRestore();
  });

  it("does not hide a bug behind a 503", async () => {
    mocks.loadMasterTable.mockRejectedValue(new TypeError("bug"));
    await expect(get()).rejects.toThrow("bug");
  });
});

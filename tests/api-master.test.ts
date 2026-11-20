import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  audit: vi.fn(),
  revalidatePath: vi.fn(),
  resolveActorId: vi.fn(),
  getMaster: vi.fn(),
  createMaster: vi.fn(),
  updateMaster: vi.fn(),
  setMasterActive: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/audit", () => ({ audit: mocks.audit, auditContext: () => ({ ip: "10.0.0.5", userAgent: "test" }) }));
vi.mock("@/lib/db/actor", () => ({ resolveActorId: mocks.resolveActorId }));
// Keep the real masterWriteProblem (it classifies SQL Server error numbers); fake only the database calls.
vi.mock("@/lib/master/repo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/master/repo")>()),
  poolDb: () => "db",
  getMaster: mocks.getMaster,
  createMaster: mocks.createMaster,
  updateMaster: mocks.updateMaster,
  setMasterActive: mocks.setMasterActive,
}));

import { POST as create } from "@/app/api/master/[table]/route";
import { PATCH as update } from "@/app/api/master/[table]/[id]/route";
import { POST as toggle } from "@/app/api/master/[table]/[id]/active/route";

type Handler = (request: Request, context: { params: Promise<{ table: string; id: string }> }) => Promise<Response>;

const masterAdmin = { id: "5", employeeCode: "TRW0005", fullName: "ผู้ดูแลข้อมูลหลัก", roles: ["MASTERDATA_ADMIN"], mustChangePassword: false };
const trail = { ip: "10.0.0.5", userAgent: "test" };
const values = { name: "Puma", brand_group: "PUMA" };
const brands = expect.objectContaining({ slug: "brands", table: "brands" });

const call = (handler: Handler, body: unknown = {}, { table = "brands", id = "3", method = "POST", headers = {} }: { table?: string; id?: string; method?: string; headers?: Record<string, string> } = {}) =>
  handler(
    new Request("http://localhost:3000/api/master/brands", {
      method,
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", ...headers },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ table, id }) },
  );

const everyRoute: [string, Handler, string][] = [
  ["create", create, "POST"],
  ["update", update, "PATCH"],
  ["active", toggle, "POST"],
];
const databaseCalls = () => [mocks.getMaster, mocks.createMaster, mocks.updateMaster, mocks.setMasterActive];
const sqlError = (number: number) => Object.assign(new Error("raw sql text"), { name: "RequestError", number });

beforeEach(() => {
  // reset (not just clear): the outage test leaves rejecting implementations behind
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue(masterAdmin);
  mocks.resolveActorId.mockResolvedValue("42");
  mocks.createMaster.mockResolvedValue(11);
  mocks.getMaster.mockResolvedValue({ id: 3, isActive: true, values: { name: "Old", brand_group: "OTHER" } });
});

describe.each(everyRoute)("%s — access rules shared by every master route", (_name, handler, method) => {
  it("answers 401 with the sign-in address of that table for a signed-out browser, touching nothing", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await call(handler, values, { method });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ redirectTo: "/login?next=%2Fmaster%2Fbrands" });
    for (const database of databaseCalls()) expect(database).not.toHaveBeenCalled();
  });

  it("refuses a cross-site request", async () => {
    expect((await call(handler, values, { method, headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
    for (const database of databaseCalls()) expect(database).not.toHaveBeenCalled();
  });

  it.each(["QC_HEAD", "QA_HEAD", "PM"])("refuses %s: they may read master data but only Master Admin or Super Admin edits it", async (role) => {
    mocks.getCurrentUser.mockResolvedValue({ ...masterAdmin, roles: [role] });
    expect((await call(handler, values, { method })).status).toBe(403);
    for (const database of databaseCalls()) expect(database).not.toHaveBeenCalled();
  });

  it("answers 404 for a table that is not in the registry — but only after signing in, so strangers can't probe", async () => {
    const found = await call(handler, values, { table: "no-such-table", method });
    expect(found.status).toBe(404);
    expect(await found.json()).toMatchObject({ status: "error", message: "ไม่พบประเภทข้อมูลนี้" });
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await call(handler, values, { table: "no-such-table", method })).status).toBe(401);
    for (const database of databaseCalls()) expect(database).not.toHaveBeenCalled();
  });

  it("answers a database outage as a 503 sentence with no audit row, and a real bug as a thrown error", async () => {
    const outage = Object.assign(new Error("raw"), { name: "ConnectionError", code: "ECONNREFUSED" });
    for (const database of databaseCalls()) database.mockRejectedValue(outage);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await call(handler, values, { method });
    expect(response.status).toBe(503);
    expect((await response.json()).message).toContain("เชื่อมต่อฐานข้อมูลไม่ได้");
    expect(mocks.audit).not.toHaveBeenCalled();
    log.mockRestore();

    for (const database of databaseCalls()) database.mockRejectedValue(new TypeError("bug"));
    await expect(call(handler, values, { method })).rejects.toThrow("bug");
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});

describe.each(everyRoute.slice(1))("%s — the [id] of the path", (_name, handler, method) => {
  it.each(["abc", "1e3", "-1", "1234567890", ""])("answers 404 for %j without touching the database", async (id) => {
    const response = await call(handler, values, { id, method });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ status: "error", message: "ไม่พบรายการนี้" });
    for (const database of databaseCalls()) expect(database).not.toHaveBeenCalled();
  });
});

describe("POST /api/master/[table] (create)", () => {
  it("adds the row as the signed-in Master Admin, audits it and points the browser at the saved row", async () => {
    const response = await call(create, values);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ status: "done", redirectTo: "/master/brands?saved=11" });
    expect(mocks.createMaster).toHaveBeenCalledWith("db", brands, values, "42");
    expect(mocks.resolveActorId).toHaveBeenCalledWith("5");
    expect(mocks.audit).toHaveBeenCalledWith({ action: "master.create", employeeCode: "TRW0005", userId: "5", entity: { type: "brands", id: "11" }, after: values }, trail);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/master");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/master/brands");
  });

  it("returns field errors and what was typed (422), and writes nothing", async () => {
    const response = await call(create, { name: "", brand_group: "X" });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      status: "error",
      message: "กรุณาแก้ช่องที่มีปัญหา",
      fieldErrors: { name: "กรุณากรอกข้อมูล", brand_group: "เลือกค่าที่กำหนด" },
      values: { name: null, brand_group: "X" },
      at: expect.any(Number),
    });
    expect(mocks.createMaster).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("accepts a plain form post too", async () => {
    const response = await create(
      new Request("http://localhost:3000/api/master/brands", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin" },
        body: new URLSearchParams(values),
      }),
      { params: Promise.resolve({ table: "brands", id: "" }) },
    );
    expect(response.status).toBe(201);
    expect(mocks.createMaster).toHaveBeenCalledWith("db", brands, values, "42");
  });

  it("explains a duplicate (409) and a broken rule (422) in words, keeping what was typed", async () => {
    mocks.createMaster.mockRejectedValueOnce(sqlError(2627));
    const duplicate = await call(create, values);
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({
      status: "error",
      message: "มีรายการนี้อยู่แล้ว — ค่าที่ห้ามซ้ำ (เช่น รหัสหรือชื่อ) ซ้ำกับรายการอื่น",
      values,
      at: expect.any(Number),
    });

    mocks.createMaster.mockRejectedValueOnce(sqlError(547));
    const invalid = await call(create, values);
    expect(invalid.status).toBe(422);
    expect((await invalid.json()).message).toBe("ข้อมูลไม่ผ่านเงื่อนไขของฐานข้อมูล (เช่น ค่าอ้างอิงไม่มีอยู่)");
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/master/[table]/[id] (update)", () => {
  it("changes the row, audits before → after and points the browser at it", async () => {
    const response = await call(update, values, { method: "PATCH" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "done", redirectTo: "/master/brands?saved=3" });
    expect(mocks.getMaster).toHaveBeenCalledWith("db", brands, 3);
    expect(mocks.updateMaster).toHaveBeenCalledWith("db", brands, 3, values, "42");
    expect(mocks.audit).toHaveBeenCalledWith(
      { action: "master.update", employeeCode: "TRW0005", userId: "5", entity: { type: "brands", id: "3" }, before: { name: "Old", brand_group: "OTHER" }, after: values },
      trail,
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/master/brands");
  });

  it("answers 404 with what was typed when the row is gone, and writes nothing", async () => {
    mocks.getMaster.mockResolvedValue(null);
    const response = await call(update, values, { method: "PATCH" });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ status: "error", message: "ไม่พบรายการนี้ (อาจถูกเปลี่ยนไปแล้ว)", values, at: expect.any(Number) });
    expect(mocks.updateMaster).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("returns field errors without reading the row", async () => {
    const response = await call(update, { name: "x".repeat(65), brand_group: "PUMA" }, { method: "PATCH" });
    expect(response.status).toBe(422);
    expect((await response.json()).fieldErrors).toEqual({ name: "ยาวเกิน 64 ตัวอักษร" });
    expect(mocks.getMaster).not.toHaveBeenCalled();
  });

  it("explains a duplicate name", async () => {
    mocks.updateMaster.mockRejectedValue(sqlError(2601));
    expect((await call(update, values, { method: "PATCH" })).status).toBe(409);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});

describe("POST /api/master/[table]/[id]/active", () => {
  it.each([["0", false, "master.disable", true], ["1", true, "master.enable", false]])(
    "active = %j sets %s, audits %s with the old status",
    async (active, nowActive, action, wasActive) => {
      mocks.getMaster.mockResolvedValue({ id: 3, isActive: wasActive, values });
      const response = await call(toggle, { active });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "done" });
      expect(mocks.setMasterActive).toHaveBeenCalledWith("db", brands, 3, nowActive, "42");
      expect(mocks.audit).toHaveBeenCalledWith(
        { action, employeeCode: "TRW0005", userId: "5", entity: { type: "brands", id: "3" }, before: { is_active: wasActive }, after: { is_active: nowActive } },
        trail,
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/master/brands");
    },
  );

  it.each([[true], ["true"], [1]])("treats active = %j as enable", async (active) => {
    await call(toggle, { active });
    expect(mocks.setMasterActive).toHaveBeenCalledWith("db", brands, 3, true, "42");
  });

  it.each([[false], [""], [undefined]])("treats active = %j as disable (safe default)", async (active) => {
    await call(toggle, { active });
    expect(mocks.setMasterActive).toHaveBeenCalledWith("db", brands, 3, false, "42");
  });

  it("answers 404 when the row is gone", async () => {
    mocks.getMaster.mockResolvedValue(null);
    const response = await call(toggle, { active: "0" });
    expect(response.status).toBe(404);
    expect(mocks.setMasterActive).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("explains a row that can't be re-enabled because a unique value is now taken", async () => {
    mocks.setMasterActive.mockRejectedValue(sqlError(2627));
    expect((await call(toggle, { active: "1" })).status).toBe(409);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});

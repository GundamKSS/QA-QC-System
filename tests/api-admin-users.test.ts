import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  pinPepper: vi.fn(),
  audit: vi.fn(),
  revalidatePath: vi.fn(),
  createLocalUser: vi.fn(),
  updateLocalUser: vi.fn(),
  resetLocalPin: vi.fn(),
  unlockLocalPin: vi.fn(),
  setLocalActive: vi.fn(),
  loadLocalUsers: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/local-runtime", () => ({ getLocalStore: () => "store", getPinGuard: () => "guard", pinPepper: mocks.pinPepper }));
vi.mock("@/lib/auth/admin-users", () => ({ loadLocalUsers: mocks.loadLocalUsers }));
vi.mock("@/lib/auth/audit", () => ({ audit: mocks.audit, auditContext: () => ({ ip: "10.0.0.5", userAgent: "test" }) }));
vi.mock("@/lib/auth/local-admin", () => ({
  createLocalUser: mocks.createLocalUser,
  updateLocalUser: mocks.updateLocalUser,
  resetLocalPin: mocks.resetLocalPin,
  unlockLocalPin: mocks.unlockLocalPin,
  setLocalActive: mocks.setLocalActive,
}));

import { GET as list, POST as create } from "@/app/api/admin/users/route";
import { PATCH as update } from "@/app/api/admin/users/[id]/route";
import { POST as resetPin } from "@/app/api/admin/users/[id]/reset-pin/route";
import { POST as unlockPin } from "@/app/api/admin/users/[id]/unlock-pin/route";
import { POST as setActive } from "@/app/api/admin/users/[id]/active/route";

const admin = { id: "1", employeeCode: "TRW0001", fullName: "ผู้ดูแล", roles: ["ADMIN"], mustChangePassword: false };
const actorDeps = { store: "store", guard: "guard", pepper: "pepper", actor: { id: "1", roles: ["ADMIN"] } };
const trail = { ip: "10.0.0.5", userAgent: "test" };

const call = (
  handler: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>,
  body: unknown = {},
  { id = "7", method = "POST", headers = {} }: { id?: string; method?: string; headers?: Record<string, string> } = {},
) =>
  handler(
    new Request("http://localhost:3000/api/admin/users", {
      method,
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", ...headers },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

const everyRoute: [string, (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>, string][] = [
  ["create", create, "POST"],
  ["update", update, "PATCH"],
  ["reset-pin", resetPin, "POST"],
  ["unlock-pin", unlockPin, "POST"],
  ["active", setActive, "POST"],
];
const serviceCalls = () => [mocks.createLocalUser, mocks.updateLocalUser, mocks.resetLocalPin, mocks.unlockLocalPin, mocks.setLocalActive];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(admin);
  mocks.pinPepper.mockReturnValue("pepper");
  mocks.loadLocalUsers.mockResolvedValue({ canManage: true, users: [] });
  mocks.createLocalUser.mockResolvedValue({ ok: true, user: { id: "9", employeeCode: "F0009", roles: ["QC_INSPECTOR"] }, tempPin: "482915" });
  mocks.updateLocalUser.mockResolvedValue({ ok: true, before: ["QC_INSPECTOR"], after: ["QA_INSPECTOR"] });
  mocks.resetLocalPin.mockResolvedValue({ ok: true, employeeCode: "F0007", tempPin: "739216" });
  mocks.unlockLocalPin.mockResolvedValue({ ok: true, employeeCode: "F0007" });
  mocks.setLocalActive.mockResolvedValue({ ok: true, employeeCode: "F0007" });
});

describe("GET /api/admin/users (list)", () => {
  const get = (headers: Record<string, string> = {}) => list(new Request("http://localhost:3000/api/admin/users", { headers }));

  it("answers 401 with the sign-in address for a signed-out browser, reading nothing", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await get();
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ redirectTo: "/login?next=%2Fadmin%2Fusers" });
    expect(mocks.loadLocalUsers).not.toHaveBeenCalled();
  });

  it.each(["QC_INSPECTOR", "QA_INSPECTOR", "PM"])("refuses %s, who may not open the users page", async (role) => {
    mocks.getCurrentUser.mockResolvedValue({ ...admin, roles: [role] });
    expect((await get()).status).toBe(403);
    expect(mocks.loadLocalUsers).not.toHaveBeenCalled();
  });

  it("refuses a user who still has to change their password", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...admin, mustChangePassword: true });
    expect((await get()).status).toBe(403);
    expect(mocks.loadLocalUsers).not.toHaveBeenCalled();
  });

  it.each(["ADMIN", "QC_HEAD"])("answers the payload as sent by the service for %s, with the actor's roles", async (role) => {
    const payload = { canManage: role === "ADMIN", users: [{ id: "7", employeeCode: "F0007" }] };
    mocks.getCurrentUser.mockResolvedValue({ ...admin, roles: [role] });
    mocks.loadLocalUsers.mockResolvedValue(payload);
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(payload);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.loadLocalUsers).toHaveBeenCalledWith("store", [role], undefined);
  });

  it("needs no PIN pepper (it only reads) and writes no audit row or cache refresh", async () => {
    mocks.pinPepper.mockReturnValue(null);
    expect((await get()).status).toBe(200);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("answers a database outage as a 503 sentence", async () => {
    mocks.loadLocalUsers.mockRejectedValue(Object.assign(new Error("raw"), { name: "ConnectionError", code: "ECONNREFUSED" }));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await get();
    expect(response.status).toBe(503);
    expect((await response.json()).message).toContain("เชื่อมต่อฐานข้อมูลไม่ได้");
    log.mockRestore();
  });

  it("does not hide a bug behind a 503", async () => {
    mocks.loadLocalUsers.mockRejectedValue(new TypeError("bug"));
    await expect(get()).rejects.toThrow("bug");
  });
});

describe.each(everyRoute)("%s — access rules shared by every user-admin route", (_name, handler, method) => {
  it("answers 401 with the sign-in address for a signed-out browser, touching nothing", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await call(handler, {}, { method });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ redirectTo: "/login?next=%2Fadmin%2Fusers" });
    for (const service of serviceCalls()) expect(service).not.toHaveBeenCalled();
  });

  it("refuses a cross-site request", async () => {
    const response = await call(handler, {}, { method, headers: { "sec-fetch-site": "cross-site" } });
    expect(response.status).toBe(403);
    for (const service of serviceCalls()) expect(service).not.toHaveBeenCalled();
  });

  it("refuses roles that may not open the users page", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...admin, roles: ["QC_INSPECTOR"] });
    expect((await call(handler, {}, { method })).status).toBe(403);
    for (const service of serviceCalls()) expect(service).not.toHaveBeenCalled();
  });

  it("says so when the server has no PIN pepper", async () => {
    mocks.pinPepper.mockReturnValue(null);
    const response = await call(handler, {}, { method });
    expect(response.status).toBe(503);
    expect((await response.json()).message).toContain("PIN_PEPPER");
    for (const service of serviceCalls()) expect(service).not.toHaveBeenCalled();
  });

  it("answers a database outage as a 503 sentence, with no audit row", async () => {
    const outage = Object.assign(new Error("raw"), { name: "ConnectionError", code: "ECONNREFUSED" });
    for (const service of serviceCalls()) service.mockRejectedValue(outage);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await call(handler, {}, { method });
    expect(response.status).toBe(503);
    expect((await response.json()).message).toContain("เชื่อมต่อฐานข้อมูลไม่ได้");
    expect(mocks.audit).not.toHaveBeenCalled();
    log.mockRestore();
  });
});

describe.each(everyRoute.slice(1))("%s — the [id] of the path", (_name, handler, method) => {
  it.each(["bad id!", "a.b", "x".repeat(41)])("answers 404 for %j without calling the store", async (id) => {
    expect((await call(handler, {}, { id, method })).status).toBe(404);
    for (const service of serviceCalls()) expect(service).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/users (create)", () => {
  const form = { fullName: "สมชาย ใจดี", nickname: "ชาย", email: "s@example.com", department: "QC", roles: ["QC_INSPECTOR", "QA_INSPECTOR"] };

  it("creates the user, shows the temporary PIN once, audits without it, and refreshes the list", async () => {
    const response = await call(create, form);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      status: "done",
      message: "สร้างผู้ใช้ F0009 แล้ว — จด PIN ชั่วคราวส่งให้เจ้าตัว (แสดงครั้งเดียว)",
      tempPin: "482915",
      employeeCode: "F0009",
    });
    expect(mocks.createLocalUser).toHaveBeenCalledWith(actorDeps, form);
    expect(mocks.audit).toHaveBeenCalledWith(
      { action: "user.create", employeeCode: "TRW0001", userId: "1", target: { id: "9", employeeCode: "F0009" }, detail: { roles: ["QC_INSPECTOR"] } },
      trail,
    );
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("482915");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/users");
  });

  it("reads roles from a plain form post with repeated checkboxes too", async () => {
    const body = new URLSearchParams([["fullName", "สมชาย"], ["roles", "QC_INSPECTOR"], ["roles", "QA_INSPECTOR"]]);
    const response = await create(
      new Request("http://localhost:3000/api/admin/users", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin" }, body }),
    );
    expect(response.status).toBe(201);
    expect(mocks.createLocalUser).toHaveBeenCalledWith(actorDeps, { fullName: "สมชาย", nickname: "", email: "", department: "", roles: ["QC_INSPECTOR", "QA_INSPECTOR"] });
  });

  it.each([
    [{ ok: false, error: "name_required" }, 422, "กรุณากรอกชื่อ-นามสกุล"],
    [{ ok: false, error: "email_invalid" }, 422, "รูปแบบอีเมลไม่ถูกต้อง"],
    [{ ok: false, error: "roles_required" }, 422, "เลือกบทบาทอย่างน้อย 1 บทบาท"],
    [{ ok: false, error: "roles_rejected", rejected: ["ADMIN", "PM"] }, 422, "ผู้ใช้หน้างานเลือกได้เฉพาะ QC Inspector และ QA Inspector (ADMIN, PM)"],
    [{ ok: false, error: "forbidden" }, 403, "คุณไม่มีสิทธิ์ทำรายการนี้"],
  ])("maps %j to HTTP %i with the Thai message and no audit row", async (outcome, status, message) => {
    mocks.createLocalUser.mockResolvedValue(outcome);
    const response = await call(create, form);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ status: "error", message });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/users/[id] (update)", () => {
  it("saves the profile and roles of the user in the path and audits before → after", async () => {
    const body = { fullName: "สมชาย", nickname: "", email: "", department: "QA", roles: ["QA_INSPECTOR"], code: "F0007" };
    const response = await call(update, body, { method: "PATCH" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "done", message: "บันทึกแล้ว" });
    expect(mocks.updateLocalUser).toHaveBeenCalledWith(actorDeps, "7", { fullName: "สมชาย", nickname: "", email: "", department: "QA", roles: ["QA_INSPECTOR"] });
    expect(mocks.audit).toHaveBeenCalledWith(
      { action: "user.roles_change", employeeCode: "TRW0001", userId: "1", target: { id: "7", employeeCode: "F0007" }, detail: { before: ["QC_INSPECTOR"], after: ["QA_INSPECTOR"] } },
      trail,
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/users");
  });

  it("answers 404 when the user no longer exists", async () => {
    mocks.updateLocalUser.mockResolvedValue({ ok: false, error: "not_found" });
    const response = await call(update, {}, { method: "PATCH" });
    expect(response.status).toBe(404);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/users/[id]/reset-pin", () => {
  it("issues a temporary PIN once, audits without it", async () => {
    const response = await call(resetPin);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "done",
      message: "ออก PIN ชั่วคราวใหม่ให้ F0007 แล้ว (แสดงครั้งเดียว) — เจ้าตัวต้องเปลี่ยนเมื่อเข้าครั้งแรก",
      tempPin: "739216",
      employeeCode: "F0007",
    });
    expect(mocks.resetLocalPin).toHaveBeenCalledWith(actorDeps, "7");
    expect(mocks.audit).toHaveBeenCalledWith({ action: "user.pin_reset", employeeCode: "TRW0001", userId: "1", target: { id: "7", employeeCode: "F0007" } }, trail);
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("739216");
  });

  it("answers 403 for someone who may not manage users (a QC Head)", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...admin, id: "2", roles: ["QC_HEAD"] });
    mocks.resetLocalPin.mockResolvedValue({ ok: false, error: "forbidden" });
    expect((await call(resetPin)).status).toBe(403);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/users/[id]/unlock-pin", () => {
  it("lets a QC Head through to the rule that decides whose PIN they may unlock", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...admin, id: "2", employeeCode: "TRW0002", roles: ["QC_HEAD"] });
    const response = await call(unlockPin);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "done", message: "ปลดล็อก PIN ของ F0007 แล้ว" });
    expect(mocks.unlockLocalPin).toHaveBeenCalledWith({ ...actorDeps, actor: { id: "2", roles: ["QC_HEAD"] } }, "7");
    expect(mocks.audit).toHaveBeenCalledWith({ action: "user.pin_unlock", employeeCode: "TRW0002", userId: "2", target: { id: "7", employeeCode: "F0007" } }, trail);
  });

  it("answers 403 when a QC Head targets someone who is not a QC inspector", async () => {
    mocks.unlockLocalPin.mockResolvedValue({ ok: false, error: "forbidden" });
    expect((await call(unlockPin)).status).toBe(403);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/users/[id]/active", () => {
  it.each([["1"], ["true"], [true], [1]])("activates for active = %j", async (active) => {
    const response = await call(setActive, { active });
    expect(await response.json()).toEqual({ status: "done", message: "เปิดใช้งาน F0007 แล้ว" });
    expect(mocks.setLocalActive).toHaveBeenCalledWith(actorDeps, "7", true);
    expect(mocks.audit).toHaveBeenCalledWith({ action: "user.activate", employeeCode: "TRW0001", userId: "1", target: { id: "7", employeeCode: "F0007" } }, trail);
  });

  it.each([["0"], ["false"], [false], [""], [undefined]])("deactivates for active = %j (safe default)", async (active) => {
    const response = await call(setActive, { active });
    expect(await response.json()).toEqual({ status: "done", message: "ปิดการใช้งาน F0007 แล้ว — เข้าระบบไม่ได้ทันที" });
    expect(mocks.setLocalActive).toHaveBeenCalledWith(actorDeps, "7", false);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "user.deactivate" }), trail);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/users");
  });
});

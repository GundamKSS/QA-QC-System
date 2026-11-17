import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  changeOwnPin: vi.fn(),
  pinPepper: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/local-admin", () => ({ changeOwnPin: mocks.changeOwnPin }));
vi.mock("@/lib/auth/local-runtime", () => ({ getLocalStore: () => "store", getPinGuard: () => "guard", pinPepper: mocks.pinPepper }));
vi.mock("@/lib/auth/audit", () => ({ audit: mocks.audit, auditContext: () => ({ ip: "10.0.0.5", userAgent: "test" }) }));

import { POST } from "@/app/api/auth/change-pin/route";

const field = { id: "11", employeeCode: "F0001", fullName: "สมชาย", roles: ["QC_INSPECTOR"], mustChangePassword: true, source: "LOCAL" };
const send = (body: unknown = { current: "482915", next: "739216", confirm: "739216" }, headers: Record<string, string> = {}) =>
  new Request("http://localhost:3000/api/auth/change-pin", {
    method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", ...headers },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(field);
  mocks.pinPepper.mockReturnValue("pepper");
  mocks.changeOwnPin.mockResolvedValue({ ok: true });
});

describe("POST /api/auth/change-pin", () => {
  it("changes the PIN of the signed-in field user, audits it and sends them home", async () => {
    const response = await POST(send());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "done", redirectTo: "/home" });
    expect(mocks.changeOwnPin).toHaveBeenCalledWith(
      { store: "store", guard: "guard", pepper: "pepper", userId: "11" },
      { current: "482915", next: "739216", confirm: "739216" },
    );
    expect(mocks.audit).toHaveBeenCalledWith({ action: "user.pin_change", employeeCode: "F0001", userId: "11" }, { ip: "10.0.0.5", userAgent: "test" });
  });

  it("works for a user who still owes the change (that is its whole point)", async () => {
    expect((await POST(send())).status).toBe(200);
  });

  it("refuses a cross-site request without touching the PIN", async () => {
    const response = await POST(send(undefined, { "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(mocks.changeOwnPin).not.toHaveBeenCalled();
  });

  it("answers 401 with the sign-in address for a signed-out browser", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await POST(send());
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ redirectTo: "/login?next=%2Fchange-password" });
    expect(mocks.changeOwnPin).not.toHaveBeenCalled();
  });

  it("refuses central users: their password lives in the central system", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...field, source: undefined });
    const response = await POST(send());
    expect(response.status).toBe(403);
    expect(mocks.changeOwnPin).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("says so when the server has no PIN pepper configured", async () => {
    mocks.pinPepper.mockReturnValue(null);
    expect((await POST(send())).status).toBe(503);
    expect(mocks.changeOwnPin).not.toHaveBeenCalled();
  });

  it.each([
    ["pin_wrong", 403, "PIN ปัจจุบันไม่ถูกต้อง"],
    ["pin_mismatch", 422, "PIN ใหม่ทั้งสองช่องไม่ตรงกัน"],
    ["pin_same", 422, "PIN ใหม่ต้องไม่เหมือน PIN เดิม"],
    ["pin_format", 422, "PIN ต้องเป็นตัวเลข 6 หลัก ไม่ซ้ำกันทั้งหมด และไม่เรียงต่อกัน (เช่น 111111, 123456)"],
    ["pin_locked", 423, "PIN ถูกล็อก ติดต่อ Admin หรือหัวหน้า QC เพื่อปลดล็อก"],
    ["not_found", 404, "ไม่พบผู้ใช้นี้"],
  ])("maps %s to HTTP %i with the Thai message and no audit row", async (error, status, message) => {
    mocks.changeOwnPin.mockResolvedValue({ ok: false, error });
    const response = await POST(send());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ status: "error", message });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("treats a missing body as empty fields and lets the rules reject it", async () => {
    mocks.changeOwnPin.mockResolvedValue({ ok: false, error: "pin_format" });
    const response = await POST(new Request("http://localhost:3000/api/auth/change-pin", { method: "POST", headers: { "sec-fetch-site": "same-origin" } }));
    expect(response.status).toBe(422);
    expect(mocks.changeOwnPin).toHaveBeenCalledWith(expect.anything(), { current: "", next: "", confirm: "" });
  });

  it("answers a database outage as a 503 sentence, not a crash", async () => {
    mocks.changeOwnPin.mockRejectedValue(Object.assign(new Error("raw"), { name: "ConnectionError", code: "ECONNREFUSED" }));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await POST(send());
    expect(response.status).toBe(503);
    expect((await response.json()).message).toContain("เชื่อมต่อฐานข้อมูลไม่ได้");
    expect(mocks.audit).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("lets a real bug surface as an error instead of a fake success", async () => {
    mocks.changeOwnPin.mockRejectedValue(new TypeError("bug"));
    await expect(POST(send())).rejects.toThrow("bug");
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});

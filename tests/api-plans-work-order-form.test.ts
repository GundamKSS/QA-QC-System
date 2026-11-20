import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), loadWorkOrderForm: vi.fn() }));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/plans/work-order-form", () => ({ loadWorkOrderForm: mocks.loadWorkOrderForm }));

import { GET } from "@/app/api/plans/[id]/work-orders/route";
import { apiMessages } from "@/lib/api/messages";
import { authPolicy } from "@/lib/config/auth";
import { PLAN_NOT_FOUND } from "@/lib/plans/api";

const head = { id: "11", employeeCode: "TRW0011", fullName: "หัวหน้า QC", roles: ["QC_HEAD"], mustChangePassword: false };
const payload = { plan: { id: 5 }, blocked: null, nextSeq: 1, takenDates: [], inspectors: [], today: "2026-10-21" };
const outage = Object.assign(new Error("raw"), { name: "ConnectionError", code: "ECONNREFUSED" });
const get = (id = "5") => GET(new Request(`http://localhost:3000/api/plans/${id}/work-orders`, { headers: { "sec-fetch-site": "same-origin" } }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue(head);
  mocks.loadWorkOrderForm.mockResolvedValue({ kind: "loaded", payload });
});

describe("GET /api/plans/[id]/work-orders — access", () => {
  it("answers 401 with the sign-in address of that plan's page for a signed-out browser, reading nothing", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await get();
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ status: "error", message: apiMessages.signedOut, redirectTo: "/login?next=%2Fplans%2F5%2Fwork-orders%2Fnew" });
    expect(mocks.loadWorkOrderForm).not.toHaveBeenCalled();
  });

  it("answers an id that can't be a plan to a signed-out browser with 401 too, so nobody can probe", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await get("abc")).status).toBe(401);
  });

  it("sends someone who still owes a PIN change to the change-PIN page", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...head, mustChangePassword: true });
    const response = await get();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ redirectTo: authPolicy.changePasswordPath });
    expect(mocks.loadWorkOrderForm).not.toHaveBeenCalled();
  });

  it.each(["QA_HEAD", "QC_INSPECTOR", "QA_INSPECTOR", "PURCHASING", "PM", "MANAGEMENT", "MASTERDATA_ADMIN"])("refuses %s, who may not open work orders", async (role) => {
    mocks.getCurrentUser.mockResolvedValue({ ...head, roles: [role] });
    expect((await get()).status).toBe(403);
    expect(mocks.loadWorkOrderForm).not.toHaveBeenCalled();
  });

  it.each(["QC_HEAD", "ADMIN"])("lets %s read", async (role) => {
    mocks.getCurrentUser.mockResolvedValue({ ...head, roles: [role] });
    expect((await get()).status).toBe(200);
  });
});

describe("GET /api/plans/[id]/work-orders — answer", () => {
  it("is the payload itself, never cached or shared, for the plan of the path", async () => {
    const response = await get("5");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Cookie");
    expect(await response.json()).toEqual(payload);
    expect(mocks.loadWorkOrderForm).toHaveBeenCalledWith(5);
  });

  it.each(["abc", "1.5", "-2", "1234567890123"])("answers 404 for the id %j without reading", async (id) => {
    const response = await get(id);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ status: "error", message: PLAN_NOT_FOUND });
    expect(mocks.loadWorkOrderForm).not.toHaveBeenCalled();
  });

  it("answers 404 for a plan that doesn't exist", async () => {
    mocks.loadWorkOrderForm.mockResolvedValue({ kind: "not_found" });
    const response = await get("999");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ message: PLAN_NOT_FOUND });
  });

  it("answers a database outage as a 503 sentence without the raw error", async () => {
    mocks.loadWorkOrderForm.mockRejectedValue(outage);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await get();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.message).toContain("เชื่อมต่อฐานข้อมูลไม่ได้");
    expect(JSON.stringify(body)).not.toContain("raw");
    log.mockRestore();
  });

  it("does not hide a bug behind a 503", async () => {
    mocks.loadWorkOrderForm.mockRejectedValue(new TypeError("bug"));
    await expect(get()).rejects.toThrow("bug");
  });
});

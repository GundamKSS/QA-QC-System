import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), loadOpenPlanData: vi.fn() }));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/plans/open-data", () => ({ loadOpenPlanData: mocks.loadOpenPlanData }));

import { GET } from "@/app/api/plans/options/route";
import { apiMessages } from "@/lib/api/messages";
import { authPolicy } from "@/lib/config/auth";

const head = { id: "11", employeeCode: "TRW0011", fullName: "หัวหน้า QC", roles: ["QC_HEAD"], mustChangePassword: false };
const payload = { options: { vendors: [], models: [] }, settings: { qcPercent: 10, deadlineDays: 90 }, today: "2026-10-22", opened: null };
const outage = Object.assign(new Error("raw"), { name: "ConnectionError", code: "ECONNREFUSED" });
const get = (query = "") => GET(new Request(`http://localhost:3000/api/plans/options${query}`, { headers: { "sec-fetch-site": "same-origin" } }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue(head);
  mocks.loadOpenPlanData.mockResolvedValue(payload);
});

describe("GET /api/plans/options — access", () => {
  it("answers 401 with the sign-in address of the open-plan page, reading nothing", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await get();
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ status: "error", message: apiMessages.signedOut, redirectTo: "/login?next=%2Fplans%2Fnew" });
    expect(mocks.loadOpenPlanData).not.toHaveBeenCalled();
  });

  it("sends someone who still owes a PIN change to the change-PIN page", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...head, mustChangePassword: true });
    const response = await get();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ redirectTo: authPolicy.changePasswordPath });
    expect(mocks.loadOpenPlanData).not.toHaveBeenCalled();
  });

  it.each(["QA_HEAD", "QC_INSPECTOR", "QA_INSPECTOR", "PURCHASING", "PM", "MANAGEMENT", "MASTERDATA_ADMIN"])("refuses %s, who may not open plans", async (role) => {
    mocks.getCurrentUser.mockResolvedValue({ ...head, roles: [role] });
    expect((await get()).status).toBe(403);
    expect(mocks.loadOpenPlanData).not.toHaveBeenCalled();
  });

  it.each(["QC_HEAD", "ADMIN"])("lets %s read", async (role) => {
    mocks.getCurrentUser.mockResolvedValue({ ...head, roles: [role] });
    expect((await get()).status).toBe(200);
  });
});

describe("GET /api/plans/options — answer", () => {
  it("is the payload itself, never cached or shared", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Cookie");
    expect(await response.json()).toEqual(payload);
  });

  it("asks for the plan of ?opened=, and for none without it", async () => {
    await get("?opened=42");
    expect(mocks.loadOpenPlanData).toHaveBeenLastCalledWith(42);
    await get();
    expect(mocks.loadOpenPlanData).toHaveBeenLastCalledWith(null);
    await get("?opened=abc");
    expect(mocks.loadOpenPlanData).toHaveBeenLastCalledWith(null);
  });

  it("answers a database outage as a 503 sentence without the raw error", async () => {
    mocks.loadOpenPlanData.mockRejectedValue(outage);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await get();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.message).toContain("เชื่อมต่อฐานข้อมูลไม่ได้");
    expect(JSON.stringify(body)).not.toContain("raw");
    log.mockRestore();
  });

  it("does not hide a bug behind a 503", async () => {
    mocks.loadOpenPlanData.mockRejectedValue(new TypeError("bug"));
    await expect(get()).rejects.toThrow("bug");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), planSummary: vi.fn(), listPlans: vi.fn() }));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/plans/runtime", () => ({ getPlanStore: () => ({ planSummary: mocks.planSummary, listPlans: mocks.listPlans }) }));

import { GET } from "@/app/api/home/route";
import { apiMessages } from "@/lib/api/messages";
import { authPolicy } from "@/lib/config/auth";
import { HOME_RECENT_LIMIT } from "@/lib/plans/home-query";

const qcHead = { id: "11", employeeCode: "TRW0011", fullName: "หัวหน้า QC", roles: ["QC_HEAD"], mustChangePassword: false };
const summary = { live: 3, notStarted: 2, completed: 1, waitingGoods: 1, qcDone: 4, qcRequired: 30, deadlineSoon: 1, overdue: 0 };
const outage = Object.assign(new Error("raw"), { name: "ConnectionError", code: "ECONNREFUSED" });
const get = (query = "") => GET(new Request(`http://localhost:3000/api/home${query}`, { headers: { "sec-fetch-site": "same-origin" } }));
const touchedStore = () => mocks.planSummary.mock.calls.length + mocks.listPlans.mock.calls.length;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue(qcHead);
  mocks.planSummary.mockResolvedValue(summary);
  mocks.listPlans.mockResolvedValue({ rows: [], total: 0 });
});

describe("GET /api/home — access", () => {
  it("answers 401 with the sign-in address for a signed-out browser, touching nothing", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await get();
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ status: "error", redirectTo: "/login?next=%2Fhome" });
    expect(touchedStore()).toBe(0);
  });

  it("sends someone who still owes a PIN change to the change-PIN page", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...qcHead, mustChangePassword: true });
    const response = await get();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ status: "error", redirectTo: authPolicy.changePasswordPath });
    expect(touchedStore()).toBe(0);
  });

  it.each(["QC_INSPECTOR", "QA_INSPECTOR", "MASTER_ADMIN"])("refuses %s: the page shows them a note instead of plan numbers", async (role) => {
    mocks.getCurrentUser.mockResolvedValue({ ...qcHead, roles: [role] });
    const response = await get();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ status: "error", message: apiMessages.forbidden });
    expect(touchedStore()).toBe(0);
  });

  it.each(["QC_HEAD", "QA_HEAD", "ADMIN"])("gives %s the totals and the plan rows", async (role) => {
    mocks.getCurrentUser.mockResolvedValue({ ...qcHead, roles: [role] });
    const response = await get();
    expect(response.status).toBe(200);
    expect((await response.json()).recent).toEqual({ rows: [], total: 0 });
  });

  it.each(["PURCHASING", "PM", "MANAGEMENT"])("gives %s the totals only, and reads no plan row", async (role) => {
    mocks.getCurrentUser.mockResolvedValue({ ...qcHead, roles: [role] });
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ summary, recent: null, deadlines: null });
    expect(mocks.listPlans).not.toHaveBeenCalled();
  });
});

describe("GET /api/home — answer", () => {
  it("is the data itself (no status wrapper) and is never cached or shared", async () => {
    const response = await get();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Cookie");
    const body = await response.json();
    expect(body).toMatchObject({ summary, recent: { rows: [], total: 0 }, deadlines: [] });
    expect(body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body).not.toHaveProperty("status");
  });

  it("searches the recent plans with ?q=", async () => {
    await get("?q=%20XM2525%20");
    expect(mocks.listPlans).toHaveBeenCalledWith({ q: "XM2525", sort: "opened", page: 1, pageSize: HOME_RECENT_LIMIT });
  });

  it("answers a database outage as a 503 sentence, and a real bug as a thrown error", async () => {
    mocks.planSummary.mockRejectedValue(outage);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await get();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toMatchObject({ status: "error" });
    expect(body.message).toContain("เชื่อมต่อฐานข้อมูลไม่ได้");
    expect(JSON.stringify(body)).not.toContain("ECONNREFUSED");
    log.mockRestore();

    mocks.planSummary.mockRejectedValue(new TypeError("bug"));
    await expect(get()).rejects.toThrow("bug");
  });
});

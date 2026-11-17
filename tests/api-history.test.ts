import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), resolveActorId: vi.fn(), jobHistory: vi.fn() }));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/actor", () => ({ resolveActorId: mocks.resolveActorId }));
vi.mock("@/lib/db/config", () => ({ dbConfigured: () => true }));
vi.mock("@/lib/plans/runtime", () => ({ getPlanStore: () => ({ jobHistory: mocks.jobHistory }) }));

import { GET } from "@/app/api/history/route";
import { authPolicy } from "@/lib/config/auth";
import { HISTORY_PAGE_SIZE } from "@/lib/plans/history-query";

const qcHead = { id: "11", employeeCode: "TRW0011", fullName: "หัวหน้า QC", roles: ["QC_HEAD"], mustChangePassword: false };
const outage = Object.assign(new Error("raw"), { name: "ConnectionError", code: "ECONNREFUSED" });
const get = (query = "") => GET(new Request(`http://localhost:3000/api/history${query}`, { headers: { "sec-fetch-site": "same-origin" } }));
const touchedStore = () => mocks.resolveActorId.mock.calls.length + mocks.jobHistory.mock.calls.length;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue(qcHead);
  mocks.resolveActorId.mockResolvedValue("77");
  mocks.jobHistory.mockResolvedValue({ rows: [], total: 0 });
});

describe("GET /api/history — access", () => {
  it("answers 401 with the sign-in address for a signed-out browser, touching nothing", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await get();
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ status: "error", redirectTo: "/login?next=%2Fhistory" });
    expect(touchedStore()).toBe(0);
  });

  it("sends someone who still owes a PIN change to the change-PIN page", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...qcHead, mustChangePassword: true });
    const response = await get();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ status: "error", redirectTo: authPolicy.changePasswordPath });
    expect(touchedStore()).toBe(0);
  });

  it.each(["ADMIN", "PM", "MASTER_ADMIN", "PURCHASING", "MANAGEMENT"])("refuses %s: history belongs to the QC and QA roles", async (role) => {
    mocks.getCurrentUser.mockResolvedValue({ ...qcHead, roles: [role] });
    expect((await get()).status).toBe(403);
    expect(touchedStore()).toBe(0);
  });

  it.each(["QC_HEAD", "QC_INSPECTOR", "QA_HEAD", "QA_INSPECTOR"])("lets %s read", async (role) => {
    mocks.getCurrentUser.mockResolvedValue({ ...qcHead, roles: [role] });
    expect((await get()).status).toBe(200);
  });
});

describe("GET /api/history — answer", () => {
  it("is the data itself (no status wrapper) and is never cached or shared", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Cookie");
    expect(await response.json()).toEqual({ view: "all", me: null, page: 1, total: 0, rows: [] });
  });

  it("reads the filter from the address like the page does", async () => {
    const response = await get("?kind=cancelled&range=all&view=mine&page=3");
    expect(await response.json()).toMatchObject({ view: "mine", me: "77", page: 3 });
    expect(mocks.jobHistory).toHaveBeenCalledWith({ kind: "cancelled", fromDate: null, page: 3, pageSize: HISTORY_PAGE_SIZE, userId: "77" });
  });

  it("gives a QC Inspector their own history even when the address asks for more", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...qcHead, roles: ["QC_INSPECTOR"] });
    const response = await get("?kind=done&range=all");
    expect((await response.json()).view).toBe("mine");
    expect(mocks.jobHistory).toHaveBeenCalledWith(expect.objectContaining({ kind: "done", fromDate: null, userId: "77" }));
  });

  it("falls back to the defaults for values it does not know", async () => {
    await get("?kind=toString&range=x&page=-4&view=everyone");
    expect(mocks.jobHistory).toHaveBeenCalledWith(expect.objectContaining({ kind: "all", page: 1, pageSize: HISTORY_PAGE_SIZE, userId: null }));
  });

  it("answers a database outage as a 503 sentence, and a real bug as a thrown error", async () => {
    mocks.jobHistory.mockRejectedValue(outage);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await get();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toMatchObject({ status: "error" });
    expect(body.message).toContain("เชื่อมต่อฐานข้อมูลไม่ได้");
    expect(JSON.stringify(body)).not.toContain("ECONNREFUSED");
    log.mockRestore();

    mocks.jobHistory.mockRejectedValue(new TypeError("bug"));
    await expect(get()).rejects.toThrow("bug");
  });
});

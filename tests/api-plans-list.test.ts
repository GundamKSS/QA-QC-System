import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), listPlans: vi.fn(), planFilterOptions: vi.fn() }));
// The route file also holds the open-plan POST; fake what its imports reach so loading it touches nothing.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/audit", () => ({ audit: vi.fn(), auditContext: () => ({ ip: "10.0.0.5", userAgent: "test" }) }));
vi.mock("@/lib/db/actor", () => ({ resolveActorId: vi.fn() }));
vi.mock("@/lib/db/config", () => ({ dbConfigured: () => true }));
vi.mock("@/lib/plans/runtime", () => ({ getPlanStore: () => ({ listPlans: mocks.listPlans, planFilterOptions: mocks.planFilterOptions }) }));

import { GET } from "@/app/api/plans/route";
import { authPolicy } from "@/lib/config/auth";
import { PLAN_PAGE_SIZE } from "@/lib/plans/list-query";

const qcHead = { id: "11", employeeCode: "TRW0011", fullName: "หัวหน้า QC", roles: ["QC_HEAD"], mustChangePassword: false };
const outage = Object.assign(new Error("raw"), { name: "ConnectionError", code: "ECONNREFUSED" });
const options = { vendors: [{ id: 1, name: "ACME" }], pumpTypes: [{ value: "Rotary", label: "Rotary" }] };
const get = (query = "") => GET(new Request(`http://localhost:3000/api/plans${query}`, { headers: { "sec-fetch-site": "same-origin" } }));
const touchedStore = () => mocks.listPlans.mock.calls.length + mocks.planFilterOptions.mock.calls.length;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue(qcHead);
  mocks.listPlans.mockResolvedValue({ rows: [], total: 0 });
  mocks.planFilterOptions.mockResolvedValue(options);
});

describe("GET /api/plans — access", () => {
  it("answers 401 with the sign-in address for a signed-out browser, touching nothing", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await get();
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ status: "error", redirectTo: "/login?next=%2Fplans" });
    expect(touchedStore()).toBe(0);
  });

  it("sends someone who still owes a PIN change to the change-PIN page", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...qcHead, mustChangePassword: true });
    const response = await get();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ status: "error", redirectTo: authPolicy.changePasswordPath });
    expect(touchedStore()).toBe(0);
  });

  it.each(["QC_INSPECTOR", "QA_INSPECTOR", "PM", "MASTERDATA_ADMIN", "PURCHASING", "MANAGEMENT"])("refuses %s: only QC Head, QA Head and Admin work with plans", async (role) => {
    mocks.getCurrentUser.mockResolvedValue({ ...qcHead, roles: [role] });
    expect((await get()).status).toBe(403);
    expect(touchedStore()).toBe(0);
  });

  it.each(["QC_HEAD", "QA_HEAD", "ADMIN"])("lets %s read", async (role) => {
    mocks.getCurrentUser.mockResolvedValue({ ...qcHead, roles: [role] });
    expect((await get()).status).toBe(200);
  });
});

describe("GET /api/plans — answer", () => {
  it("is the data itself (no status wrapper) and is never cached or shared", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Cookie");
    const body = await response.json();
    expect(body).toMatchObject({ rows: [], total: 0, page: 1, options });
    expect(body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body).not.toHaveProperty("status");
  });

  it("reads every filter from the address like the page does", async () => {
    const response = await get("?q=XM&status=NOT_INSPECTED&vendor=none&ptype=Rotary&from=2026-10-01&to=2026-10-31&sort=deadline&page=3");
    expect((await response.json()).page).toBe(3);
    expect(mocks.listPlans).toHaveBeenCalledWith({
      q: "XM",
      statuses: ["OPEN", "ASSIGNED"],
      vendorId: "none",
      pumpType: "Rotary",
      from: "2026-10-01",
      to: "2026-10-31",
      sort: "deadline",
      page: 3,
      pageSize: PLAN_PAGE_SIZE,
    });
  });

  it("falls back to no filter for values it does not know", async () => {
    await get("?status=toString&vendor=1%3B%20DROP&from=2026-02-30&sort=evil&page=-3");
    expect(mocks.listPlans).toHaveBeenCalledWith({ q: "", statuses: null, vendorId: null, pumpType: null, from: null, to: null, sort: "opened", page: 1, pageSize: PLAN_PAGE_SIZE });
  });

  it("answers a database outage as a 503 sentence, and a real bug as a thrown error", async () => {
    mocks.listPlans.mockRejectedValue(outage);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await get();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toMatchObject({ status: "error" });
    expect(body.message).toContain("เชื่อมต่อฐานข้อมูลไม่ได้");
    expect(JSON.stringify(body)).not.toContain("ECONNREFUSED");
    log.mockRestore();

    mocks.listPlans.mockRejectedValue(new TypeError("bug"));
    await expect(get()).rejects.toThrow("bug");
  });
});

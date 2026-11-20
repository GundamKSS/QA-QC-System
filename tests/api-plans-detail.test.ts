import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), loadPlanDetail: vi.fn(), loadWorkOrderList: vi.fn() }));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/plans/detail", () => ({ loadPlanDetail: mocks.loadPlanDetail }));
vi.mock("@/lib/plans/work-order-list", () => ({ loadWorkOrderList: mocks.loadWorkOrderList }));

import { GET as detail } from "@/app/api/plans/[id]/route";
import { GET as workOrderList } from "@/app/api/plans/[id]/work-order-list/route";
import { apiMessages } from "@/lib/api/messages";
import { authPolicy } from "@/lib/config/auth";
import { PLAN_NOT_FOUND } from "@/lib/plans/api";

const head = { id: "11", employeeCode: "TRW0011", fullName: "หัวหน้า QC", roles: ["QC_HEAD"], mustChangePassword: false };
const outage = Object.assign(new Error("raw"), { name: "ConnectionError", code: "ECONNREFUSED" });
const asked = (handler: typeof detail, id: string, path: string) => handler(new Request(`http://localhost:3000/api/plans/${id}${path}`, { headers: { "sec-fetch-site": "same-origin" } }), { params: Promise.resolve({ id }) });

const cases = [
  { name: "GET /api/plans/[id]", handler: detail, path: "", service: mocks.loadPlanDetail, payload: { plan: { id: 5 }, siblings: [], history: [], vendors: null, today: "2026-10-21" }, next: "%2Fplans%2F5", gate: "canEdit" },
  { name: "GET /api/plans/[id]/work-order-list", handler: workOrderList, path: "/work-order-list", service: mocks.loadWorkOrderList, payload: { workOrders: [], inspectors: [] }, next: "%2Fplans%2F5%3Ftab%3Dwork", gate: "canManage" },
];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue(head);
  for (const entry of cases) entry.service.mockResolvedValue({ kind: "loaded", payload: entry.payload });
});

describe.each(cases)("$name", ({ handler, path, service, payload, next, gate }) => {
  const get = (id = "5") => asked(handler, id, path);

  it("answers 401 with the sign-in address of the page for a signed-out browser, reading nothing", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await get();
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ status: "error", message: apiMessages.signedOut, redirectTo: `/login?next=${next}` });
    expect(service).not.toHaveBeenCalled();
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
    expect(service).not.toHaveBeenCalled();
  });

  it.each(["QC_INSPECTOR", "QA_INSPECTOR", "PURCHASING", "PM", "MANAGEMENT", "MASTERDATA_ADMIN"])("refuses %s, who may not open plans", async (role) => {
    mocks.getCurrentUser.mockResolvedValue({ ...head, roles: [role] });
    expect((await get()).status).toBe(403);
    expect(service).not.toHaveBeenCalled();
  });

  it.each(["QC_HEAD", "QA_HEAD", "ADMIN"])("lets %s read", async (role) => {
    mocks.getCurrentUser.mockResolvedValue({ ...head, roles: [role] });
    expect((await get()).status).toBe(200);
  });

  it("is the payload itself, never cached or shared, for the plan of the path", async () => {
    const response = await get("5");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Cookie");
    expect(await response.json()).toEqual(payload);
    expect(service.mock.calls[0][0]).toBe(5);
  });

  it.each(["abc", "1.5", "-2", "1234567890123"])("answers 404 for the id %j without reading", async (id) => {
    const response = await get(id);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ status: "error", message: PLAN_NOT_FOUND });
    expect(service).not.toHaveBeenCalled();
  });

  it("answers 404 for a plan that doesn't exist", async () => {
    service.mockResolvedValue({ kind: "not_found" });
    const response = await get("999");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ message: PLAN_NOT_FOUND });
  });

  it(`tells the service whether the person may ${gate === "canEdit" ? "edit the plan (QC Head, Admin only)" : "manage work orders (QC Head, Admin only)"}`, async () => {
    for (const [role, allowed] of [["QC_HEAD", true], ["QA_HEAD", false], ["ADMIN", true]]) {
      service.mockClear();
      mocks.getCurrentUser.mockResolvedValue({ ...head, roles: [role] });
      await get();
      expect(service.mock.calls[0][1], String(role)).toBe(allowed);
    }
  });

  it("answers a database outage as a 503 sentence without the raw error", async () => {
    service.mockRejectedValue(outage);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await get();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.message).toContain("เชื่อมต่อฐานข้อมูลไม่ได้");
    expect(JSON.stringify(body)).not.toContain("raw");
    log.mockRestore();
  });

  it("does not hide a bug behind a 503", async () => {
    service.mockRejectedValue(new TypeError("bug"));
    await expect(get()).rejects.toThrow("bug");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  audit: vi.fn(),
  revalidatePath: vi.fn(),
  resolveActorId: vi.fn(),
  openWorkOrder: vi.fn(),
  setWorkOrderAssignees: vi.fn(),
  cancelWorkOrder: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/audit", () => ({ audit: mocks.audit, auditContext: () => ({ ip: "10.0.0.5", userAgent: "test" }) }));
vi.mock("@/lib/db/actor", () => ({ resolveActorId: mocks.resolveActorId }));
vi.mock("@/lib/db/config", () => ({ dbConfigured: () => true }));
vi.mock("@/lib/plans/runtime", () => ({ getPlanStore: () => "store" }));
// Keep the real form parsers and Thai messages; fake only the three services that write.
vi.mock("@/lib/plans/work-orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans/work-orders")>()),
  openWorkOrder: mocks.openWorkOrder,
  setWorkOrderAssignees: mocks.setWorkOrderAssignees,
  cancelWorkOrder: mocks.cancelWorkOrder,
}));

import { CANCEL_MESSAGES, NO_ACCOUNT } from "@/lib/plans/api";
import { workOrderErrorMessage } from "@/lib/plans/work-orders";
import { POST as openWorkOrder } from "@/app/api/plans/[id]/work-orders/route";
import { PUT as setAssignees } from "@/app/api/plans/[id]/work-orders/[woId]/assignees/route";
import { POST as cancelWorkOrder } from "@/app/api/plans/[id]/work-orders/[woId]/cancel/route";

type Handler = (request: Request, context: { params: Promise<{ id: string; woId: string }> }) => Promise<Response>;

const qcHead = { id: "11", employeeCode: "TRW0011", fullName: "หัวหน้า QC", roles: ["QC_HEAD"], mustChangePassword: false };
const trail = { ip: "10.0.0.5", userAgent: "test" };
const services = () => [mocks.openWorkOrder, mocks.setWorkOrderAssignees, mocks.cancelWorkOrder];
const outage = Object.assign(new Error("raw"), { name: "ConnectionError", code: "ECONNREFUSED" });

const call = (handler: Handler, body: unknown = {}, { id = "12", woId = "wo-1", method = "POST", headers = {} }: { id?: string; woId?: string; method?: string; headers?: Record<string, string> } = {}) =>
  handler(
    new Request("http://localhost:3000/api/plans/12/work-orders", {
      method,
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", ...headers },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id, woId }) },
  );

const everyRoute: [string, Handler, string][] = [
  ["open", openWorkOrder, "POST"],
  ["assignees", setAssignees, "PUT"],
  ["cancel", cancelWorkOrder, "POST"],
];
const bySlot = { assignee1: "21", assignee2: "22", assignee3: "", assignee4: "", assignee5: "" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue(qcHead);
  mocks.resolveActorId.mockResolvedValue("77");
});

describe.each(everyRoute)("%s — access rules shared by every work-order route", (_name, handler, method) => {
  it("answers 401 with the sign-in address for a signed-out browser, touching nothing", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await call(handler, {}, { method });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ redirectTo: expect.stringMatching(/^\/login\?next=%2Fplans%2F12/) });
    for (const service of services()) expect(service).not.toHaveBeenCalled();
  });

  it("refuses a cross-site request", async () => {
    expect((await call(handler, {}, { method, headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
    for (const service of services()) expect(service).not.toHaveBeenCalled();
  });

  it.each(["QC_INSPECTOR", "QA_HEAD", "QA_INSPECTOR", "PM"])("refuses %s: only QC Head and Admin work with work orders (QA Head only views)", async (role) => {
    mocks.getCurrentUser.mockResolvedValue({ ...qcHead, roles: [role] });
    expect((await call(handler, {}, { method })).status).toBe(403);
    for (const service of services()) expect(service).not.toHaveBeenCalled();
  });

  it("says so when the signed-in user has no row in the QCheck users table, and writes nothing", async () => {
    mocks.resolveActorId.mockResolvedValue(null);
    const response = await call(handler, {}, { method });
    expect(response.status).toBe(403);
    expect((await response.json()).message).toBe(NO_ACCOUNT);
    for (const service of services()) expect(service).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("answers a database outage as a 503 sentence with no audit row, and a real bug as a thrown error", async () => {
    for (const service of services()) service.mockRejectedValue(outage);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await call(handler, {}, { method });
    expect(response.status).toBe(503);
    expect((await response.json()).message).toContain("เชื่อมต่อฐานข้อมูลไม่ได้");
    expect(mocks.audit).not.toHaveBeenCalled();
    log.mockRestore();

    for (const service of services()) service.mockRejectedValue(new TypeError("bug"));
    await expect(call(handler, {}, { method })).rejects.toThrow("bug");
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each(["abc", "1.5", "-3", ""])("answers 404 for a plan id %j in the path without calling a service", async (id) => {
    const response = await call(handler, {}, { id, method });
    expect(response.status).toBe(404);
    for (const service of services()) expect(service).not.toHaveBeenCalled();
  });
});

describe.each(everyRoute.slice(1))("%s — the [woId] of the path", (_name, handler, method) => {
  it.each(["bad id!", "a.b", "x".repeat(41), ""])("answers 404 for %j without calling a service", async (woId) => {
    const response = await call(handler, {}, { woId, method });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ status: "error", message: "ไม่พบใบงานนี้" });
    for (const service of services()) expect(service).not.toHaveBeenCalled();
  });
});

describe("POST /api/plans/[id]/work-orders (open a work order)", () => {
  const typed = { calledDate: "2026-10-21", calledQty: "1,200", remarks: "เร่งด่วน", ...bySlot };
  const opened = { kind: "opened", id: "wo-9", woNo: "QP-2610-0012-1", type: "QC", need: 35, assigneeIds: ["21", "22"] };

  beforeEach(() => {
    mocks.openWorkOrder.mockResolvedValue(opened);
  });

  it("opens the call-in with the people in slot order, audits it and points the browser at the plan's work-order tab", async () => {
    const response = await call(openWorkOrder, typed);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ status: "done", redirectTo: "/plans/12?tab=work&opened=QP-2610-0012-1" });
    expect(mocks.openWorkOrder).toHaveBeenCalledWith(
      "store",
      { planId: 12, calledQty: 1200, calledDate: "2026-10-21", assignees: ["21", "22", null, null, null], remarks: "เร่งด่วน" },
      { actorId: "77" },
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      {
        action: "work_order.open",
        employeeCode: "TRW0011",
        userId: "11",
        entity: { type: "work_orders", id: "wo-9" },
        after: { woNo: "QP-2610-0012-1", planId: 12, calledQty: 1200, calledDate: "2026-10-21", type: "QC", need: 35, assignees: ["21", "22"] },
      },
      trail,
    );
    for (const path of ["/plans", "/plans/12", "/home", "/jobs"]) expect(mocks.revalidatePath).toHaveBeenCalledWith(path);
  });

  it("audits overInspect: true when confirmedOverInspect is true", async () => {
    await call(openWorkOrder, { ...typed, confirmedOverInspect: "true" });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "work_order.open",
        after: expect.objectContaining({
          overInspect: true,
        }),
      }),
      trail,
    );
  });

  it("passes an unreadable quantity to the service as NaN so its rule reports it", async () => {
    mocks.openWorkOrder.mockResolvedValue({ kind: "invalid", errors: { calledQty: "invalid_qty" } });
    await call(openWorkOrder, { ...typed, calledQty: "12x" });
    expect(mocks.openWorkOrder.mock.calls[0][1].calledQty).toBeNaN();
  });

  it("returns field errors in Thai plus everything typed (422), and audits nothing", async () => {
    mocks.openWorkOrder.mockResolvedValue({ kind: "invalid", errors: { calledQty: "exceeds_remaining", calledDate: "same_day" }, remaining: 800, minimum: 35, sameDayWoNo: "QP-2610-0012-1" });
    const response = await call(openWorkOrder, typed);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      status: "error",
      message: "กรุณาแก้ช่องที่มีปัญหา",
      fieldErrors: {
        calledQty: workOrderErrorMessage("calledQty", "exceeds_remaining", { remaining: 800 }),
        calledDate: workOrderErrorMessage("calledDate", "same_day", { sameDayWoNo: "QP-2610-0012-1" }),
      },
      values: { calledDate: "2026-10-21", calledQty: "1,200", remarks: "เร่งด่วน", assignees: ["21", "22", "", "", ""] },
      at: expect.any(Number),
    });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("when someone was deactivated meanwhile: names them, asks the browser to refresh, and revalidates the form page", async () => {
    mocks.openWorkOrder.mockResolvedValue({ kind: "invalid", errors: { assignees: "unavailable" }, unavailable: ["22"] });
    const response = await call(openWorkOrder, typed);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ unavailable: ["22"], refresh: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/plans/12/work-orders/new");
  });

  it("does not ask for a refresh on an ordinary refusal", async () => {
    mocks.openWorkOrder.mockResolvedValue({ kind: "invalid", errors: { calledQty: "required" } });
    expect(await (await call(openWorkOrder, typed)).json()).not.toHaveProperty("refresh");
  });

  it.each([
    [{ kind: "plan_not_found" }, 404, "ไม่พบแผนนี้"],
    [{ kind: "plan_closed" }, 409, "แผนนี้เสร็จ ยกเลิก หรือถูกพักล็อตแล้ว — เปิดใบงานไม่ได้"],
  ])("maps %j to HTTP %i keeping what was typed", async (outcome, status, message) => {
    mocks.openWorkOrder.mockResolvedValue(outcome);
    const response = await call(openWorkOrder, typed);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ status: "error", message, values: expect.objectContaining({ calledQty: "1,200" }), at: expect.any(Number) });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("keeps what was typed when the database is down", async () => {
    mocks.openWorkOrder.mockRejectedValue(outage);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await (await call(openWorkOrder, typed)).json()).toMatchObject({ values: expect.objectContaining({ remarks: "เร่งด่วน" }), at: expect.any(Number) });
  });
});

describe("PUT /api/plans/[id]/work-orders/[woId]/assignees", () => {
  beforeEach(() => {
    mocks.setWorkOrderAssignees.mockResolvedValue({ kind: "saved", planId: 12, woNo: "QP-2610-0012-1", before: ["21", "23"] });
  });

  it("changes the people of the work order in the path, audits before → after and refreshes the plan and jobs pages", async () => {
    const response = await call(setAssignees, bySlot, { method: "PUT" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "done", at: expect.any(Number) });
    expect(mocks.setWorkOrderAssignees).toHaveBeenCalledWith("store", { workOrderId: "wo-1", assignees: ["21", "22", null, null, null] }, { actorId: "77" });
    expect(mocks.audit).toHaveBeenCalledWith(
      {
        action: "work_order.assignees",
        employeeCode: "TRW0011",
        userId: "11",
        entity: { type: "work_orders", id: "wo-1" },
        before: { assignees: ["21", "23"] },
        after: { assignees: ["21", "22"] },
        detail: { woNo: "QP-2610-0012-1" },
      },
      trail,
    );
    for (const path of ["/plans/12", "/jobs"]) expect(mocks.revalidatePath).toHaveBeenCalledWith(path);
  });

  it.each([
    [{ kind: "invalid", error: "first_two_required" }, 422, workOrderErrorMessage("assignees", "first_two_required")],
    [{ kind: "not_found" }, 404, "ไม่พบใบงานนี้"],
    [{ kind: "locked" }, 409, "ใบงานนี้ส่งแล้ว ปิดแล้ว หรือยกเลิกแล้ว — แก้ไม่ได้"],
    [{ kind: "assignees_unavailable", userIds: ["22"] }, 422, workOrderErrorMessage("assignees", "unavailable")],
  ])("maps %j to HTTP %i with the Thai message, no audit and no refresh", async (outcome, status, message) => {
    mocks.setWorkOrderAssignees.mockResolvedValue(outcome);
    const response = await call(setAssignees, bySlot, { method: "PUT" });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ status: "error", message, at: expect.any(Number) });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("POST /api/plans/[id]/work-orders/[woId]/cancel", () => {
  beforeEach(() => {
    mocks.cancelWorkOrder.mockResolvedValue({ kind: "cancelled", planId: 12, woNo: "QP-2610-0012-1", calledQty: 200 });
  });

  it("cancels with the reason, audits it and refreshes the plan and jobs pages", async () => {
    const response = await call(cancelWorkOrder, { reason: " เรียกผิดวัน " });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "done", at: expect.any(Number) });
    expect(mocks.cancelWorkOrder).toHaveBeenCalledWith("store", { workOrderId: "wo-1", reason: " เรียกผิดวัน " }, { actorId: "77" });
    expect(mocks.audit).toHaveBeenCalledWith(
      {
        action: "work_order.cancel",
        employeeCode: "TRW0011",
        userId: "11",
        entity: { type: "work_orders", id: "wo-1" },
        after: { status: "CANCELLED" },
        detail: { woNo: "QP-2610-0012-1", calledQty: 200, reason: "เรียกผิดวัน" },
      },
      trail,
    );
    for (const path of ["/plans/12", "/jobs"]) expect(mocks.revalidatePath).toHaveBeenCalledWith(path);
  });

  it.each([
    [{ kind: "reason_required" }, 422, CANCEL_MESSAGES.reason_required],
    [{ kind: "reason_too_long" }, 422, CANCEL_MESSAGES.reason_too_long],
    [{ kind: "not_found" }, 404, "ไม่พบใบงานนี้"],
    [{ kind: "locked", block: "has_results" }, 409, "ใบงานนี้มีผลตรวจแล้ว — ยกเลิกไม่ได้"],
    [{ kind: "locked", block: "status" }, 409, "ใบงานนี้ส่งแล้ว ปิดแล้ว หรือยกเลิกแล้ว — แก้ไม่ได้"],
  ])("maps %j to HTTP %i with the Thai message, no audit and no refresh", async (outcome, status, message) => {
    mocks.cancelWorkOrder.mockResolvedValue(outcome);
    const response = await call(cancelWorkOrder, { reason: "x" });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ status: "error", message, at: expect.any(Number) });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("passes a missing reason to the service as null so its rule answers", async () => {
    mocks.cancelWorkOrder.mockResolvedValue({ kind: "reason_required" });
    await call(cancelWorkOrder, {});
    expect(mocks.cancelWorkOrder).toHaveBeenCalledWith("store", { workOrderId: "wo-1", reason: null }, expect.anything());
  });
});

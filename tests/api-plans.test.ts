import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  audit: vi.fn(),
  revalidatePath: vi.fn(),
  resolveActorId: vi.fn(),
  openPlan: vi.fn(),
  lookupReceiptDoc: vi.fn(),
  cancelPlan: vi.fn(),
  setWaitingGoods: vi.fn(),
  setPlanVendor: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/audit", () => ({ audit: mocks.audit, auditContext: () => ({ ip: "10.0.0.5", userAgent: "test" }) }));
vi.mock("@/lib/db/actor", () => ({ resolveActorId: mocks.resolveActorId }));
vi.mock("@/lib/db/config", () => ({ dbConfigured: () => true }));
vi.mock("@/lib/plans/runtime", () => ({ getPlanStore: () => "store" }));
vi.mock("@/lib/plans/service", () => ({
  openPlan: mocks.openPlan,
  lookupReceiptDoc: mocks.lookupReceiptDoc,
  cancelPlan: mocks.cancelPlan,
  setWaitingGoods: mocks.setWaitingGoods,
  setPlanVendor: mocks.setPlanVendor,
}));

import { CANCEL_MESSAGES, NO_ACCOUNT } from "@/lib/plans/api";
import { fieldErrorMessage } from "@/lib/plans/form";
import { POST as openPlan } from "@/app/api/plans/route";
import { GET as lookup } from "@/app/api/plans/lookup-doc/route";
import { POST as cancel } from "@/app/api/plans/[id]/cancel/route";
import { POST as waitingGoods } from "@/app/api/plans/[id]/waiting-goods/route";
import { PATCH as vendor } from "@/app/api/plans/[id]/vendor/route";

type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

const qcHead = { id: "11", employeeCode: "TRW0011", fullName: "หัวหน้า QC", roles: ["QC_HEAD"], mustChangePassword: false };
const trail = { ip: "10.0.0.5", userAgent: "test" };
const planCalls = () => [mocks.openPlan, mocks.lookupReceiptDoc, mocks.cancelPlan, mocks.setWaitingGoods, mocks.setPlanVendor];
const outage = Object.assign(new Error("raw"), { name: "ConnectionError", code: "ECONNREFUSED" });

const call = (
  handler: Handler,
  body: unknown = {},
  { id = "12", method = "POST", headers = {}, url = "http://localhost:3000/api/plans" }: { id?: string; method?: string; headers?: Record<string, string>; url?: string } = {},
) =>
  handler(
    new Request(url, {
      method,
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", ...headers },
      ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
    }),
    { params: Promise.resolve({ id }) },
  );

const writers: [string, Handler, string][] = [
  ["open plan", openPlan, "POST"],
  ["cancel", cancel, "POST"],
  ["waiting goods", waitingGoods, "POST"],
  ["vendor", vendor, "PATCH"],
];
const everyRoute: [string, Handler, string][] = [...writers, ["lookup", lookup, "GET"]];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue(qcHead);
  mocks.resolveActorId.mockResolvedValue("77");
});

describe.each(everyRoute)("%s — access rules shared by every plan route", (_name, handler, method) => {
  it("answers 401 with the sign-in address for a signed-out browser, touching nothing", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await call(handler, {}, { method });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ status: "error", redirectTo: expect.stringMatching(/^\/login\?next=%2Fplans/) });
    for (const service of planCalls()) expect(service).not.toHaveBeenCalled();
  });

  it.each(["QA_HEAD", "QC_INSPECTOR", "QA_INSPECTOR", "PM", "MASTERDATA_ADMIN"])("refuses %s: only QC Head and Admin work with plans", async (role) => {
    mocks.getCurrentUser.mockResolvedValue({ ...qcHead, roles: [role] });
    expect((await call(handler, {}, { method })).status).toBe(403);
    for (const service of planCalls()) expect(service).not.toHaveBeenCalled();
  });

  it.each(["QC_HEAD", "ADMIN"])("lets %s through to the plan service", async (role) => {
    mocks.getCurrentUser.mockResolvedValue({ ...qcHead, roles: [role] });
    mocks.openPlan.mockResolvedValue({ kind: "opened", planId: 1, planNo: "QP", headerReused: false, qcRequired: 1 });
    mocks.lookupReceiptDoc.mockResolvedValue({ kind: "incomplete" });
    mocks.cancelPlan.mockResolvedValue({ kind: "not_found" });
    mocks.setWaitingGoods.mockResolvedValue({ kind: "not_found" });
    mocks.setPlanVendor.mockResolvedValue({ kind: "not_found" });
    expect((await call(handler, {}, { method })).status).not.toBe(403);
  });

  it("answers a database outage as a 503 sentence with no audit row, and a real bug as a thrown error", async () => {
    for (const service of planCalls()) service.mockRejectedValue(outage);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await call(handler, {}, { method });
    expect(response.status).toBe(503);
    expect((await response.json()).message).toContain("เชื่อมต่อฐานข้อมูลไม่ได้");
    expect(mocks.audit).not.toHaveBeenCalled();
    log.mockRestore();

    for (const service of planCalls()) service.mockRejectedValue(new TypeError("bug"));
    await expect(call(handler, {}, { method })).rejects.toThrow("bug");
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});

describe.each(writers)("%s — writes", (_name, handler, method) => {
  it("refuses a cross-site request", async () => {
    const response = await call(handler, {}, { method, headers: { "sec-fetch-site": "cross-site" } });
    expect(response.status).toBe(403);
    for (const service of planCalls()) expect(service).not.toHaveBeenCalled();
  });

  it("says so when the signed-in user has no row in the QCheck users table, and writes nothing", async () => {
    mocks.resolveActorId.mockResolvedValue(null);
    const response = await call(handler, {}, { method });
    expect(response.status).toBe(403);
    expect((await response.json()).message).toBe(NO_ACCOUNT);
    for (const service of planCalls()) expect(service).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});

describe.each(writers.slice(1))("%s — the [id] of the path", (_name, handler, method) => {
  it.each(["abc", "1.5", "-3", "1234567890123", ""])("answers 404 for %j without calling the service", async (id) => {
    const response = await call(handler, {}, { id, method });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ status: "error", message: "ไม่พบแผนนี้" });
    for (const service of planCalls()) expect(service).not.toHaveBeenCalled();
  });
});

describe("POST /api/plans (open a plan)", () => {
  const typed = { docType: "INVOICE", docNo: "INV-2610-001", vendorId: "", modelId: "5", lotQty: "1,350", invoiceDate: "2026-10-20", expectedSkuCount: "4", remarks: "" };

  beforeEach(() => {
    mocks.openPlan.mockResolvedValue({ kind: "opened", planId: 12, planNo: "QP-2610-0001", headerReused: false, qcRequired: 135, productionWoNo: null });
  });

  it("opens the plan as the signed-in head, audits it, refreshes the lists and points the browser at 'open the next Model'", async () => {
    const response = await call(openPlan, typed);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ status: "done", redirectTo: "/plans/new?opened=12" });
    expect(mocks.openPlan).toHaveBeenCalledWith(
      "store",
      expect.objectContaining({ docType: "INVOICE", docNo: "INV-2610-001", vendorId: null, modelId: 5, lotQty: 1350, expectedSkuCount: 4, invoiceDate: "2026-10-20" }),
      { actorId: "77" },
    );
    expect(mocks.resolveActorId).toHaveBeenCalledWith("11");
    expect(mocks.audit).toHaveBeenCalledWith(
      {
        action: "plan.open",
        employeeCode: "TRW0011",
        userId: "11",
        entity: { type: "plans", id: "12" },
        after: { planNo: "QP-2610-0001", docType: "INVOICE", docNo: "INV-2610-001", productionWoNo: null, vendorId: null, modelId: 5, lotQty: 1350, qcRequired: 135 },
        detail: { headerReused: false },
      },
      trail,
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/plans");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/home");
  });

  it("returns field errors in Thai plus everything typed (422), and audits nothing", async () => {
    mocks.openPlan.mockResolvedValue({ kind: "invalid", errors: { docNo: "required", lotQty: "invalid" } });
    const response = await call(openPlan, typed);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      status: "error",
      message: "กรุณาแก้ช่องที่มีปัญหา",
      fieldErrors: { docNo: fieldErrorMessage("docNo", "required"), lotQty: "จำนวนต้องเป็นจำนวนเต็ม 1 ขึ้นไป" },
      values: expect.objectContaining({ docType: "INVOICE", docNo: "INV-2610-001", lotQty: "1,350", modelId: "5" }),
      at: expect.any(Number),
    });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("answers a duplicate Invoice/PO + Model (BR-01) as 409 with a link to the plan that exists", async () => {
    mocks.openPlan.mockResolvedValue({ kind: "duplicate", planId: 3, planNo: "QP-2610-0003" });
    const response = await call(openPlan, typed);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ status: "duplicate", planId: 3, planNo: "QP-2610-0003", values: expect.objectContaining({ docNo: "INV-2610-001" }), at: expect.any(Number) });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("keeps what was typed when the database is down", async () => {
    mocks.openPlan.mockRejectedValue(outage);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await call(openPlan, typed);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ values: expect.objectContaining({ docNo: "INV-2610-001" }), at: expect.any(Number) });
  });
});

describe("GET /api/plans/lookup-doc", () => {
  const url = (query: string) => `http://localhost:3000/api/plans/lookup-doc${query}`;

  it("asks the service whether the Invoice/PO exists and wraps the answer", async () => {
    const found = { kind: "new", docNoNormalized: "INV-1" };
    mocks.lookupReceiptDoc.mockResolvedValue(found);
    const response = await call(lookup, undefined, { method: "GET", url: url("?docType=INVOICE&docNo=INV-1") });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "done", result: found });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.lookupReceiptDoc).toHaveBeenCalledWith("store", { docType: "INVOICE", docNo: "INV-1" });
  });

  it("trims an over-long number to 200 characters and treats missing params as empty", async () => {
    mocks.lookupReceiptDoc.mockResolvedValue({ kind: "incomplete" });
    await call(lookup, undefined, { method: "GET", url: url(`?docType=PO&docNo=${"9".repeat(500)}`) });
    expect(mocks.lookupReceiptDoc).toHaveBeenLastCalledWith("store", { docType: "PO", docNo: "9".repeat(200) });
    await call(lookup, undefined, { method: "GET", url: url("") });
    expect(mocks.lookupReceiptDoc).toHaveBeenLastCalledWith("store", { docType: "", docNo: "" });
  });
});

describe("POST /api/plans/[id]/cancel", () => {
  beforeEach(() => {
    mocks.cancelPlan.mockResolvedValue({ kind: "cancelled", planNo: "QP-2610-0012", from: "OPEN" });
  });

  it("cancels with the reason, audits before → after, and refreshes the plan's pages", async () => {
    const response = await call(cancel, { reason: " กรอกผิด " });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "done", at: expect.any(Number) });
    expect(mocks.cancelPlan).toHaveBeenCalledWith("store", { planId: 12, reason: " กรอกผิด ", isHead: true }, { actorId: "77" });
    expect(mocks.audit).toHaveBeenCalledWith(
      {
        action: "plan.cancel",
        employeeCode: "TRW0011",
        userId: "11",
        entity: { type: "plans", id: "12" },
        before: { status: "OPEN" },
        after: { status: "CANCELLED" },
        detail: { planNo: "QP-2610-0012", reason: "กรอกผิด" },
      },
      trail,
    );
    for (const path of ["/plans", "/plans/12", "/home"]) expect(mocks.revalidatePath).toHaveBeenCalledWith(path);
  });

  it("tells the service whether the person is a QC Head (an Admin is not)", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...qcHead, roles: ["ADMIN"] });
    await call(cancel, { reason: "x" });
    expect(mocks.cancelPlan).toHaveBeenCalledWith("store", expect.objectContaining({ isHead: false }), expect.anything());
    mocks.getCurrentUser.mockResolvedValue({ ...qcHead, roles: ["QC_HEAD"] });
    await call(cancel, { reason: "x" });
    expect(mocks.cancelPlan).toHaveBeenLastCalledWith("store", expect.objectContaining({ isHead: true }), expect.anything());
  });

  it.each([
    [{ kind: "blocked", block: "status" }, 409, CANCEL_MESSAGES.status],
    [{ kind: "blocked", block: "head_only" }, 403, CANCEL_MESSAGES.head_only],
    [{ kind: "reason_required" }, 422, CANCEL_MESSAGES.reason_required],
    [{ kind: "reason_too_long" }, 422, CANCEL_MESSAGES.reason_too_long],
    [{ kind: "not_found" }, 404, CANCEL_MESSAGES.not_found],
    [{ kind: "changed" }, 409, CANCEL_MESSAGES.changed],
  ])("maps %j to HTTP %i with the Thai message, no audit and no refresh", async (outcome, status, message) => {
    mocks.cancelPlan.mockResolvedValue(outcome);
    const response = await call(cancel, { reason: "x" });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ status: "error", message, at: expect.any(Number) });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("passes a missing reason to the service as null so its rule answers", async () => {
    mocks.cancelPlan.mockResolvedValue({ kind: "reason_required" });
    await call(cancel, {});
    expect(mocks.cancelPlan).toHaveBeenCalledWith("store", { planId: 12, reason: null, isHead: true }, expect.anything());
  });
});

describe("POST /api/plans/[id]/waiting-goods", () => {
  beforeEach(() => {
    mocks.setWaitingGoods.mockResolvedValue({ kind: "saved", planNo: "QP-2610-0012", before: false });
  });

  it("saves the tick, audits before → after and refreshes the plan's pages", async () => {
    const response = await call(waitingGoods, { value: "1" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "done", at: expect.any(Number) });
    expect(mocks.setWaitingGoods).toHaveBeenCalledWith("store", { planId: 12, value: true }, { actorId: "77" });
    expect(mocks.audit).toHaveBeenCalledWith(
      {
        action: "plan.waiting_goods",
        employeeCode: "TRW0011",
        userId: "11",
        entity: { type: "plans", id: "12" },
        before: { waitingGoods: false },
        after: { waitingGoods: true },
        detail: { planNo: "QP-2610-0012" },
      },
      trail,
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/plans/12");
  });

  it.each([["1", true], ["true", true], [true, true], ["0", false], ["false", false], ["", false], [undefined, false]])("value = %j ticks as %s", async (value, ticked) => {
    await call(waitingGoods, { value });
    expect(mocks.setWaitingGoods).toHaveBeenCalledWith("store", { planId: 12, value: ticked }, expect.anything());
  });

  it.each([
    [{ kind: "not_found" }, 404, "ไม่พบแผนนี้"],
    [{ kind: "blocked" }, 409, "แผนที่ยกเลิกหรือเสร็จแล้วติ๊ก “รอของ” ไม่ได้"],
  ])("maps %j to HTTP %i", async (outcome, status, message) => {
    mocks.setWaitingGoods.mockResolvedValue(outcome);
    const response = await call(waitingGoods, { value: "1" });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ status: "error", message, at: expect.any(Number) });
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/plans/[id]/vendor", () => {
  beforeEach(() => {
    mocks.setPlanVendor.mockResolvedValue({ kind: "saved", docId: 8, docNo: "INV-2610-001", before: null, after: 5, planNos: ["QP-2610-0012", "QP-2610-0013"] });
  });

  it("sets the vendor of the whole document, audits before → after and refreshes plan and jobs pages", async () => {
    const response = await call(vendor, { vendorId: "5" }, { method: "PATCH" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "done", at: expect.any(Number) });
    expect(mocks.setPlanVendor).toHaveBeenCalledWith("store", { planId: 12, vendorId: 5 }, { actorId: "77" });
    expect(mocks.audit).toHaveBeenCalledWith(
      {
        action: "plan.vendor",
        employeeCode: "TRW0011",
        userId: "11",
        entity: { type: "receipt_docs", id: "8" },
        before: { vendorId: null },
        after: { vendorId: 5 },
        detail: { planId: 12, docNo: "INV-2610-001", plans: ["QP-2610-0012", "QP-2610-0013"] },
      },
      trail,
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/plans/12");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/jobs");
  });

  it.each([["5", 5], [5, 5], ["", null], ["abc", null], ["1.5", null], [undefined, null]])("vendorId = %j means %s (empty or invalid clears it)", async (vendorId, expected) => {
    await call(vendor, { vendorId }, { method: "PATCH" });
    expect(mocks.setPlanVendor).toHaveBeenCalledWith("store", { planId: 12, vendorId: expected }, expect.anything());
  });

  it.each([
    [{ kind: "not_found" }, 404, "ไม่พบแผนนี้"],
    [{ kind: "plan_cancelled" }, 409, "แผนนี้ถูกยกเลิกแล้ว — แก้ Vendor ไม่ได้"],
    [{ kind: "vendor_not_found" }, 422, "ไม่พบ Vendor นี้ — โหลดหน้าใหม่แล้วเลือกอีกครั้ง"],
    [{ kind: "vendor_inactive" }, 422, "Vendor นี้ถูกปิดใช้งานแล้ว — เลือกรายอื่น"],
  ])("maps %j to HTTP %i with the Thai message and no audit", async (outcome, status, message) => {
    mocks.setPlanVendor.mockResolvedValue(outcome);
    const response = await call(vendor, { vendorId: "5" }, { method: "PATCH" });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ status: "error", message, at: expect.any(Number) });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

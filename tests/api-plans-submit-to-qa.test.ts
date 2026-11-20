import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  audit: vi.fn(),
  revalidatePath: vi.fn(),
  resolveActorId: vi.fn(),
  submitPlanToQa: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/audit", () => ({ audit: mocks.audit, auditContext: () => ({ ip: "10.0.0.5", userAgent: "test" }) }));
vi.mock("@/lib/db/actor", () => ({ resolveActorId: mocks.resolveActorId }));
vi.mock("@/lib/db/config", () => ({ dbConfigured: () => true }));
vi.mock("@/lib/plans/runtime", () => ({ getPlanStore: () => "store" }));
vi.mock("@/lib/inspections/runtime", () => ({ getInspectionStore: () => "inspectionStore" }));
vi.mock("@/lib/plans/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans/service")>()),
  submitPlanToQa: mocks.submitPlanToQa,
}));

import { POST as submitToQaRoute } from "@/app/api/plans/[id]/submit-to-qa/route";

const qcHead = { id: "11", employeeCode: "TRW0011", fullName: "หัวหน้า QC", roles: ["QC_HEAD"], mustChangePassword: false };
const qcInspector = { id: "12", employeeCode: "TRW0012", fullName: "ผู้ตรวจ QC", roles: ["QC_INSPECTOR"], mustChangePassword: false };
const admin = { id: "1", employeeCode: "TRW0001", fullName: "แอดมิน", roles: ["ADMIN"], mustChangePassword: false };

const call = (planId = "101", body: unknown = {}, user = qcHead) => {
  mocks.getCurrentUser.mockResolvedValue(user);
  mocks.resolveActorId.mockResolvedValue(user.id);
  return submitToQaRoute(
    new Request(`http://localhost:3000/api/plans/${planId}/submit-to-qa`, {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: planId }) },
  );
};

describe("POST /api/plans/[id]/submit-to-qa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses unauthenticated caller (401)", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await submitToQaRoute(
      new Request("http://localhost:3000/api/plans/101/submit-to-qa", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "101" }) },
    );
    expect(res.status).toBe(401);
  });

  it("refuses caller without QC_HEAD / ADMIN role (403)", async () => {
    const qaHead = { id: "13", employeeCode: "TRW0013", fullName: "หัวหน้า QA", roles: ["QA_HEAD"], mustChangePassword: false };
    expect((await call("101", {}, qcInspector)).status).toBe(403);
    expect((await call("101", {}, qaHead)).status).toBe(403);
  });

  it("refuses malformed plan ID (404)", async () => {
    const res = await call("abc");
    expect(res.status).toBe(404);
  });

  it("returns 404 when plan is not found in store", async () => {
    mocks.submitPlanToQa.mockResolvedValue({ kind: "not_found" });
    const res = await call("999");
    expect(res.status).toBe(404);
  });

  it("returns 422 when quota is not met", async () => {
    mocks.submitPlanToQa.mockResolvedValue({ kind: "quota_not_met", qcDone: 5, qcRequired: 10 });
    const res = await call("101");
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.message).toContain("ตรวจยังไม่ครบตามเป้าหมาย (ตรวจแล้ว 5/10 เครื่อง)");
  });

  it("returns 422 when there is pending rework", async () => {
    mocks.submitPlanToQa.mockResolvedValue({ kind: "rework_pending", reworkCount: 2 });
    const res = await call("101");
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.message).toContain("ยังมีเครื่องรอแก้ไข (Rework) อยู่ 2 เครื่อง");
  });

  it("returns 422 when plan has no work orders", async () => {
    mocks.submitPlanToQa.mockResolvedValue({ kind: "no_work_orders" });
    const res = await call("101");
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.message).toContain("แผนตรวจนี้ยังไม่มีการเปิดใบงาน");
  });

  it("returns 422 when there are incomplete work orders based on Need", async () => {
    mocks.submitPlanToQa.mockResolvedValue({
      kind: "work_orders_incomplete",
      incompleteWorkOrders: [
        { woNo: "WO-2610-0002", qtyNeed: 15, qtyDone: 5, reworkCount: 0, status: "QC_IN_PROGRESS" },
      ],
    });
    const res = await call("101");
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.message).toContain("WO-2610-0002 (ตรวจแล้ว 5/15)");
    expect(body.message).toContain("กรุณาตรวจให้ครบทุกใบงานก่อนส่งต่อ QA");
  });

  it("returns 409 when plan is in invalid status", async () => {
    mocks.submitPlanToQa.mockResolvedValue({ kind: "invalid_status", status: "CANCELLED" });
    const res = await call("101");
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.message).toContain("สถานะแผนไม่สามารถส่งต่อ QA ได้ (CANCELLED)");
  });

  it("succeeds for QC Head, transitions to QA_PENDING, audits, and revalidates", async () => {
    mocks.submitPlanToQa.mockResolvedValue({ kind: "submitted", planNo: "QP-2610-0001", from: "QC_REVIEW" });
    const res = await call("101", { remarks: "ตรวจครบถ้วน เรียบร้อยดี" }, qcHead);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("done");
    expect(body.from).toBe("QC_REVIEW");
    expect(body.to).toBe("QA_PENDING");

    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "plan.submit_to_qa",
        entity: { type: "plans", id: "101" },
        before: { status: "QC_REVIEW" },
        after: { status: "QA_PENDING" },
        detail: { planNo: "QP-2610-0001", remarks: "ตรวจครบถ้วน เรียบร้อยดี" },
      }),
      expect.anything(),
    );

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/plans");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/plans/101");
  });

  it("also succeeds for Admin", async () => {
    mocks.submitPlanToQa.mockResolvedValue({ kind: "submitted", planNo: "QP-2610-0002", from: "QC_IN_PROGRESS" });
    const res = await call("102", {}, admin);
    expect(res.status).toBe(200);
  });
});

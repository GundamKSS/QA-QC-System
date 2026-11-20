import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  jobs: vi.fn(),
  getPendingReworks: vi.fn(),
  getInspectorProgress: vi.fn(),
  getInspectorMonthlyStats: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/plans/runtime", () => ({
  getPlanStore: () => ({ jobs: mocks.jobs }),
}));
vi.mock("@/lib/inspections/runtime", () => ({
  getInspectionStore: () => ({
    getPendingReworks: mocks.getPendingReworks,
    getInspectorProgress: mocks.getInspectorProgress,
    getInspectorMonthlyStats: mocks.getInspectorMonthlyStats,
  }),
}));

import { GET } from "@/app/api/home/inspector/route";
import { apiMessages } from "@/lib/api/messages";
import { authPolicy } from "@/lib/config/auth";

const qcInspector = {
  id: "21",
  employeeCode: "F0001",
  fullName: "สมชาย ตรวจดี",
  roles: ["QC_INSPECTOR"],
  mustChangePassword: false,
};

const get = (query = "") =>
  GET(
    new Request(`http://localhost:3000/api/home/inspector${query}`, {
      headers: { "sec-fetch-site": "same-origin" },
    }),
  );

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue(qcInspector);
  mocks.jobs.mockResolvedValue([]);
  mocks.getPendingReworks.mockResolvedValue([]);
  mocks.getInspectorProgress.mockResolvedValue(new Map());
  mocks.getInspectorMonthlyStats.mockResolvedValue({
    totalInspected: 42,
    passedCount: 40,
    failedCount: 2,
    reworkResolvedCount: 3,
    firstTimePassRate: 95.2,
    topDefectName: "รอยรั่วข้อต่อลม",
  });
});

describe("GET /api/home/inspector — access", () => {
  it("answers 401 with redirect to sign-in for anonymous visitor", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await get();
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      status: "error",
      redirectTo: "/login?next=%2Fhome",
    });
  });

  it("answers 403 when user must change password", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...qcInspector, mustChangePassword: true });
    const response = await get();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      status: "error",
      redirectTo: authPolicy.changePasswordPath,
    });
  });

  it("refuses non-inspector roles like PURCHASING or MASTERDATA_ADMIN with 403", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...qcInspector, roles: ["PURCHASING"] });
    const response = await get();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      status: "error",
      message: apiMessages.forbidden,
    });
  });
});

describe("GET /api/home/inspector — payload & metrics", () => {
  it("answers 200 with monthly performance and urgent KPIs for QC_INSPECTOR", async () => {
    const mockRework = {
      id: "insp-001",
      workOrderId: "wo-1",
      woNo: "QP-2611-0001-1",
      planId: 1,
      planNo: "QP-2611-0001",
      modelCode: "XM2525",
      description: "ปั๊มลมลูกสูบ",
      serialPump: "2611-0042",
      roundNo: 2,
      failedItemCount: 1,
      defectNames: "รอยรั่วข้อต่อลม",
      role: "QC",
      submittedAt: "2026-11-05T10:00:00Z",
      inspectorId: "21",
      inspectorName: "สมชาย ตรวจดี",
    };
    mocks.getPendingReworks.mockResolvedValue([mockRework]);

    const mockJob = {
      id: "wo-2",
      planId: 2,
      woNo: "QP-2611-0002-1",
      type: "NORMAL",
      calledQty: 50,
      calledDate: "2026-11-08",
      qtyNeed: 20,
      qtyDone: 5,
      status: "IN_PROGRESS",
      modelCode: "PP-22",
      description: "ปั๊มลมสายพาน",
      docType: "INV",
      docNo: "INV-99",
      vendorName: "PUMA TAIWAN",
      assignees: [
        {
          userId: "21",
          name: "สมชาย ตรวจดี",
          targetQty: 20,
          doneQty: 5,
        },
      ],
    };
    mocks.jobs.mockResolvedValue([mockJob]);

    const progressMap = new Map();
    progressMap.set("wo-2:21", { done: 5, passed: 5, reworkPending: 0, rejected: 0 });
    mocks.getInspectorProgress.mockResolvedValue(progressMap);

    const response = await get();
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.inspector).toMatchObject({
      id: "21",
      fullName: "สมชาย ตรวจดี",
      employeeCode: "F0001",
    });

    expect(body.urgentStatus).toEqual({
      reworkCount: 1,
      inProgressCount: 1,
      notStartedCount: 0,
      totalPendingUnits: 15, // 20 - 5
    });

    expect(body.monthlyPerformance).toMatchObject({
      totalInspected: 42,
      passedUnits: 40,
      failedUnits: 2,
      reworkResolvedCount: 3,
      passRate: 95.2,
      topDefectName: "รอยรั่วข้อต่อลม",
    });

    expect(body.quickActions).toHaveLength(2);
    expect(body.quickActions[0]).toMatchObject({
      kind: "rework",
      id: "insp-001",
      modelCode: "XM2525",
      serialPump: "2611-0042",
    });
    expect(body.quickActions[1]).toMatchObject({
      kind: "inspect",
      id: "wo-2",
      modelCode: "PP-22",
      qtyNeed: 20,
      qtyDone: 5,
      remainingQty: 15,
      role: "QC",
    });
    expect(body.side).toBe("QC");
    expect(body.jobsHref).toBe("/jobs");
  });

  it("scopes jobs and links to QA queue for QA_INSPECTOR", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "15",
      employeeCode: "DEMO_QA01",
      fullName: "เดโม ผู้ตรวจ QA",
      roles: ["QA_INSPECTOR"],
      mustChangePassword: false,
    });

    mocks.getPendingReworks.mockResolvedValue([
      {
        id: "insp-qc-only",
        workOrderId: "wo-qc",
        woNo: "QP-2611-0001-1",
        planId: 1,
        planNo: "QP-2611-0001",
        modelCode: "XM2525",
        description: "ปั๊มลมลูกสูบ",
        serialPump: "2611-0042",
        roundNo: 2,
        failedItemCount: 1,
        defectNames: "รอยรั่วข้อต่อลม",
        role: "QC",
        submittedAt: "2026-11-05T10:00:00Z",
        inspectorId: "15",
        inspectorName: "เดโม ผู้ตรวจ QA",
      },
    ]);

    mocks.jobs.mockResolvedValue([
      {
        id: "wo-qa-1",
        planId: 9,
        woNo: "QP-2611-0009-QA",
        type: "QA",
        calledQty: 50,
        calledDate: "2026-11-18",
        qtyNeed: 8,
        qtyDone: 2,
        status: "IN_PROGRESS",
        modelCode: "XM2550",
        description: "ปั๊มลมโรตารี่",
        docType: "INV",
        docNo: "INV-101",
        vendorName: "PUMA TAIWAN",
        assignees: [{ userId: "15", name: "เดโม ผู้ตรวจ QA", targetQty: 8, doneQty: 2 }],
      },
    ]);

    const progressMap = new Map();
    progressMap.set("wo-qa-1:15", { done: 2, passed: 2, reworkPending: 0, rejected: 0 });
    mocks.getInspectorProgress.mockResolvedValue(progressMap);

    const response = await get();
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(mocks.jobs).toHaveBeenCalledWith("15", { activeOnly: true, side: "QA" });
    expect(mocks.jobs).toHaveBeenCalledWith("15", { side: "QA" });
    expect(body.side).toBe("QA");
    expect(body.jobsHref).toBe("/qa-queue");
    expect(body.urgentStatus).toEqual({
      reworkCount: 0, // QC rework filtered out
      inProgressCount: 1,
      notStartedCount: 0,
      totalPendingUnits: 6,
    });
    expect(body.quickActions).toHaveLength(1);
    expect(body.quickActions[0]).toMatchObject({
      kind: "inspect",
      id: "wo-qa-1",
      woNo: "QP-2611-0009-QA",
      role: "QA",
      qtyNeed: 8,
      qtyDone: 2,
      remainingQty: 6,
    });
  });

  it("filters monthly performance by ?month=YYYY-MM", async () => {
    await get("?month=2026-10");
    expect(mocks.getInspectorMonthlyStats).toHaveBeenCalledWith("21", "2026-10");
  });

  it("returns 503 on database outage", async () => {
    const outage = Object.assign(new Error("Database disconnected"), {
      name: "ConnectionError",
      code: "ECONNREFUSED",
    });
    mocks.jobs.mockRejectedValue(outage);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await get();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.status).toBe("error");
    expect(body.message).toContain("เชื่อมต่อฐานข้อมูลไม่ได้");
    log.mockRestore();
  });
});

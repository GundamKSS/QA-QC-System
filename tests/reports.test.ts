import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  loadReportsList: vi.fn(),
  loadInspectionReport: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/reports/inspection-report", () => ({
  loadReportsList: mocks.loadReportsList,
  loadInspectionReport: mocks.loadInspectionReport,
}));

import { GET as getReport } from "@/app/api/plans/[id]/report/route";
import { GET as getReportsList } from "@/app/api/reports/route";

const qcHead = {
  id: "1",
  employeeCode: "F0001",
  fullName: "QC Head",
  roles: ["QC_HEAD"],
  mustChangePassword: false,
};

const outsider = {
  id: "2",
  employeeCode: "GUEST",
  fullName: "Guest",
  roles: ["GUEST"],
  mustChangePassword: false,
};

const sampleReport = {
  plan: {
    id: 1,
    planNo: "QP-2611-0001",
    status: "COMPLETED",
    createdAt: "2026-11-16T10:00:00",
    updatedAt: "2026-11-16T12:00:00",
    docNo: "INV-001",
    docType: "INVOICE",
    department: null,
    vendorName: "PUMA Supplier",
    vendorCode: "CN",
    modelCode: "CHEETAH-25",
    modelDescription: "Air Compressor 25L",
    brandName: "PUMA",
    brandGroup: "PUMA",
    pumpType: "Rotary",
    lotQty: 50,
    qcRequired: 5,
    qcDoneTotal: 5,
    qaRequired: 5,
    qaDoneTotal: 5,
    aqlLevel: "II",
    aqlSampleSize: 5,
    aqlAcceptNum: 0,
    aqlRejectNum: 1,
  },
  qcSummary: {
    totalInspected: 5,
    passCount: 5,
    concessionCount: 0,
    reworkCount: 0,
    rejectCount: 0,
    firstTimePassRate: 100,
  },
  qaSummary: {
    totalSampled: 5,
    passCount: 5,
    rejectCount: 0,
    decision: "ACCEPT",
    sampledSerials: ["SN-001", "SN-002"],
  },
  defectBreakdown: [],
  defectPhotos: [],
  inspectedUnits: [],
  approvals: [
    {
      role: "PREPARED_BY",
      title: "ผู้ตรวจสอบคุณภาพ (QC Inspector)",
      name: "Inspector",
      employeeCode: "QC01",
      signedAt: "2026-11-16T10:00:00",
      status: "APPROVED",
    },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue(qcHead);
  mocks.loadReportsList.mockResolvedValue({
    reports: [],
    total: 0,
    counts: { all: 0, completed: 0, qaPending: 0, qcInProgress: 0 },
  });
  mocks.loadInspectionReport.mockResolvedValue(sampleReport);
});

describe("Reports API — Access Control & Delivery", () => {
  it("rejects unauthenticated requests with 401", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await getReportsList(new Request("http://localhost:3000/api/reports"));
    expect(res.status).toBe(401);
  });

  it("rejects unauthorized roles with 403", async () => {
    mocks.getCurrentUser.mockResolvedValue(outsider);
    const res = await getReportsList(new Request("http://localhost:3000/api/reports"));
    expect(res.status).toBe(403);
  });

  it("permits authorized roles to load reports list", async () => {
    const res = await getReportsList(new Request("http://localhost:3000/api/reports?q=CHEETAH"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      reports: [],
      total: 0,
      counts: { all: 0, completed: 0, qaPending: 0, qcInProgress: 0 },
    });
    expect(mocks.loadReportsList).toHaveBeenCalledWith({
      q: "CHEETAH",
      status: undefined,
      vendorId: undefined,
      modelId: undefined,
    });
  });

  it("returns 404 when plan id is invalid or not found", async () => {
    mocks.loadInspectionReport.mockResolvedValue(null);
    const res = await getReport(new Request("http://localhost:3000/api/plans/999/report"), {
      params: Promise.resolve({ id: "999" }),
    });
    expect(res.status).toBe(404);
  });

  it("loads inspection report data for an existing plan", async () => {
    const res = await getReport(new Request("http://localhost:3000/api/plans/1/report"), {
      params: Promise.resolve({ id: "1" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.plan.planNo).toBe("QP-2611-0001");
    expect(json.qcSummary.firstTimePassRate).toBe(100);
    expect(json.qaSummary.decision).toBe("ACCEPT");
    expect(json.approvals).toHaveLength(1);
  });
});

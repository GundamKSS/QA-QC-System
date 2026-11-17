import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getPlanStore: vi.fn(),
  getInspectionStore: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/plans/runtime", () => ({ getPlanStore: mocks.getPlanStore }));
vi.mock("@/lib/inspections/runtime", () => ({ getInspectionStore: mocks.getInspectionStore }));

import { GET } from "@/app/api/plans/[id]/inspections/route";
import { createMemoryInspectionStore } from "@/lib/inspections/store";

const qcHead = {
  id: "101",
  employeeCode: "TRW001",
  name: "สมศักดิ์ หัวหน้า QC",
  roles: ["QC_HEAD"] as const,
  department: "QC",
};

describe("GET /api/plans/[id]/inspections", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getCurrentUser.mockResolvedValue(qcHead);
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const req = new Request("http://localhost:3000/api/plans/1/inspections");
    const res = await GET(req, { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when plan does not exist", async () => {
    mocks.getPlanStore.mockReturnValue({
      getPlan: vi.fn().mockResolvedValue(null),
    });
    const req = new Request("http://localhost:3000/api/plans/999/inspections");
    const res = await GET(req, { params: Promise.resolve({ id: "999" }) });
    expect(res.status).toBe(404);
  });

  it("returns inspections list and summary for valid plan", async () => {
    const memStore = createMemoryInspectionStore();
    mocks.getPlanStore.mockReturnValue({
      getPlan: vi.fn().mockResolvedValue({ id: 1, planNo: "QP-2610-0001" }),
    });
    mocks.getInspectionStore.mockReturnValue(memStore);

    // Seed 1 pass and 1 failed rework inspection
    await memStore.claimUnit({
      id: "insp-1",
      planId: 1,
      workOrderId: "wo-1",
      role: "QC",
      serialPump: "SN-PASS-01",
      serialEntryMode: "MANUAL",
      entryMode: "LIVE",
      inspectorId: "101",
      inspectorName: "สมศักดิ์",
    });
    await memStore.submitResult({
      inspectionId: "insp-1",
      planId: 1,
      workOrderId: "wo-1",
      role: "QC",
      inspectorId: "101",
      result: "PASS",
      action: null,
      suggestedAction: null,
      answers: {
        1: { status: "NORMAL", remark: "OK", photos: [] },
      },
    });

    await memStore.claimUnit({
      id: "insp-2",
      planId: 1,
      workOrderId: "wo-1",
      role: "QC",
      serialPump: "SN-REWORK-02",
      serialEntryMode: "MANUAL",
      entryMode: "LIVE",
      inspectorId: "101",
      inspectorName: "สมศักดิ์",
    });
    await memStore.submitResult({
      inspectionId: "insp-2",
      planId: 1,
      workOrderId: "wo-1",
      role: "QC",
      inspectorId: "101",
      result: "NOT_PASSED",
      action: "REWORK",
      suggestedAction: "REWORK",
      answers: {
        1: {
          status: "FAIL",
          remark: "สีถลอก",
          photos: [],
          defects: [
            {
              defectId: 101,
              code: "DEF-101",
              nameTh: "สีถลอก",
              severity: "MAJOR",
              disposition: "REWORK",
            },
          ],
        },
      },
    });

    const req = new Request("http://localhost:3000/api/plans/1/inspections");
    const res = await GET(req, { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.summary).toEqual({
      passCount: 1,
      reworkCount: 1,
      rejectCount: 0,
      inProgressCount: 0,
    });
    expect(json.inspections).toHaveLength(2);
    expect(json.inspections[0].serialPump).toBe("SN-REWORK-02");
    expect(json.inspections[0].result).toBe("NOT_PASSED");
    expect(json.inspections[0].defectNames).toBe("สีถลอก");
    expect(json.inspections[1].serialPump).toBe("SN-PASS-01");
    expect(json.inspections[1].result).toBe("PASS");
  });
});

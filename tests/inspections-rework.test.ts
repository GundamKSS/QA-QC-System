import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  audit: vi.fn(),
  revalidatePath: vi.fn(),
  resolveActorId: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/audit", () => ({
  audit: mocks.audit,
  auditContext: () => ({ ip: "127.0.0.1", userAgent: "test-agent" }),
}));
vi.mock("@/lib/db/actor", () => ({ resolveActorId: mocks.resolveActorId }));
vi.mock("@/lib/db/config", () => ({ dbConfigured: () => true }));

import { GET as getRework, POST as postRework } from "@/app/api/inspections/[id]/rework/route";
import { setInspectionStoreForTesting } from "@/lib/inspections/runtime";
import { createMemoryInspectionStore } from "@/lib/inspections/store";
import type { StoredInspection, SubmitReworkInput } from "@/lib/inspections/types";

const qcInspector = {
  id: "201",
  employeeCode: "QC001",
  fullName: "นายตรวจ หนึ่ง",
  roles: ["QC_INSPECTOR"],
  mustChangePassword: false,
};

let memStore: ReturnType<typeof createMemoryInspectionStore>;

const sampleInspection: StoredInspection = {
  id: "insp-rework-1",
  planId: 10,
  workOrderId: "wo-1",
  role: "QC",
  cycleNo: 1,
  roundNo: 1,
  inspectionNo: 1,
  serialPump: "SN-PUMP-99",
  serialMotor: null,
  serialSupplier: null,
  serialEntryMode: "MANUAL",
  entryMode: "LIVE",
  inspectorId: "201",
  inspectorName: "นายตรวจ หนึ่ง",
  startedAt: new Date("2026-10-20T08:00:00Z"),
  submittedAt: new Date("2026-10-20T08:30:00Z"),
  result: "NOT_PASSED",
  action: "REWORK",
  suggestedAction: "REWORK",
  status: "COMPLETED",
  answers: {
    1: {
      status: "FAIL",
      defects: [
        {
          defectId: 101,
          code: "DEF101",
          nameTh: "สีไม่ผ่าน (ย้อย / ไม่เรียบ)",
          severity: "MAJOR",
          disposition: "REWORK",
        },
      ],
      photos: [
        {
          uri: "data:image/jpeg;base64,sample1",
          timestamp: "2026-10-20T08:15:00Z",
        },
      ],
    },
    2: {
      status: "NORMAL",
      photos: [],
    },
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue(qcInspector);
  mocks.resolveActorId.mockResolvedValue("201");

  memStore = createMemoryInspectionStore();
  setInspectionStoreForTesting(memStore);
});

describe("Rework Store Logic", () => {
  it("returns null for getReworkDetails when inspection is not in REWORK state", async () => {
    const details = await memStore.getReworkDetails("unknown-id");
    expect(details).toBeNull();
  });

  it("loads failed items and defects for an inspection marked as REWORK", async () => {
    // Seed sample inspection directly into memory store
    const storeWithSample = {
      ...memStore,
      async getReworkDetails(id: string) {
        if (id !== sampleInspection.id) return null;
        return {
          inspection: sampleInspection,
          planNo: "QP-2610-0010",
          modelCode: "XM-2050",
          description: "ปั๊มลมลูกสูบ",
          failedItems: [
            {
              itemId: 1,
              seq: 1,
              topicCode: "CHK-01",
              title: "สภาพสีผิวเคลือบ",
              videoRule: "NONE" as const,
              defects: sampleInspection.answers![1].defects!,
              photos: sampleInspection.answers![1].photos!,
              video: null,
              remark: null,
            },
          ],
        };
      },
    };
    setInspectionStoreForTesting(storeWithSample);

    const details = await storeWithSample.getReworkDetails("insp-rework-1");
    expect(details).not.toBeNull();
    expect(details?.failedItems).toHaveLength(1);
    expect(details?.failedItems[0].defects[0].nameTh).toBe("สีไม่ผ่าน (ย้อย / ไม่เรียบ)");
    expect(details?.failedItems[0].photos).toHaveLength(1);
  });
});

describe("GET /api/inspections/[id]/rework", () => {
  it("rejects unauthenticated requests with 401", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const req = new Request("http://localhost:3000/api/inspections/insp-1/rework");
    const res = await getRework(req, { params: Promise.resolve({ id: "insp-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when inspection details are not found", async () => {
    const req = new Request("http://localhost:3000/api/inspections/not-found/rework");
    const res = await getRework(req, { params: Promise.resolve({ id: "not-found" }) });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/inspections/[id]/rework", () => {
  it("validates answers payload and rejects empty submission with 422", async () => {
    const req = new Request("http://localhost:3000/api/inspections/insp-1/rework", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: {} }),
    });
    const res = await postRework(req, { params: Promise.resolve({ id: "insp-1" }) });
    expect(res.status).toBe(422);
  });

  it("submits rework successfully, produces round 2 with PASS, and writes audit", async () => {
    const customStore = {
      ...memStore,
      async submitRework(input: SubmitReworkInput, inspectorId: string) {
        return {
          kind: "saved" as const,
          inspection: {
            id: "insp-child-2",
            planId: 10,
            workOrderId: "wo-1",
            role: "QC" as const,
            cycleNo: 1,
            roundNo: 2,
            inspectionNo: 1,
            serialPump: "SN-PUMP-99",
            serialMotor: null,
            serialSupplier: null,
            serialEntryMode: "MANUAL" as const,
            entryMode: "LIVE" as const,
            inspectorId,
            startedAt: new Date(),
            submittedAt: new Date(),
            result: "PASS" as const,
            action: null,
            suggestedAction: null,
            parentInspectionId: input.parentInspectionId,
            status: "COMPLETED" as const,
          },
          qtyDone: 1,
          qtyNeed: 10,
        };
      },
    };
    setInspectionStoreForTesting(customStore);

    const req = new Request("http://localhost:3000/api/inspections/insp-rework-1/rework", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answers: {
          1: {
            status: "NORMAL",
            fixes: [{ defectId: 101, fixMethod: "พ่นสี", fixNote: "พ่นซ้ำ 2 รอบ" }],
            photos: [{ uri: "data:image/jpeg;base64,after-photo", timestamp: "2026-10-20T09:00:00Z" }],
          },
        },
      }),
    });

    const res = await postRework(req, { params: Promise.resolve({ id: "insp-rework-1" }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("done");
    expect(body.roundNo).toBe(2);
    expect(body.result).toBe("PASS");
    expect(body.action).toBeNull();
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "unit_inspection.rework",
        employeeCode: "QC001",
      }),
      expect.anything(),
    );
  });
});

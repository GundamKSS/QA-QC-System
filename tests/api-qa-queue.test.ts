import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  audit: vi.fn(),
  revalidatePath: vi.fn(),
  resolveActorId: vi.fn(),
  loadQaQueueData: vi.fn(),
  updatePlanAndModelAql: vi.fn(),
  acceptQaPlan: vi.fn(),
  assignQaInspectors: vi.fn(),
  confirmQaPlan: vi.fn(),
  returnQaUnitToQc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/audit", () => ({ audit: mocks.audit, auditContext: () => ({ ip: "127.0.0.1", userAgent: "test" }) }));
vi.mock("@/lib/db/actor", () => ({ resolveActorId: mocks.resolveActorId }));
vi.mock("@/lib/db/config", () => ({ dbConfigured: () => true }));
vi.mock("@/lib/qa/queue", () => ({
  loadQaQueueData: mocks.loadQaQueueData,
  updatePlanAndModelAql: mocks.updatePlanAndModelAql,
  acceptQaPlan: mocks.acceptQaPlan,
  assignQaInspectors: mocks.assignQaInspectors,
  confirmQaPlan: mocks.confirmQaPlan,
  returnQaUnitToQc: mocks.returnQaUnitToQc,
}));

import { GET, POST } from "@/app/api/qa-queue/route";

const qaHead = { id: "21", employeeCode: "TRW0021", fullName: "หัวหน้า QA", roles: ["QA_HEAD"], mustChangePassword: false };
const qaInspector = { id: "22", employeeCode: "TRW0022", fullName: "ผู้ตรวจ QA", roles: ["QA_INSPECTOR"], mustChangePassword: false };
const qcInspector = { id: "12", employeeCode: "TRW0012", fullName: "ผู้ตรวจ QC", roles: ["QC_INSPECTOR"], mustChangePassword: false };

describe("/api/qa-queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(qaHead);
    mocks.resolveActorId.mockResolvedValue("21");
  });

  it("GET returns 401 when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost:3000/api/qa-queue"));
    expect(res.status).toBe(401);
  });

  it("GET returns 403 for QC_INSPECTOR without QA access", async () => {
    mocks.getCurrentUser.mockResolvedValue(qcInspector);
    const res = await GET(new Request("http://localhost:3000/api/qa-queue"));
    expect(res.status).toBe(403);
  });

  it("GET returns queue payload with AQL and QA work order info", async () => {
    mocks.loadQaQueueData.mockResolvedValue({
      queue: [
        {
          id: 101,
          planNo: "QP-2611-0001",
          status: "QA_PENDING",
          modelId: 5,
          modelCode: "PP-21",
          brandName: "PUMA",
          lotQty: 42,
          qcRequired: 5,
          qcDoneTotal: 5,
          qcWorkOrderCount: 1,
          qcWorkOrderNos: ["QP-2611-0001-1"],
          aqlLevel: "NORMAL",
          aqlLevelLabel: "ปกติ",
          aqlCodeLetter: "D",
          hasAql: true,
          qaRequired: 8,
          qaDoneTotal: 0,
          qaWorkOrderId: "wo-qa-101",
          qaWorkOrderNo: "QP-2611-0001-QA",
          assignees: [],
          failedUnits: [],
        },
      ],
      inspectors: [],
      me: "21",
      isHead: true,
      pendingCount: 1,
      inProgressCount: 0,
      readyToConfirmCount: 0,
      reworkCount: 0,
      completedTodayCount: 0,
      missingAqlCount: 0,
    });

    const res = await GET(new Request("http://localhost:3000/api/qa-queue"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.queue[0].qaRequired).toBe(8);
    expect(body.queue[0].qaWorkOrderNo).toBe("QP-2611-0001-QA");
  });

  it("POST validates planId and aqlLevel (422)", async () => {
    const res = await POST(
      new Request("http://localhost:3000/api/qa-queue", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ planId: 101, aqlLevel: "WRONG" }),
      }),
    );
    expect(res.status).toBe(422);
  });

  it("POST updates AQL level, saves model default, and creates/syncs QA work order", async () => {
    mocks.updatePlanAndModelAql.mockResolvedValue({
      kind: "updated",
      planId: 101,
      planNo: "QP-2611-0001",
      modelId: 5,
      modelCode: "PP-21",
      aqlLevel: "REDUCED",
      aqlLevelLabel: "ผ่อนคลาย (Reduced)",
      codeLetter: "D",
      qaRequired: 3,
      qaWorkOrderId: "wo-qa-101",
      qaWorkOrderNo: "QP-2611-0001-QA",
    });

    const res = await POST(
      new Request("http://localhost:3000/api/qa-queue", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ planId: 101, aqlLevel: "REDUCED", saveAsModelDefault: true }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("done");
    expect(body.qaRequired).toBe(3);
    expect(body.qaWorkOrderNo).toBe("QP-2611-0001-QA");
    expect(mocks.audit).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/qa-queue");
  });

  it("POST action=accept allows Head QA to accept handed-over plan and forbids ordinary QA inspector", async () => {
    mocks.getCurrentUser.mockResolvedValue(qaInspector);
    const forbidden = await POST(
      new Request("http://localhost:3000/api/qa-queue", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ action: "accept", planId: 101 }),
      }),
    );
    expect(forbidden.status).toBe(403);

    mocks.getCurrentUser.mockResolvedValue(qaHead);
    mocks.acceptQaPlan.mockResolvedValue({
      kind: "accepted",
      planId: 101,
      planNo: "QP-2611-0001",
      status: "QA_IN_PROGRESS",
      qaWorkOrderId: "wo-qa-101",
      qaWorkOrderNo: "QP-2611-0001-QA",
    });

    const res = await POST(
      new Request("http://localhost:3000/api/qa-queue", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ action: "accept", planId: 101 }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("done");
    expect(body.qaWorkOrderNo).toBe("QP-2611-0001-QA");
  });

  it("POST action=assign allows Head QA to assign QA inspectors with targets", async () => {
    mocks.assignQaInspectors.mockResolvedValue({
      kind: "assigned",
      planId: 101,
      planNo: "QP-2611-0001",
      qaWorkOrderId: "wo-qa-101",
      qaWorkOrderNo: "QP-2611-0001-QA",
      assigneeIds: ["22", "23"],
    });

    const res = await POST(
      new Request("http://localhost:3000/api/qa-queue", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({
          action: "assign",
          planId: 101,
          assigneesJson: JSON.stringify([
            { userId: "22", targetQty: 4 },
            { userId: "23", targetQty: 4 },
          ]),
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("done");
    expect(body.assigneeIds).toEqual(["22", "23"]);
  });

  it("POST action=confirm allows Head QA to confirm and close the plan", async () => {
    mocks.confirmQaPlan.mockResolvedValue({
      kind: "confirmed",
      planId: 101,
      planNo: "QP-2611-0001",
      qaDoneTotal: 8,
      qaRequired: 8,
    });

    const res = await POST(
      new Request("http://localhost:3000/api/qa-queue", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({
          action: "confirm",
          planId: 101,
          remarks: "ผ่านเกณฑ์ AQL ครบถ้วน",
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("done");
    expect(body.qaDoneTotal).toBe(8);
  });

  it("POST action=return_to_qc sends failed unit back for targeted rework", async () => {
    mocks.returnQaUnitToQc.mockResolvedValue({
      kind: "returned",
      inspectionId: "ui-999",
      serialPump: "SN-001",
      planId: 101,
      planNo: "QP-2611-0001",
    });

    const res = await POST(
      new Request("http://localhost:3000/api/qa-queue", {
        method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({
          action: "return_to_qc",
          inspectionId: "ui-999",
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("done");
    expect(body.serialPump).toBe("SN-001");
  });
});

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

import { GET as getTemplate } from "@/app/api/inspections/template/route";
import { GET as getQuota } from "@/app/api/inspections/quota/route";
import { POST as postClaim } from "@/app/api/inspections/claim/route";
import { POST as postCancel } from "@/app/api/inspections/[id]/cancel/route";
import { POST as postSubmit } from "@/app/api/inspections/[id]/submit/route";
import { createMemoryInspectionStore } from "@/lib/inspections/store";
import { setInspectionStoreForTesting } from "@/lib/inspections/runtime";
import type { InspectionItem } from "@/lib/inspections/types";

const qcInspector = {
  id: "201",
  employeeCode: "QC001",
  fullName: "นายตรวจ หนึ่ง",
  roles: ["QC_INSPECTOR"],
  mustChangePassword: false,
};

const testItems: InspectionItem[] = [
  {
    id: 1,
    seq: 1,
    topicCode: "CHK-01",
    title: "ระดับน้ำมันเครื่อง",
    inputType: "PASS_FAIL",
    isRequired: true,
    videoRule: "NONE",
  },
  {
    id: 2,
    seq: 2,
    topicCode: "CHK-02",
    title: "เสียงและการสั่นสะเทือน",
    inputType: "PASS_FAIL",
    isRequired: true,
    videoRule: "ON_FAIL",
  },
];

let memStore: ReturnType<typeof createMemoryInspectionStore>;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue(qcInspector);
  mocks.resolveActorId.mockResolvedValue("201");

  memStore = createMemoryInspectionStore();
  memStore.seedTemplate(10, "QC", testItems);
  memStore.seedWorkOrder({
    id: "WO-TEST-1",
    planId: 10,
    qtyNeed: 5,
    qtyDone: 0,
  });
  setInspectionStoreForTesting(memStore);
});

describe("API /api/inspections — Access and Guards", () => {
  it("rejects signed-out callers with 401 and redirect to login", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const req = new Request("http://localhost:3000/api/inspections/template?planId=10");
    const res = await getTemplate(req);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ status: "error", redirectTo: "/login?next=%2Fjobs" });
  });

  it("rejects unauthorized roles (e.g. PURCHASING, PM) with 403", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...qcInspector, roles: ["PURCHASING"] });
    const req = new Request("http://localhost:3000/api/inspections/template?planId=10");
    const res = await getTemplate(req);
    expect(res.status).toBe(403);
  });

  it("blocks cross-origin POST mutations with 403", async () => {
    const req = new Request("http://localhost:3000/api/inspections/claim", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "sec-fetch-site": "cross-site",
      },
      body: JSON.stringify({ planId: 10, workOrderId: "WO-TEST-1", serialPump: "SN-001" }),
    });
    const res = await postClaim(req);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/inspections/template", () => {
  it("returns 422 if planId is missing or invalid", async () => {
    const req = new Request("http://localhost:3000/api/inspections/template?planId=abc", {
      headers: { "sec-fetch-site": "same-origin" },
    });
    const res = await getTemplate(req);
    expect(res.status).toBe(422);
  });

  it("returns checklist template data with private no-store headers", async () => {
    const req = new Request("http://localhost:3000/api/inspections/template?planId=10&role=QC", {
      headers: { "sec-fetch-site": "same-origin" },
    });
    const res = await getTemplate(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const data = await res.json();
    expect(data.items).toHaveLength(2);
    expect(data.items[0].title).toBe("ระดับน้ำมันเครื่อง");
  });
});

describe("GET /api/inspections/quota", () => {
  it("returns 422 if workOrderId is missing", async () => {
    const req = new Request("http://localhost:3000/api/inspections/quota", {
      headers: { "sec-fetch-site": "same-origin" },
    });
    const res = await getQuota(req);
    expect(res.status).toBe(422);
  });

  it("returns current work order quota and remaining count", async () => {
    const req = new Request("http://localhost:3000/api/inspections/quota?workOrderId=WO-TEST-1", {
      headers: { "sec-fetch-site": "same-origin" },
    });
    const res = await getQuota(req);
    expect(res.status).toBe(200);
    const quota = await res.json();
    expect(quota.qtyNeed).toBe(5);
    expect(quota.qtyDone).toBe(0);
    expect(quota.remaining).toBe(5);
  });
});

describe("POST /api/inspections/claim", () => {
  it("validates required fields", async () => {
    const req = new Request("http://localhost:3000/api/inspections/claim", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify({ planId: 10, workOrderId: "WO-TEST-1" }), // missing serialPump
    });
    const res = await postClaim(req);
    expect(res.status).toBe(422);
  });

  it("claims unit, deducts quota, audits, and triggers revalidation", async () => {
    const req = new Request("http://localhost:3000/api/inspections/claim", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify({
        planId: 10,
        workOrderId: "WO-TEST-1",
        serialPump: "SN-2611-001",
      }),
    });
    const res = await postClaim(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("claimed");
    expect(json.quota.remaining).toBe(4);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "unit_inspection.claim",
        employeeCode: "QC001",
      }),
      expect.anything(),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/plans/10");
  });

  it("returns 409 conflict when serial is already claimed by another inspector", async () => {
    // Inspector A claims
    const reqA = new Request("http://localhost:3000/api/inspections/claim", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify({
        planId: 10,
        workOrderId: "WO-TEST-1",
        serialPump: "SN-2611-001",
      }),
    });
    await postClaim(reqA);

    // Inspector B tries to claim same serial
    mocks.getCurrentUser.mockResolvedValue({
      id: "202",
      employeeCode: "QC002",
      fullName: "นางตรวจ สอง",
      roles: ["QC_INSPECTOR"],
      mustChangePassword: false,
    });
    mocks.resolveActorId.mockResolvedValue("202");

    const reqB = new Request("http://localhost:3000/api/inspections/claim", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify({
        planId: 10,
        workOrderId: "WO-TEST-1",
        serialPump: "SN-2611-001",
      }),
    });
    const resB = await postClaim(reqB);
    expect(resB.status).toBe(409);
    const err = await resB.json();
    expect(err.message).toContain("เครื่องนี้กำลังตรวจโดย");
  });
});

describe("POST /api/inspections/[id]/cancel", () => {
  it("cancels an active claim and restores the pool quota", async () => {
    // 1. Claim
    const claimReq = new Request("http://localhost:3000/api/inspections/claim", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify({
        planId: 10,
        workOrderId: "WO-TEST-1",
        serialPump: "SN-2611-001",
      }),
    });
    const claimRes = await postClaim(claimReq);
    const { inspection } = await claimRes.json();

    // 2. Cancel
    const cancelReq = new Request(`http://localhost:3000/api/inspections/${inspection.id}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
    });
    const cancelRes = await postCancel(cancelReq, { params: Promise.resolve({ id: inspection.id }) });
    expect(cancelRes.status).toBe(200);
    const cancelJson = await cancelRes.json();
    expect(cancelJson.status).toBe("cancelled");
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "unit_inspection.cancel_claim" }),
      expect.anything(),
    );

    // 3. Verify quota restored
    const quota = await memStore.getQuota("WO-TEST-1");
    expect(quota?.remaining).toBe(5);
  });
});

describe("POST /api/inspections/[id]/submit", () => {
  it("enforces validation of unanswered items and rejects with 422", async () => {
    // 1. Claim
    const claimReq = new Request("http://localhost:3000/api/inspections/claim", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify({
        planId: 10,
        workOrderId: "WO-TEST-1",
        serialPump: "SN-2611-001",
      }),
    });
    const claimRes = await postClaim(claimReq);
    const { inspection } = await claimRes.json();

    // 2. Submit with only item 1 answered
    const submitReq = new Request(`http://localhost:3000/api/inspections/${inspection.id}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify({
        planId: 10,
        workOrderId: "WO-TEST-1",
        answers: {
          1: { status: "NORMAL" },
        },
      }),
    });
    const submitRes = await postSubmit(submitReq, { params: Promise.resolve({ id: inspection.id }) });
    expect(submitRes.status).toBe(422);
    const err = await submitRes.json();
    expect(err.message).toContain("ยังตอบไม่ครบ");
    expect(err.missingItemIds).toContain(2);
  });

  it("submits complete inspection, calculates PASS result, increments qtyDone and audits", async () => {
    // 1. Claim
    const claimReq = new Request("http://localhost:3000/api/inspections/claim", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify({
        planId: 10,
        workOrderId: "WO-TEST-1",
        serialPump: "SN-2611-001",
      }),
    });
    const claimRes = await postClaim(claimReq);
    const { inspection } = await claimRes.json();

    // 2. Submit complete PASS
    const submitReq = new Request(`http://localhost:3000/api/inspections/${inspection.id}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify({
        planId: 10,
        workOrderId: "WO-TEST-1",
        answers: {
          1: { status: "NORMAL" },
          2: { status: "NORMAL" },
        },
      }),
    });
    const submitRes = await postSubmit(submitReq, { params: Promise.resolve({ id: inspection.id }) });
    expect(submitRes.status).toBe(200);
    const doneJson = await submitRes.json();
    expect(doneJson.status).toBe("done");
    expect(doneJson.evaluation.result).toBe("PASS");
    expect(doneJson.qtyDone).toBe(1);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "unit_inspection.submit",
        after: expect.objectContaining({ result: "PASS", qtyDone: 1 }),
      }),
      expect.anything(),
    );
  });
});

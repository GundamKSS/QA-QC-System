import { describe, expect, it } from "vitest";
import {
  cancelUnitClaim,
  claimUnitInspection,
  loadInspectionTemplate,
  loadWorkOrderQuota,
  submitUnitInspection,
} from "@/lib/inspections/service";
import { createMemoryInspectionStore } from "@/lib/inspections/store";
import type { InspectionItem } from "@/lib/inspections/types";

describe("inspections service", () => {
  const sampleItems: InspectionItem[] = [
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

  it("loads inspection template and quota", async () => {
    const store = createMemoryInspectionStore();
    store.seedTemplate(100, "QC", sampleItems);
    store.seedWorkOrder({
      id: "WO-001",
      planId: 100,
      woNo: "WO-2611-0001",
      qtyNeed: 10,
      qtyDone: 2,
    });

    const template = await loadInspectionTemplate(store, 100, "QC");
    expect(template).not.toBeNull();
    expect(template?.items).toHaveLength(2);

    const quota = await loadWorkOrderQuota(store, "WO-001");
    expect(quota).not.toBeNull();
    expect(quota?.qtyNeed).toBe(10);
    expect(quota?.qtyDone).toBe(2);
    expect(quota?.remaining).toBe(8);
    expect(quota?.activeClaims).toHaveLength(0);
  });

  it("handles unit claim, live quota deduction, and resume", async () => {
    const store = createMemoryInspectionStore();
    store.seedTemplate(100, "QC", sampleItems);
    store.seedWorkOrder({
      id: "WO-001",
      planId: 100,
      woNo: "WO-2611-0001",
      qtyNeed: 2,
      qtyDone: 0,
    });

    const ctxA = { actorId: "USER-A", actorName: "Inspector A" };
    const ctxB = { actorId: "USER-B", actorName: "Inspector B" };

    // 1. Inspector A claims unit 1
    const claim1 = await claimUnitInspection(
      store,
      {
        planId: 100,
        workOrderId: "WO-001",
        serialPump: "SN-2611-001",
      },
      ctxA,
    );
    expect(claim1.kind).toBe("claimed");
    if (claim1.kind === "claimed") {
      expect(claim1.quota.remaining).toBe(1); // 2 need - 0 done - 1 claimed = 1 remaining
      expect(claim1.quota.activeClaims).toHaveLength(1);
      expect(claim1.inspection.serialPump).toBe("SN-2611-001");
    }

    // 2. Inspector A calls claim again with same serial -> resumes claim
    const resume = await claimUnitInspection(
      store,
      {
        planId: 100,
        workOrderId: "WO-001",
        serialPump: "SN-2611-001",
      },
      ctxA,
    );
    expect(resume.kind).toBe("resumed");

    // 3. Inspector B tries to claim the same serial -> conflict
    const collision = await claimUnitInspection(
      store,
      {
        planId: 100,
        workOrderId: "WO-001",
        serialPump: "SN-2611-001",
      },
      ctxB,
    );
    expect(collision.kind).toBe("claimed_by_other");
    if (collision.kind === "claimed_by_other") {
      expect(collision.inspectorName).toBe("Inspector A");
    }

    // 4. Inspector B claims unit 2 -> remaining becomes 0
    const claim2 = await claimUnitInspection(
      store,
      {
        planId: 100,
        workOrderId: "WO-001",
        serialPump: "SN-2611-002",
      },
      ctxB,
    );
    expect(claim2.kind).toBe("claimed");
    if (claim2.kind === "claimed") {
      expect(claim2.quota.remaining).toBe(0);
    }

    // 5. Inspector A tries to claim unit 3 -> quota full
    const claim3 = await claimUnitInspection(
      store,
      {
        planId: 100,
        workOrderId: "WO-001",
        serialPump: "SN-2611-003",
      },
      ctxA,
    );
    expect(claim3.kind).toBe("quota_full");
  });

  it("handles cancelling a claim and restoring quota", async () => {
    const store = createMemoryInspectionStore();
    store.seedTemplate(100, "QC", sampleItems);
    store.seedWorkOrder({
      id: "WO-001",
      planId: 100,
      woNo: "WO-2611-0001",
      qtyNeed: 5,
      qtyDone: 0,
    });

    const ctxA = { actorId: "USER-A", actorName: "Inspector A" };
    const ctxB = { actorId: "USER-B", actorName: "Inspector B" };

    const claim = await claimUnitInspection(
      store,
      {
        planId: 100,
        workOrderId: "WO-001",
        serialPump: "SN-001",
      },
      ctxA,
    );
    expect(claim.kind).toBe("claimed");
    const inspId = (claim as { inspection: { id: string } }).inspection.id;

    // Another inspector cannot cancel Inspector A's claim
    const cancelByOther = await cancelUnitClaim(store, inspId, ctxB);
    expect(cancelByOther).toBe(false);

    // Inspector A cancels their own claim
    const cancelSuccess = await cancelUnitClaim(store, inspId, ctxA);
    expect(cancelSuccess).toBe(true);

    // Quota should be restored
    const quota = await loadWorkOrderQuota(store, "WO-001");
    expect(quota?.remaining).toBe(5);
    expect(quota?.activeClaims).toHaveLength(0);
  });

  it("validates required answers and enforces BR-04 result evaluation", async () => {
    const store = createMemoryInspectionStore();
    store.seedTemplate(100, "QC", sampleItems);
    store.seedWorkOrder({
      id: "WO-001",
      planId: 100,
      woNo: "WO-2611-0001",
      qtyNeed: 2,
      qtyDone: 0,
    });

    const ctx = { actorId: "USER-A", actorName: "Inspector A" };
    const claim = await claimUnitInspection(
      store,
      {
        planId: 100,
        workOrderId: "WO-001",
        serialPump: "SN-001",
      },
      ctx,
    );
    const inspId = (claim as { inspection: { id: string } }).inspection.id;

    // 1. Submit incomplete answers
    const submitIncomplete = await submitUnitInspection(
      store,
      {
        inspectionId: inspId,
        workOrderId: "WO-001",
        planId: 100,
        answers: {
          1: { status: "NORMAL" },
        },
      },
      ctx,
    );
    expect(submitIncomplete.kind).toBe("incomplete");

    // 2. Submit NOT_PASSED without a decision -> requires decision
    const submitNoDecision = await submitUnitInspection(
      store,
      {
        inspectionId: inspId,
        workOrderId: "WO-001",
        planId: 100,
        answers: {
          1: { status: "NORMAL" },
          2: {
            status: "FAIL",
            defects: [
              {
                defectId: 99,
                code: "CRIT_DEF",
                nameTh: "เสื้อสูบแตก",
                severity: "CRITICAL",
                disposition: "REJECT",
              },
            ],
            photos: [{ uri: "photo1.jpg", timestamp: new Date().toISOString() }],
            video: { uri: "vid1.mp4", durationSeconds: 5 },
          },
        },
        decision: null,
      },
      ctx,
    );
    expect(submitNoDecision.kind).toBe("decision_required");

    // 3. Inspector chooses REWORK on Critical defect (แนวทางที่ 1) -> accepted and saved
    const submitValidRework = await submitUnitInspection(
      store,
      {
        inspectionId: inspId,
        workOrderId: "WO-001",
        planId: 100,
        answers: {
          1: { status: "NORMAL" },
          2: {
            status: "FAIL",
            defects: [
              {
                defectId: 99,
                code: "CRIT_DEF",
                nameTh: "เสื้อสูบแตก",
                severity: "CRITICAL",
                disposition: "REJECT",
              },
            ],
            photos: [{ uri: "photo1.jpg", timestamp: new Date().toISOString() }],
            video: { uri: "vid1.mp4", durationSeconds: 5 },
          },
        },
        decision: "REWORK",
      },
      ctx,
    );
    expect(submitValidRework.kind).toBe("saved");
    if (submitValidRework.kind === "saved") {
      expect(submitValidRework.inspection.action).toBe("REWORK");
      expect(submitValidRework.evaluation.result).toBe("NOT_PASSED");
      expect(submitValidRework.qtyDone).toBe(1);
    }
  });
});

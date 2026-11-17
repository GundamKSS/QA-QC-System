import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadJobs: vi.fn(),
}));

vi.mock("@/lib/plans/jobs", () => ({
  loadJobs: mocks.loadJobs,
}));

import { lookupScan } from "@/lib/scan/service";
import { isJobCompletedForUser } from "@/lib/scan/rules";
import type { SessionUser } from "@/lib/auth/types";
import type { JobItem } from "@/lib/plans/jobs";

const inspectorUser: SessionUser = {
  id: "42",
  employeeCode: "TRW0042",
  fullName: "สมชาย ผู้ตรวจ",
  roles: ["QC_INSPECTOR"],
  mustChangePassword: false,
};

const sampleJob: JobItem = {
  id: "job-101",
  planId: 1,
  woNo: "QP-2610-001-01",
  type: "QC",
  calledQty: 15,
  calledDate: "2026-10-22",
  qtyNeed: 15,
  qtyDone: 3,
  status: "IN_PROGRESS",
  modelCode: "PP-23P",
  description: "ปั๊มสายพาน 5HP",
  docType: "PO",
  docNo: "WO1274/69",
  vendorName: null,
  assignees: [
    {
      userId: "42",
      name: "สมชาย ผู้ตรวจ",
      targetQty: 5,
      doneQty: 3,
      reworkPending: 0,
    },
  ],
  reworkCount: 0,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.loadJobs.mockResolvedValue({
    view: "mine",
    me: "42",
    jobs: [sampleJob],
    reworks: [],
  });
});

describe("isJobCompletedForUser rule", () => {
  it("marks as completed when the entire job hits qtyNeed", () => {
    expect(isJobCompletedForUser({ qtyNeed: 10, qtyDone: 10 }, "42")).toBe(true);
    expect(isJobCompletedForUser({ qtyNeed: 10, qtyDone: 11 }, "42")).toBe(true);
    expect(isJobCompletedForUser({ qtyNeed: 10, qtyDone: 8 }, "42")).toBe(false);
  });

  it("marks as completed when individual user hits targetQty and has 0 rework", () => {
    const job = {
      qtyNeed: 20,
      qtyDone: 5,
      assignees: [{ userId: "42", name: "สมชาย", targetQty: 5, doneQty: 5, reworkPending: 0 }],
    };
    expect(isJobCompletedForUser(job, "42")).toBe(true);
  });

  it("does not mark as completed when user has not reached targetQty or has pending rework", () => {
    const jobIncomplete = {
      qtyNeed: 20,
      qtyDone: 4,
      assignees: [{ userId: "42", name: "สมชาย", targetQty: 5, doneQty: 4, reworkPending: 0 }],
    };
    expect(isJobCompletedForUser(jobIncomplete, "42")).toBe(false);

    const jobWithRework = {
      qtyNeed: 20,
      qtyDone: 5,
      assignees: [{ userId: "42", name: "สมชาย", targetQty: 5, doneQty: 5, reworkPending: 1 }],
    };
    expect(isJobCompletedForUser(jobWithRework, "42")).toBe(false);
  });
});

describe("lookupScan — Service logic with quota check", () => {
  it("automatically matches in-house pump QR when user still has quota remaining", async () => {
    const rawQr =
      "5x3 HP 260L. (PP-23P) + MOTOR|FG1004-000675|WC:WMT-409|MODEL:PP-23P|FIC:FG-MT-00156|Date:2569/10/22|WO1274/69|SN69/00014-15";

    const result = await lookupScan(inspectorUser, rawQr);

    expect(result.kind).toBe("INTERNAL_PUMP");
    if (result.kind === "INTERNAL_PUMP") {
      expect(result.parsed.woNo).toBe("WO1274/69");
      expect(result.parsed.modelCode).toBe("PP-23P");
      expect(result.parsed.serial).toBe("SN69/00014-15");
      expect(result.matchedJob).not.toBeNull();
      expect(result.matchedJob?.id).toBe("job-101");
      expect(result.availableJobs).toHaveLength(1);
    }
  });

  it("does NOT match or include in availableJobs if user already completed their assigned quota", async () => {
    const completedJob: JobItem = {
      ...sampleJob,
      assignees: [
        {
          userId: "42",
          name: "สมชาย ผู้ตรวจ",
          targetQty: 5,
          doneQty: 5,
          reworkPending: 0,
        },
      ],
    };

    mocks.loadJobs.mockResolvedValue({
      view: "mine",
      me: "42",
      jobs: [completedJob],
      reworks: [],
    });

    const rawQr =
      "5x3 HP 260L. (PP-23P) + MOTOR|FG1004-000675|WC:WMT-409|MODEL:PP-23P|FIC:FG-MT-00156|Date:2569/10/22|WO1274/69|SN69/00014-15";

    const result = await lookupScan(inspectorUser, rawQr);

    expect(result.kind).toBe("INTERNAL_PUMP");
    if (result.kind === "INTERNAL_PUMP") {
      // Must not match to prevent checking more!
      expect(result.matchedJob).toBeNull();
      expect(result.completedNote).toContain("คุณตรวจครบตามยอดที่ได้รับมอบหมายในใบงาน QP-2610-001-01 แล้ว");
      expect(result.availableJobs).toHaveLength(0);
    }
  });

  it("handles in-house pump QR when no matching work order is found", async () => {
    const rawQr =
      "5x3 HP 260L. (PP-23P) + MOTOR|FG1004-000675|WC:WMT-409|MODEL:PP-23P|FIC:FG-MT-00156|Date:2569/10/22|WO9999/69|SN69/00099-15";

    const result = await lookupScan(inspectorUser, rawQr);

    expect(result.kind).toBe("INTERNAL_PUMP");
    if (result.kind === "INTERNAL_PUMP") {
      expect(result.parsed.woNo).toBe("WO9999/69");
      expect(result.matchedJob).toBeNull();
      expect(result.availableJobs).toHaveLength(1);
    }
  });

  it("handles generic / imported barcode and provides only incomplete active jobs for selection", async () => {
    const rawBarcode = "SN-2611-001";

    const result = await lookupScan(inspectorUser, rawBarcode);

    expect(result.kind).toBe("GENERIC_OR_IMPORTED");
    if (result.kind === "GENERIC_OR_IMPORTED") {
      expect(result.serial).toBe("SN-2611-001");
      expect(result.matchedJob).toBeNull();
      expect(result.availableJobs).toHaveLength(1);
      expect(result.availableJobs[0].id).toBe("job-101");
    }
  });

  it("keeps Dev users in spectator mode without matching or reserving jobs", async () => {
    const devUser: SessionUser = {
      id: "2",
      employeeCode: "DEV",
      fullName: "dev gundam",
      roles: ["QC_INSPECTOR", "ADMIN"],
      mustChangePassword: false,
    };

    const rawQr =
      "5x3 HP 260L. (PP-23P) + MOTOR|FG1004-000675|WC:WMT-409|MODEL:PP-23P|FIC:FG-MT-00156|Date:2569/10/22|WO1274/69|SN69/00014-15";

    const result = await lookupScan(devUser, rawQr);

    expect(result.kind).toBe("INTERNAL_PUMP");
    if (result.kind === "INTERNAL_PUMP") {
      expect(result.matchedJob).toBeNull();
      expect(result.completedNote).toContain("ผู้ใช้ Dev มีสิทธิ์เข้าดูข้อมูลเท่านั้น");
      expect(result.availableJobs).toHaveLength(0);
    }
  });
});

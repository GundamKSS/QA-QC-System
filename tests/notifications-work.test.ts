import { describe, expect, it } from "vitest";
import type { JobCard } from "@/lib/plans/store";
import { workNotifications } from "@/lib/notifications/work";

export function job(overrides: Partial<JobCard> = {}): JobCard {
  return {
    id: "00000000-0000-0000-0000-000000000001", planId: 1, seq: 1, woNo: "QP-2610-0001-1", type: "QC",
    calledQty: 200, calledDate: "2026-10-20", qtyNeed: 20, qtyDone: 0, status: "IN_PROGRESS", remarks: null,
    cancelReason: null, assignees: [{ slot: 1, userId: "11", name: "ผู้ตรวจ", code: "F0011" }],
    createdAt: new Date("2026-10-20T03:00:00Z"), planNo: "QP-2610-0001", modelCode: "XM2525", description: null,
    docType: "INVOICE", docNo: "INV-A", vendorName: "Vendor", ...overrides,
  };
}

describe("workNotifications", () => {
  it("only includes work still requiring action, including a call-in with Need 0", () => {
    const items = workNotifications([
      job(), job({ id: "fix", type: "CALLIN_FIX", qtyNeed: 0 }),
      job({ id: "sent", status: "SUBMITTED" }), job({ id: "closed", status: "CLOSED" }), job({ id: "cancelled", status: "CANCELLED" }),
    ]);
    expect(items.map((item) => item.workOrderId)).toEqual(["00000000-0000-0000-0000-000000000001", "fix"]);
    expect(items[1].body).toContain("ไม่ต้องตรวจในแอป");
    expect(items[0]).toMatchObject({ kind: "assigned", createdAt: "2026-10-20T03:00:00.000Z", href: "/jobs?view=mine&notification=00000000-0000-0000-0000-000000000001%3AIN_PROGRESS#work-order-00000000-0000-0000-0000-000000000001" });
  });

  it("puts returned orders first, then oldest call-ins, and leaves the source order intact", () => {
    const jobs = [job({ id: "recent", calledDate: "2026-10-21" }), job({ id: "old", calledDate: "2026-10-19" }), job({ id: "returned", status: "RETURNED" })];
    expect(workNotifications(jobs).map((item) => item.workOrderId)).toEqual(["returned", "old", "recent"]);
    expect(jobs[0].id).toBe("recent");
  });

  it("gives a returned order a new read identity and never directs an inspector to a protected plan", () => {
    const [assigned] = workNotifications([job()]);
    const [returned] = workNotifications([job({ status: "RETURNED" })]);
    expect(returned.id).not.toBe(assigned.id);
    expect(returned).toMatchObject({ kind: "returned", status: "RETURNED" });
    expect(returned.href).not.toBe(assigned.href);
    expect(new URL(returned.href, "http://localhost").hash).toBe(new URL(assigned.href, "http://localhost").hash);
    expect(returned.title).toContain("ตีกลับ");
  });
});

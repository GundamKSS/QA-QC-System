import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resolveActorId: vi.fn(), dbConfigured: vi.fn(), getPlanStore: vi.fn() }));
vi.mock("@/lib/db/actor", () => ({ resolveActorId: mocks.resolveActorId }));
vi.mock("@/lib/db/config", () => ({ dbConfigured: mocks.dbConfigured }));
vi.mock("@/lib/plans/runtime", () => ({ getPlanStore: mocks.getPlanStore }));

import type { SessionUser } from "@/lib/auth/types";
import { isHistoryHead, loadHistory } from "@/lib/plans/history";
import { HISTORY_PAGE_SIZE } from "@/lib/plans/history-query";
import { openPlan } from "@/lib/plans/service";
import { createMemoryPlanStore, DEMO_MASTER, type JobCard } from "@/lib/plans/store";
import { cancelWorkOrder, openWorkOrder } from "@/lib/plans/work-orders";

const NOW = new Date("2026-10-21T03:00:00Z");
const actor = { actorId: "7", now: NOW };
const INSPECTORS = [
  { id: "11", code: "TRW1001", name: "สมชาย ใจดี", isActive: true },
  { id: "12", code: "TRW9001", name: "ปรีชา ทองดี", isActive: true },
  { id: "13", code: "PUMA3001", name: "อนุชา แก้วมณี", isActive: true },
];

const user = (id: string, roles: SessionUser["roles"]): SessionUser => ({ id, employeeCode: `TRW${id}`, fullName: `คน ${id}`, roles, mustChangePassword: false });
const head = user("21", ["QC_HEAD"]);

/** Same plan as tests/plans-history.test.ts: call-ins -1 (cancelled, 19 Oct), -2 (sent, 20 Oct), -3 (in progress, 21 Oct), -4 (closed, 1 Jul). */
async function history() {
  const store = createMemoryPlanStore({ ...DEMO_MASTER, inspectors: INSPECTORS });
  await openPlan(store, { docType: "INVOICE", docNo: "INV-A", vendorId: 1, modelId: 1, lotQty: 500, invoiceDate: "2026-10-01", expectedSkuCount: 1 }, actor);
  const open = async (calledQty: number, calledDate: string, assignees: string[]) => {
    const result = await openWorkOrder(store, { planId: 1, calledQty, calledDate, assignees, remarks: null }, actor);
    if (result.kind !== "opened") throw new Error("not opened");
    return result.id;
  };
  const cancelled = await open(50, "2026-10-19", ["11", "12"]);
  const sent = await open(100, "2026-10-20", ["11", "12"]);
  await open(100, "2026-10-21", ["12", "13"]);
  const old = await open(100, "2026-07-01", ["11", "13"]);
  await cancelWorkOrder(store, { workOrderId: cancelled, reason: "กรอกผิด" }, actor);
  store.setStatus(sent, "SUBMITTED");
  store.setStatus(old, "CLOSED");
  return store;
}

const lastDigits = (payload: { rows: { woNo: string }[] }) => payload.rows.map((row) => row.woNo.slice(-1));

beforeEach(() => {
  vi.resetAllMocks();
  // `historyToday()` reads the clock; freeze it so "the last 30 days" does not drift away from the fixture.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mocks.dbConfigured.mockReturnValue(false);
});
afterEach(() => vi.useRealTimers());

describe("isHistoryHead", () => {
  it("is QC Head and QA Head only", () => {
    expect(isHistoryHead(["QC_HEAD"])).toBe(true);
    expect(isHistoryHead(["QA_HEAD"])).toBe(true);
    expect(isHistoryHead(["QA_INSPECTOR", "QC_HEAD"])).toBe(true);
    for (const role of ["QC_INSPECTOR", "QA_INSPECTOR", "ADMIN", "PM", "MASTER_ADMIN"] as const) expect(isHistoryHead([role])).toBe(false);
  });
});

describe("loadHistory — with the in-memory store", () => {
  beforeEach(async () => {
    mocks.getPlanStore.mockReturnValue(await history());
  });

  it("gives a QC Head everyone's history of the last 30 days, newest call-in first, without looking them up", async () => {
    const payload = await loadHistory(head, {});
    expect(payload).toMatchObject({ view: "all", me: null, page: 1, total: 2 });
    expect(lastDigits(payload)).toEqual(["2", "1"]);
    expect(mocks.resolveActorId).not.toHaveBeenCalled();
  });

  it("reaches further back, or narrows by kind, on request", async () => {
    expect(lastDigits(await loadHistory(head, { range: "all" }))).toEqual(["2", "1", "4"]);
    expect(lastDigits(await loadHistory(head, { range: "all", kind: "done" }))).toEqual(["2", "4"]);
    expect(lastDigits(await loadHistory(head, { kind: "cancelled" }))).toEqual(["1"]);
  });

  it("lets a QC Head or QA Head narrow to their own work orders", async () => {
    for (const role of ["QC_HEAD", "QA_HEAD"] as const) {
      const payload = await loadHistory(user("13", [role]), { view: "mine", range: "all" });
      expect(payload).toMatchObject({ view: "mine", me: "13", total: 1 });
      expect(lastDigits(payload)).toEqual(["4"]);
    }
  });

  it("gives everyone else their own history only, whatever the address says", async () => {
    expect(lastDigits(await loadHistory(user("11", ["QC_INSPECTOR"]), { range: "all" }))).toEqual(["2", "1", "4"]);
    expect(lastDigits(await loadHistory(user("12", ["QC_INSPECTOR"]), { range: "all", view: "mine" }))).toEqual(["2", "1"]);
    const other = await loadHistory(user("13", ["QA_INSPECTOR"]), { range: "all", view: "all" });
    expect(other).toMatchObject({ view: "mine", me: "13" });
    expect(lastDigits(other)).toEqual(["4"]);
    expect(mocks.resolveActorId).not.toHaveBeenCalled();
  });

  it("asks for the person's users.id when a database is configured", async () => {
    mocks.dbConfigured.mockReturnValue(true);
    mocks.resolveActorId.mockResolvedValue("11");
    const payload = await loadHistory(user("u-qc-1001", ["QC_INSPECTOR"]), { range: "all" });
    expect(mocks.resolveActorId).toHaveBeenCalledWith("u-qc-1001");
    expect(payload.me).toBe("11");
    expect(lastDigits(payload)).toEqual(["2", "1", "4"]);
  });

  it("gives someone with no users row an empty page, without asking the store", async () => {
    mocks.dbConfigured.mockReturnValue(true);
    mocks.resolveActorId.mockResolvedValue(null);
    const store = await history();
    const spy = vi.spyOn(store, "jobHistory");
    mocks.getPlanStore.mockReturnValue(store);
    expect(await loadHistory(user("u-x", ["QC_INSPECTOR"]), {})).toEqual({ view: "mine", me: null, page: 1, total: 0, rows: [] });
    expect(await loadHistory(head, { view: "mine" })).toEqual({ view: "mine", me: null, page: 1, total: 0, rows: [] });
    expect(spy).not.toHaveBeenCalled();
  });

  it("still gives a QC Head everyone's history when they have no users row", async () => {
    mocks.dbConfigured.mockReturnValue(true);
    mocks.resolveActorId.mockResolvedValue(null);
    const payload = await loadHistory(head, {});
    expect(payload).toMatchObject({ view: "all", me: null, total: 2 });
  });
});

describe("loadHistory — with a stand-in store", () => {
  const jobHistory = vi.fn();
  beforeEach(() => {
    jobHistory.mockReset().mockResolvedValue({ rows: [], total: 120 });
    mocks.getPlanStore.mockReturnValue({ jobHistory });
  });

  it("passes the page, kind and date range to the store and reports the page it asked for", async () => {
    const payload = await loadHistory(head, { kind: "done", range: "90", page: "3" });
    expect(jobHistory).toHaveBeenCalledWith({ kind: "done", fromDate: "2026-07-23", page: 3, pageSize: HISTORY_PAGE_SIZE, userId: null });
    expect(payload).toMatchObject({ page: 3, total: 120 });
  });

  it("falls back to the defaults for values it does not know", async () => {
    await loadHistory(head, { kind: "toString", range: "x", page: "-4" });
    expect(jobHistory).toHaveBeenCalledWith({ kind: "all", fromDate: "2026-09-21", page: 1, pageSize: HISTORY_PAGE_SIZE, userId: null });
  });

  it("sends only what the screen draws — no remarks, plan number, description, creation time or employee codes", async () => {
    const card: JobCard = {
      id: "9",
      planId: 4,
      seq: 2,
      woNo: "QP-2610-0004-2",
      type: "QC",
      calledQty: 40,
      calledDate: "2026-10-19",
      qtyNeed: 12,
      qtyDone: 0,
      status: "CANCELLED",
      remarks: "ความลับในหมายเหตุ",
      cancelReason: "กรอกผิด",
      assignees: [{ slot: 1, userId: "11", name: "สมชาย ใจดี", code: "TRW1001" }],
      createdAt: new Date("2026-10-19T01:00:00Z"),
      planNo: "QP-2610-0004",
      modelCode: "XM2525",
      description: "ปั๊มลมลับ",
      docType: "PO",
      docNo: "PO-7",
      vendorName: null,
    };
    jobHistory.mockResolvedValue({ rows: [card], total: 1 });
    const payload = await loadHistory(head, {});
    expect(payload.rows).toEqual([
      {
        id: "9",
        planId: 4,
        woNo: "QP-2610-0004-2",
        type: "QC",
        calledQty: 40,
        calledDate: "2026-10-19",
        qtyNeed: 12,
        qtyDone: 0,
        status: "CANCELLED",
        cancelReason: "กรอกผิด",
        modelCode: "XM2525",
        docType: "PO",
        docNo: "PO-7",
        vendorName: null,
        assignees: [{ userId: "11", name: "สมชาย ใจดี" }],
      },
    ]);
    const text = JSON.stringify(payload);
    for (const hidden of ["ความลับ", "TRW1001", "QP-2610-0004\"", "ปั๊มลมลับ", "createdAt", "remarks"]) expect(text).not.toContain(hidden);
  });

  it("lets the database's errors through for the route to answer", async () => {
    const outage = new Error("down");
    jobHistory.mockRejectedValue(outage);
    await expect(loadHistory(head, {})).rejects.toBe(outage);
    mocks.dbConfigured.mockReturnValue(true);
    mocks.resolveActorId.mockRejectedValue(outage);
    await expect(loadHistory(user("u-x", ["QC_INSPECTOR"]), {})).rejects.toBe(outage);
  });
});

import { describe, expect, it } from "vitest";
import { cancelPlan, openPlan } from "@/lib/plans/service";
import { historyHref, HISTORY_PAGE_SIZE, historyQuery, parseHistoryQuery } from "@/lib/plans/history-query";
import { createMemoryPlanStore, DEMO_MASTER } from "@/lib/plans/store";
import { cancelWorkOrder, openWorkOrder } from "@/lib/plans/work-orders";

const NOW = new Date("2026-10-21T03:00:00Z");
const actor = { actorId: "7", now: NOW };
const INSPECTORS = [
  { id: "11", code: "TRW1001", name: "สมชาย ใจดี", isActive: true },
  { id: "12", code: "TRW9001", name: "ปรีชา ทองดี", isActive: true },
  { id: "13", code: "PUMA3001", name: "อนุชา แก้วมณี", isActive: true },
];
const base = { page: 1, pageSize: HISTORY_PAGE_SIZE, fromDate: null as string | null };

/** Plan lot 500 with call-ins -1 (cancelled), -2 (sent), -3 (in progress, someone else's), -4 (old, closed). */
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

describe("jobHistory (docs/18)", () => {
  it("lists everything that is no longer in anyone's hands, newest call-in first", async () => {
    const store = await history();
    const result = await store.jobHistory({ ...base, userId: null, kind: "all" });
    expect(result.rows.map((row) => [row.woNo, row.status])).toEqual([
      ["QP-2610-0001-2", "SUBMITTED"], ["QP-2610-0001-1", "CANCELLED"], ["QP-2610-0001-4", "CLOSED"],
    ]);
    expect(result.total).toBe(3);
    expect(result.rows[1]).toMatchObject({ cancelReason: "กรอกผิด", planNo: "QP-2610-0001", modelCode: "XM2525" });
  });

  it("filters by person, kind and date range, and pages", async () => {
    const store = await history();
    const woNos = async (filter: Partial<Parameters<typeof store.jobHistory>[0]>) =>
      (await store.jobHistory({ ...base, userId: null, kind: "all", ...filter })).rows.map((row) => row.woNo.slice(-1));
    expect(await woNos({ userId: "13" })).toEqual(["4"]);
    expect(await woNos({ userId: "12" })).toEqual(["2", "1"]);
    expect(await woNos({ kind: "done" })).toEqual(["2", "4"]);
    expect(await woNos({ kind: "cancelled" })).toEqual(["1"]);
    expect(await woNos({ fromDate: "2026-09-21" })).toEqual(["2", "1"]);
    expect(await store.jobHistory({ ...base, userId: null, kind: "all", page: 2, pageSize: 2 })).toMatchObject({ total: 3, rows: [{ woNo: "QP-2610-0001-4" }] });
    expect((await store.jobHistory({ ...base, userId: "99", kind: "all" })).total).toBe(0);
  });

  it("shows work orders of a cancelled plan as cancelled (BR-13: sent ones are cancelled with the plan; closed ones stay)", async () => {
    const store = await history();
    await cancelPlan(store, { planId: 1, reason: "ยกเลิกแผน", isHead: true }, actor);
    const result = await store.jobHistory({ ...base, userId: "12", kind: "cancelled" });
    expect(result.rows.map((row) => row.woNo.slice(-1)).sort()).toEqual(["1", "2", "3"]);
  });
});

describe("parseHistoryQuery", () => {
  it("defaults to everything in the last 30 days and ignores bad values", () => {
    const { values, filter } = parseHistoryQuery({}, "2026-10-21");
    expect(values).toEqual({ kind: "all", range: "30", mine: false, page: 1 });
    expect(filter).toEqual({ kind: "all", fromDate: "2026-09-21", page: 1, pageSize: HISTORY_PAGE_SIZE });
    expect(parseHistoryQuery({ kind: "toString", range: "x", page: "-4" }, "2026-10-21").values).toEqual(values);
    expect(parseHistoryQuery({ range: "all", kind: "cancelled", view: "mine", page: "3" }, "2026-10-21")).toMatchObject({
      values: { kind: "cancelled", range: "all", mine: true, page: 3 }, filter: { fromDate: null },
    });
  });

  it("builds short links", () => {
    const { values } = parseHistoryQuery({ kind: "done", view: "mine", page: "2" }, "2026-10-21");
    expect(historyHref(values)).toBe("/history?kind=done&view=mine&page=2");
    expect(historyHref(values, { page: 1, mine: false, kind: "all" })).toBe("/history");
  });

  it("writes the query string that the page and GET /api/history both read, leaving defaults out", () => {
    const { values } = parseHistoryQuery({ kind: "done", view: "mine", page: "2" }, "2026-10-21");
    expect(historyQuery(values)).toBe("kind=done&view=mine&page=2");
    expect(historyQuery({ ...values, range: "all" })).toBe("kind=done&range=all&view=mine&page=2");
    expect(historyQuery({ kind: "all", range: "30", mine: false, page: 1 })).toBe("");
    // what the API reads back is what the page parsed
    const query = Object.fromEntries(new URLSearchParams(historyQuery({ ...values, range: "90" })));
    expect(parseHistoryQuery(query, "2026-10-21").values).toEqual({ ...values, range: "90" });
  });
});

import { describe, expect, it } from "vitest";
import { cancelPlan, openPlan } from "./service";
import { createMemoryPlanStore, DEMO_MASTER } from "./store";
import { cancelWorkOrder, openWorkOrder, parseAssignees, parseCount, setWorkOrderAssignees, workOrderErrorMessage } from "./work-orders";

const NOW = new Date("2026-10-20T03:00:00Z"); // 10:00 on 20 Oct 2026 in Bangkok
const actor = { actorId: "7", now: NOW };
const INSPECTORS = [
  { id: "11", code: "TRW1001", name: "สมชาย ใจดี", isActive: true },
  { id: "12", code: "TRW9001", name: "ปรีชา ทองดี", isActive: true },
  { id: "13", code: "PUMA3001", name: "อนุชา แก้วมณี", isActive: true },
];

/** Lot 500 at 10% → QC 50 (the example the user confirmed in Meetings C and D). */
async function lot500() {
  const store = createMemoryPlanStore({ ...DEMO_MASTER, inspectors: INSPECTORS });
  await openPlan(store, { docType: "INVOICE", docNo: "INV-A", vendorId: 1, modelId: 1, lotQty: 500, invoiceDate: "2026-10-01", expectedSkuCount: 1 }, actor);
  return store;
}
const callIn = (calledQty: number | null, over: Partial<Parameters<typeof openWorkOrder>[1]> = {}) => ({
  planId: 1, calledQty, calledDate: "2026-10-20", assignees: ["11", "12"], remarks: null, ...over,
});
/** Serials SN<from>…SN<from+count-1>, the units an inspector submits. */
const units = (from: number, count: number) => Array.from({ length: count }, (_, index) => `SN${String(from + index).padStart(3, "0")}`);
const on = (calledDate: string) => ({ calledDate });

describe("openWorkOrder (FR-JOB-00/01, BR-02)", () => {
  it("follows the lot-500 example: Need 50 whatever is called, then 50 − True, then เรียกเข้าแก้ไข 0", async () => {
    const store = await lot500();
    const first = await openWorkOrder(store, callIn(200, on("2026-10-18")), actor);
    expect(first).toMatchObject({ kind: "opened", woNo: "QP-2610-0001-1", type: "QC", need: 50, assigneeIds: ["11", "12"] });
    if (first.kind === "opened") expect(store.recordQcDone(first.id, units(1, 30))).toBe(30);

    expect(await openWorkOrder(store, callIn(19, on("2026-10-19")), actor)).toEqual({ kind: "invalid", errors: { calledQty: "below_need" }, remaining: 300, minimum: 20 });
    const second = await openWorkOrder(store, callIn(100, on("2026-10-19")), actor);
    expect(second).toMatchObject({ kind: "opened", woNo: "QP-2610-0001-2", type: "QC", need: 20 });
    // SN001 was already inspected on -1: it doesn't count twice (docs/17 §1.3).
    if (second.kind === "opened") expect(store.recordQcDone(second.id, ["sn 001", ...units(31, 20)])).toBe(20);

    expect(await openWorkOrder(store, callIn(200), actor)).toMatchObject({ kind: "opened", woNo: "QP-2610-0001-3", type: "CALLIN_FIX", need: 0 });
    expect(await store.getPlan(1)).toMatchObject({ lotCalledTotal: 500, qcDoneTotal: 50 });
    expect((await store.workOrdersOf(1)).map((wo) => [wo.woNo, wo.status, wo.qtyDone])).toEqual([
      ["QP-2610-0001-1", "IN_PROGRESS", 30], ["QP-2610-0001-2", "IN_PROGRESS", 20], ["QP-2610-0001-3", "IN_PROGRESS", 0],
    ]);
    expect(await openWorkOrder(store, callIn(1, on("2026-10-17")), actor)).toEqual({ kind: "invalid", errors: { calledQty: "lot_fully_called" }, remaining: 0, minimum: 0 });
  });

  it("allows one work order per plan per call-in date; a cancelled one frees the date", async () => {
    const store = await lot500();
    const first = await openWorkOrder(store, callIn(100), actor);
    expect(await openWorkOrder(store, callIn(100), actor)).toEqual({ kind: "invalid", errors: { calledDate: "same_day" }, sameDayWoNo: "QP-2610-0001-1" });
    if (first.kind === "opened") await cancelWorkOrder(store, { workOrderId: first.id, reason: "เปิดผิด" }, actor);
    expect(await openWorkOrder(store, callIn(100), actor)).toMatchObject({ kind: "opened", woNo: "QP-2610-0001-2" });
  });

  it("marks untouched work orders ไม่สำเร็จ once 10% is inspected and the whole lot is called (docs/17 §1.5)", async () => {
    const store = await lot500();
    const idle = await openWorkOrder(store, callIn(200, on("2026-10-18")), actor);
    const worked = await openWorkOrder(store, callIn(200, on("2026-10-19")), actor);
    if (idle.kind !== "opened" || worked.kind !== "opened") throw new Error("not opened");
    // Nothing inspected on -1, so -2 still needs the whole 50.
    expect(worked.need).toBe(50);
    store.recordQcDone(worked.id, units(1, 50));
    // 10% reached but 100 not called yet: -1 stays open.
    expect((await store.getWorkOrder(idle.id))?.status).toBe("IN_PROGRESS");

    expect(await openWorkOrder(store, callIn(100), actor)).toMatchObject({ type: "CALLIN_FIX", need: 0 });
    expect((await store.workOrdersOf(1)).map((wo) => [wo.woNo, wo.status])).toEqual([
      ["QP-2610-0001-1", "FAILED"], ["QP-2610-0001-2", "IN_PROGRESS"], ["QP-2610-0001-3", "IN_PROGRESS"],
    ]);
    // History only: out of the counts, the workload and the active jobs.
    expect(await store.getPlan(1)).toMatchObject({ qcDoneTotal: 50, lotCalledTotal: 500 });
    expect((await store.jobs("11", { activeOnly: true })).map((job) => job.woNo)).toEqual(["QP-2610-0001-2", "QP-2610-0001-3"]);
    expect((await store.listInspectors()).find((person) => person.id === "11")?.openWorkOrders).toBe(2);
    expect(await cancelWorkOrder(store, { workOrderId: idle.id, reason: "x" }, actor)).toEqual({ kind: "locked", block: "status" });
  });

  it("settles when the last inspection, not the last call-in, completes the lot", async () => {
    const store = await lot500();
    const idle = await openWorkOrder(store, callIn(300, on("2026-10-18")), actor);
    const worked = await openWorkOrder(store, callIn(200, on("2026-10-19")), actor);
    if (idle.kind !== "opened" || worked.kind !== "opened") throw new Error("not opened");
    store.recordQcDone(worked.id, units(1, 49));
    expect((await store.getWorkOrder(idle.id))?.status).toBe("IN_PROGRESS");
    store.recordQcDone(worked.id, units(50, 1));
    expect((await store.getWorkOrder(idle.id))?.status).toBe("FAILED");
  });

  it("moves the plan OPEN → ASSIGNED once, sets the main QC and shows the work order in both people's jobs", async () => {
    const store = await lot500();
    await openWorkOrder(store, callIn(200, { assignees: ["12", "11", "13"], calledDate: "2026-10-19" }), actor);
    await openWorkOrder(store, callIn(50), actor);
    expect(await store.getPlan(1)).toMatchObject({ status: "ASSIGNED", responsibleQc: "ปรีชา ทองดี", lotCalledTotal: 250 });
    expect((await store.planHistory(1)).map((entry) => entry.to)).toEqual(["OPEN", "ASSIGNED"]);
    expect((await store.jobs("13")).map((job) => job.woNo)).toEqual(["QP-2610-0001-1"]);
    expect((await store.jobs("11")).map((job) => job.woNo)).toEqual(["QP-2610-0001-1", "QP-2610-0001-2"]);
    expect((await store.jobs(null))[0]).toMatchObject({ planNo: "QP-2610-0001", modelCode: "XM2525", docNo: "INV-A", vendorName: "Zhejiang Hongyou" });
    expect((await store.workOrdersOf(1))[0].assignees.map((person) => [person.slot, person.name])).toEqual([[1, "ปรีชา ทองดี"], [2, "สมชาย ใจดี"], [3, "อนุชา แก้วมณี"]]);
    // By name (ปรีชา, สมชาย, อนุชา) with the work orders each still holds.
    expect((await store.listInspectors()).map((person) => [person.code, person.openWorkOrders])).toEqual([["TRW9001", 2], ["TRW1001", 2], ["PUMA3001", 1]]);
  });

  it("checks the form before touching the plan", async () => {
    const store = await lot500();
    expect(await openWorkOrder(store, callIn(null, { calledDate: "", assignees: ["11"] }), actor)).toEqual({
      kind: "invalid", errors: { calledQty: "required", calledDate: "required", assignees: "first_two_required" },
    });
    expect(await openWorkOrder(store, callIn(Number.NaN, { calledDate: "2026-10-21", assignees: ["11", "11"] }), actor)).toEqual({
      kind: "invalid", errors: { calledQty: "invalid_qty", calledDate: "future", assignees: "duplicate" },
    });
    expect(await openWorkOrder(store, callIn(50, { assignees: ["11", "12", "13", "14", "15", "16"] }), actor)).toMatchObject({ errors: { assignees: "too_many" } });
    expect(await openWorkOrder(store, callIn(501), actor)).toEqual({ kind: "invalid", errors: { calledQty: "exceeds_remaining" }, remaining: 500, minimum: 50 });
    // Back-dating is allowed (W3).
    expect(await openWorkOrder(store, callIn(50, { calledDate: "2026-09-01" }), actor)).toMatchObject({ kind: "opened" });
  });

  it("refuses people who are no longer active QC Inspectors, and closed or missing plans", async () => {
    const store = await lot500();
    store.setInspectorActive("12", false);
    expect(await openWorkOrder(store, callIn(50), actor)).toEqual({ kind: "invalid", errors: { assignees: "unavailable" }, unavailable: ["12"] });
    expect(await openWorkOrder(store, callIn(50, { assignees: ["11", "99"] }), actor)).toMatchObject({ unavailable: ["99"] });
    expect(await openWorkOrder(store, callIn(50, { planId: 9 }), actor)).toEqual({ kind: "plan_not_found" });
    await cancelPlan(store, { planId: 1, reason: "ทดสอบ", isHead: true }, actor);
    expect(await openWorkOrder(store, callIn(50, { assignees: ["11", "13"] }), actor)).toEqual({ kind: "plan_closed" });
  });
});

describe("assignees and cancel (W4)", () => {
  it("changes people while open, keeping 2–5", async () => {
    const store = await lot500();
    const opened = await openWorkOrder(store, callIn(100), actor);
    if (opened.kind !== "opened") throw new Error("not opened");
    expect(await setWorkOrderAssignees(store, { workOrderId: opened.id, assignees: ["13"] }, actor)).toEqual({ kind: "invalid", error: "first_two_required" });
    expect(await setWorkOrderAssignees(store, { workOrderId: opened.id, assignees: ["13", "11"] }, actor)).toEqual({
      kind: "saved", planId: 1, woNo: "QP-2610-0001-1", before: ["11", "12"],
    });
    expect((await store.getWorkOrder(opened.id))?.assignees.map((person) => person.userId)).toEqual(["13", "11"]);
    expect(await setWorkOrderAssignees(store, { workOrderId: "nope", assignees: ["13", "11"] }, actor)).toEqual({ kind: "not_found" });
  });

  it("cancels with a reason, returns the quantity to the lot and reopens the plan when none is left", async () => {
    const store = await lot500();
    const opened = await openWorkOrder(store, callIn(200), actor);
    if (opened.kind !== "opened") throw new Error("not opened");
    expect(await cancelWorkOrder(store, { workOrderId: opened.id, reason: " " }, actor)).toEqual({ kind: "reason_required" });
    expect(await cancelWorkOrder(store, { workOrderId: opened.id, reason: "กรอกจำนวนผิด" }, actor)).toEqual({
      kind: "cancelled", planId: 1, woNo: "QP-2610-0001-1", calledQty: 200,
    });
    expect(await store.getPlan(1)).toMatchObject({ status: "OPEN", lotCalledTotal: 0 });
    expect((await store.planHistory(1)).at(-1)).toMatchObject({ from: "ASSIGNED", to: "OPEN", reason: "กรอกจำนวนผิด" });
    expect(await store.jobs(null)).toEqual([]);
    // The number isn't reused: the next call-in is -2.
    expect(await openWorkOrder(store, callIn(150), actor)).toMatchObject({ woNo: "QP-2610-0001-2", need: 50 });
  });

  it("won't cancel or edit once results exist or the work order is closed", async () => {
    const store = await lot500();
    const opened = await openWorkOrder(store, callIn(200), actor);
    if (opened.kind !== "opened") throw new Error("not opened");
    store.recordQcDone(opened.id, units(1, 3));
    expect(await cancelWorkOrder(store, { workOrderId: opened.id, reason: "x" }, actor)).toEqual({ kind: "locked", block: "has_results" });
    await cancelPlan(store, { planId: 1, reason: "ยกเลิกแผน", isHead: true }, actor);
    expect((await store.getWorkOrder(opened.id))?.status).toBe("CANCELLED");
    expect(await setWorkOrderAssignees(store, { workOrderId: opened.id, assignees: ["11", "13"] }, actor)).toEqual({ kind: "locked" });
  });
});

describe("form helpers", () => {
  it("reads the five slots and counts", () => {
    const form = new Map([["assignee1", " 11 "], ["assignee2", "12"], ["assignee3", ""]]);
    expect(parseAssignees((key) => form.get(key) ?? null)).toEqual(["11", "12", null, null, null]);
    expect([parseCount("1,200"), parseCount(""), parseCount("2.5")]).toEqual([1200, null, Number.NaN]);
    expect(workOrderErrorMessage("calledQty", "exceeds_remaining", { remaining: 1300 })).toBe("เรียกได้ไม่เกิน 1,300 (คงเหลือของล็อต)");
    expect(workOrderErrorMessage("calledQty", "below_need", { minimum: 50 })).toBe("ต้องเรียกเข้าอย่างน้อย 50 (Need)");
    expect(workOrderErrorMessage("calledDate", "same_day", { sameDayWoNo: "QP-2610-0001-1" })).toContain("QP-2610-0001-1");
    expect(workOrderErrorMessage("assignees", "unavailable", { names: ["ปรีชา"] })).toContain("ปรีชา");
  });
});

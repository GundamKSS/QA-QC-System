import { describe, expect, it } from "vitest";
import type { InspectionStore } from "@/lib/inspections/store";
import { cancelPlan, openPlan, setPlanVendor, setWaitingGoods, submitPlanToQa, type OpenPlanInput } from "@/lib/plans/service";
import { createMemoryPlanStore, DEMO_MASTER } from "@/lib/plans/store";

const NOW = new Date("2026-10-20T03:00:00Z"); // 10:00 on 20 Oct 2026 in Bangkok
const actor = { actorId: "7", now: NOW };

const invoice = (over: Partial<OpenPlanInput> = {}): OpenPlanInput => ({
  docType: "INVOICE",
  docNo: "INV-A",
  vendorId: 1,
  modelId: 1,
  lotQty: 350,
  invoiceDate: "2026-10-01",
  expectedSkuCount: 3,
  ...over,
});

const setup = (seed: Parameters<typeof createMemoryPlanStore>[0] = DEMO_MASTER) => createMemoryPlanStore(seed);

describe("openPlan", () => {
  it("opens the first plan of an Invoice with QC 10%, the 90-day deadline and QP-YYMM-0001", async () => {
    const store = setup();
    const result = await openPlan(store, invoice(), actor);
    expect(result).toEqual({ kind: "opened", planId: 1, planNo: "QP-2610-0001", headerReused: false, qcRequired: 35, productionWoNo: null });
    const plan = await store.getPlan(1);
    expect(plan).toMatchObject({
      status: "OPEN",
      productionWoNo: null,
      lotQty: 350,
      qcPercent: 10,
      qcRequired: 35,
      description: "ปั๊มลมโรตารี่ 1/4HP 25L",
      openedBy: "7",
      doc: { docNo: "INV-A", vendorName: "Zhejiang Hongyou", origin: "IMPORTED", invoiceDate: "2026-10-01", qcDeadline: "2026-12-30", expectedSkuCount: 3, planCount: 1 },
    });
    expect(store.history).toEqual([{ planId: 1, from: null, to: "OPEN", by: "7", at: expect.any(Date), reason: null }]);
  });

  it("refuses the same Invoice + Model and points at the existing plan (AC FR-PLAN-04)", async () => {
    const store = setup();
    await openPlan(store, invoice(), actor);
    const again = await openPlan(store, invoice({ docNo: "  inv-a ", lotQty: 10 }), actor);
    expect(again).toMatchObject({ kind: "duplicate", planId: 1, planNo: "QP-2610-0001" });
  });

  it("reuses the Invoice header for another Model and ignores a different header", async () => {
    const store = setup();
    await openPlan(store, invoice(), actor);
    const second = await openPlan(store, invoice({ modelId: 2, invoiceDate: "2026-09-01", expectedSkuCount: 9, lotQty: 80 }), actor);
    expect(second).toMatchObject({ kind: "opened", planNo: "QP-2610-0002", headerReused: true, qcRequired: 8 });
    expect((await store.getPlan(2))?.doc).toMatchObject({ id: 1, invoiceDate: "2026-10-01", expectedSkuCount: 3, planCount: 2 });
  });

  it("does not need the header again once the Invoice exists", async () => {
    const store = setup();
    await openPlan(store, invoice(), actor);
    const second = await openPlan(store, invoice({ modelId: 2, invoiceDate: null, expectedSkuCount: null }), actor);
    expect(second.kind).toBe("opened");
  });

  it("keys a document by its number only: the same Invoice keeps its own vendor (db/013)", async () => {
    const store = setup();
    await openPlan(store, invoice(), actor);
    const other = await openPlan(store, invoice({ vendorId: 2, modelId: 2 }), actor);
    expect(other).toMatchObject({ kind: "opened", headerReused: true });
    expect((await store.getPlan(2))?.doc).toMatchObject({ vendorId: 1, vendorName: "Zhejiang Hongyou", planCount: 2 });
    expect(await openPlan(store, invoice({ vendorId: 2 }), actor)).toMatchObject({ kind: "duplicate", planNo: "QP-2610-0001" });
  });

  it("refuses to open a plan without a vendor (user 11 Nov 2026), but an existing document keeps its own", async () => {
    const store = setup();
    expect(await openPlan(store, invoice({ vendorId: null }), actor)).toEqual({ kind: "invalid", errors: { vendorId: "required" } });
    expect(await openPlan(store, invoice(), actor)).toMatchObject({ kind: "opened" });
    expect(await openPlan(store, invoice({ vendorId: null, modelId: 2 }), actor)).toMatchObject({ kind: "opened", headerReused: true });
  });

  it("the QC Head can still change the vendor later and every plan of the Invoice follows (user 23 Oct 2026)", async () => {
    const store = setup();
    expect(await openPlan(store, invoice(), actor)).toMatchObject({ kind: "opened" });
    await openPlan(store, invoice({ modelId: 2 }), actor);
    expect(await setPlanVendor(store, { planId: 1, vendorId: null }, actor)).toMatchObject({ kind: "saved", before: 1, after: null });
    expect((await store.getPlan(1))?.doc).toMatchObject({ vendorId: null, vendorName: null });
    const page = { page: 1, pageSize: 10 };
    expect((await store.listPlans({ ...page, vendorId: "none" })).total).toBe(2);

    expect(await setPlanVendor(store, { planId: 2, vendorId: 2 }, actor)).toEqual({
      kind: "saved", docId: 1, docNo: "INV-A", before: null, after: 2, planNos: ["QP-2610-0001", "QP-2610-0002"],
    });
    expect((await store.getPlan(1))?.doc.vendorName).toBe("Taizhou Aipu");
    expect((await store.listPlans({ ...page, vendorId: 2 })).total).toBe(2);
    expect(await setPlanVendor(store, { planId: 1, vendorId: 1 }, actor)).toMatchObject({ before: 2, after: 1 });
    expect(await setPlanVendor(store, { planId: 1, vendorId: null }, actor)).toMatchObject({ kind: "saved", after: null });
    expect(await setPlanVendor(store, { planId: 1, vendorId: 99 }, actor)).toEqual({ kind: "vendor_not_found" });
    expect(await setPlanVendor(store, { planId: 9, vendorId: 1 }, actor)).toEqual({ kind: "not_found" });
    await cancelPlan(store, { planId: 1, reason: "ทดสอบ", isHead: true }, actor);
    expect(await setPlanVendor(store, { planId: 1, vendorId: 1 }, actor)).toEqual({ kind: "plan_cancelled" });
  });

  it("restarts the run number every Thai month", async () => {
    const store = setup();
    await openPlan(store, invoice(), { actorId: "7", now: new Date("2026-10-31T16:59:00Z") });
    const november = await openPlan(store, invoice({ modelId: 2 }), { actorId: "7", now: new Date("2026-10-31T17:00:00Z") });
    expect(november).toMatchObject({ planNo: "QP-2611-0001" });
  });

  it("pins the % in force when the plan is opened", async () => {
    const store = setup({ ...DEMO_MASTER, qcPercent: 15 });
    expect(await openPlan(store, invoice(), actor)).toMatchObject({ qcRequired: 53 });
    store.setQcPercent(10);
    expect((await store.getPlan(1))?.qcPercent).toBe(15);
  });

  it("opens a PO plan for the own factory with its department and no deadline", async () => {
    const store = setup();
    const result = await openPlan(store, { docType: "PO", docNo: "po 408/1234", vendorId: 3, modelId: 3, lotQty: 5, department: "408", docDate: "2026-10-19" }, actor);
    expect(result).toMatchObject({ kind: "opened", qcRequired: 3, productionWoNo: "PO 408/1234" });
    expect((await store.getPlan(1))?.doc).toMatchObject({ origin: "DOMESTIC", docNoNormalized: "PO 408/1234", department: "408", qcDeadline: null, invoiceDate: null });
  });

  it("keeps a scanned sticker's WO on the plan itself, normalised like the document number (FR-PLAN-05)", async () => {
    const store = setup();
    await openPlan(store, { docType: "PO", docNo: " wo1274/69 ", vendorId: 3, modelId: 3, lotQty: 15, department: "409", docDate: "2026-10-22" }, actor);
    const plan = await store.getPlan(1);
    expect(plan).toMatchObject({ productionWoNo: "WO1274/69", planNo: "QP-2610-0001", doc: { docNo: "wo1274/69", docNoNormalized: "WO1274/69" } });
  });

  it("reports every field problem at once", async () => {
    const store = setup();
    const result = await openPlan(store, { docType: "", docNo: " ", vendorId: null, modelId: 99, lotQty: 0, receiptDate: "2026-02-30" }, actor);
    expect(result).toEqual({
      kind: "invalid",
      errors: { docType: "required", docNo: "required", vendorId: "required", lotQty: "invalid", receiptDate: "invalid", modelId: "not_found" },
    });
  });

  it("requires the Invoice header on the first plan and a known department on a PO", async () => {
    const store = setup();
    expect(await openPlan(store, invoice({ invoiceDate: "" }), actor)).toEqual({
      kind: "invalid",
      errors: { invoiceDate: "required" },
    });
    expect(await openPlan(store, { docType: "PO", docNo: "1", vendorId: 3, modelId: 3, lotQty: 5, department: "500" }, actor)).toEqual({
      kind: "invalid",
      errors: { department: "invalid" },
    });
  });

  it("refuses disabled master rows", async () => {
    const store = setup({
      vendors: [{ ...DEMO_MASTER.vendors[0], isActive: false }],
      models: [{ ...DEMO_MASTER.models[0], isActive: false }],
    });
    expect(await openPlan(store, invoice(), actor)).toEqual({ kind: "invalid", errors: { vendorId: "inactive", modelId: "inactive" } });
  });
});

describe("lookupReceiptDoc", () => {
  it("says new, found (with its vendor and plans) or incomplete — the vendor isn't part of the key", async () => {
    const { lookupReceiptDoc } = await import("@/lib/plans/service");
    const store = setup();
    expect(await lookupReceiptDoc(store, { docType: "INVOICE", docNo: "" })).toEqual({ kind: "incomplete" });
    expect(await lookupReceiptDoc(store, { docType: "INVOICE", docNo: " inv-a" })).toEqual({ kind: "new", docNoNormalized: "INV-A" });
    await openPlan(store, invoice(), actor);
    expect(await lookupReceiptDoc(store, { docType: "INVOICE", docNo: "INV-A " })).toEqual({
      kind: "found",
      docNoNormalized: "INV-A",
      header: { invoiceDate: "2026-10-01", docDate: null, expectedSkuCount: 3, department: null, qcDeadline: "2026-12-30", remarks: null },
      vendorId: 1,
      vendorName: "Zhejiang Hongyou",
      plans: [{ id: 1, planNo: "QP-2610-0001", modelId: 1, modelCode: "XM2525" }],
    });
    expect(await lookupReceiptDoc(store, { docType: "PO", docNo: "INV-A" })).toMatchObject({ kind: "new" });
  });
});

/** Three plans: INV-A × XM2525 (vendor 1), INV-A × OL-1550 (vendor 1), PO 408/1 × PP-32 (vendor 3). */
async function threePlans() {
  const store = setup();
  await openPlan(store, invoice(), actor);
  await openPlan(store, invoice({ modelId: 2, lotQty: 80 }), actor);
  await openPlan(store, { docType: "PO", docNo: "408/1", vendorId: 3, modelId: 3, lotQty: 5, department: "408" }, actor);
  return store;
}
const page = { page: 1, pageSize: 50 };

describe("listPlans (docs/15 §2)", () => {
  it("lists live plans newest first with what the table shows", async () => {
    const store = await threePlans();
    const { rows, total } = await store.listPlans(page);
    expect(total).toBe(3);
    expect(rows.map((row) => row.planNo)).toEqual(["QP-2610-0003", "QP-2610-0002", "QP-2610-0001"]);
    expect(rows[2]).toMatchObject({ docType: "INVOICE", docNo: "INV-A", vendorName: "Zhejiang Hongyou", modelCode: "XM2525", pumpType: "Rotary", lotQty: 350, qcDoneTotal: 0, qcRequired: 35, qcDeadline: "2026-12-30" });
    expect(rows[0]).toMatchObject({ docType: "PO", qcDeadline: null, qcRequired: 3 });
  });

  it("searches, filters, sorts and pages", async () => {
    const store = await threePlans();
    const codes = async (filter: Parameters<typeof store.listPlans>[0]) => (await store.listPlans(filter)).rows.map((row) => row.modelCode);
    expect(await codes({ ...page, q: "ol-15" })).toEqual(["OL-1550"]);
    expect(await codes({ ...page, q: "hongyou" })).toEqual(["OL-1550", "XM2525"]);
    expect(await codes({ ...page, vendorId: 3 })).toEqual(["PP-32"]);
    expect(await codes({ ...page, pumpType: "Rotary" })).toEqual(["XM2525"]);
    expect(await codes({ ...page, sort: "plan_no" })).toEqual(["XM2525", "OL-1550", "PP-32"]);
    // Nearest 90-day deadline first; PO (no deadline) last.
    expect((await codes({ ...page, sort: "deadline" })).at(-1)).toBe("PP-32");
    expect(await store.listPlans({ page: 2, pageSize: 2 })).toMatchObject({ total: 3, rows: [{ planNo: "QP-2610-0001" }] });
  });

  it("filters by the Thai opening date", async () => {
    const store = await threePlans();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
    expect((await store.listPlans({ ...page, from: today, to: today })).total).toBe(3);
    expect((await store.listPlans({ ...page, to: "2000-01-01" })).total).toBe(0);
  });
});

describe("cancelPlan (BR-13)", () => {
  it("needs a reason, cancels with history, hides the plan and frees the Model for a new plan", async () => {
    const store = await threePlans();
    expect(await cancelPlan(store, { planId: 1, reason: "  ", isHead: false }, actor)).toEqual({ kind: "reason_required" });
    expect(await cancelPlan(store, { planId: 1, reason: "x".repeat(401), isHead: false }, actor)).toEqual({ kind: "reason_too_long" });
    expect(await cancelPlan(store, { planId: 99, reason: "กรอกผิด", isHead: false }, actor)).toEqual({ kind: "not_found" });

    expect(await cancelPlan(store, { planId: 1, reason: " กรอกจำนวนผิด ", isHead: false }, actor)).toEqual({ kind: "cancelled", planNo: "QP-2610-0001", from: "OPEN" });
    expect(await store.getPlan(1)).toMatchObject({ status: "CANCELLED", cancelReason: "กรอกจำนวนผิด", cancelledAt: expect.any(Date) });
    expect(await store.planHistory(1)).toEqual([
      { from: null, to: "OPEN", at: expect.any(Date), by: "7", reason: null },
      { from: "OPEN", to: "CANCELLED", at: expect.any(Date), by: "7", reason: "กรอกจำนวนผิด" },
    ]);

    expect((await store.listPlans(page)).rows.map((row) => row.planNo)).not.toContain("QP-2610-0001");
    expect((await store.listPlans({ ...page, statuses: ["CANCELLED"] })).rows.map((row) => row.planNo)).toEqual(["QP-2610-0001"]);
    expect(await cancelPlan(store, { planId: 1, reason: "again", isHead: true }, actor)).toEqual({ kind: "blocked", block: "status" });

    // BR-01 ignores cancelled plans: the same Invoice + Model opens again with the next number.
    expect(await openPlan(store, invoice(), actor)).toMatchObject({ kind: "opened", planNo: "QP-2610-0004", headerReused: true });
  });

  it("reports a plan that changed status since the page loaded", async () => {
    const store = await threePlans();
    expect(await store.cancelPlan(1, { from: "ASSIGNED", by: "7", reason: "x" })).toBe(false);
    expect((await store.getPlan(1))?.status).toBe("OPEN");
  });
});

describe("setWaitingGoods (FR-PLAN-17)", () => {
  it("flags and unflags live plans only", async () => {
    const store = await threePlans();
    expect(await setWaitingGoods(store, { planId: 3, value: true }, actor)).toEqual({ kind: "saved", planNo: "QP-2610-0003", before: false });
    expect((await store.getPlan(3))?.waitingGoods).toBe(true);
    expect(await setWaitingGoods(store, { planId: 3, value: false }, actor)).toEqual({ kind: "saved", planNo: "QP-2610-0003", before: true });
    expect(await setWaitingGoods(store, { planId: 99, value: true }, actor)).toEqual({ kind: "not_found" });
    await cancelPlan(store, { planId: 3, reason: "ยกเลิก PO", isHead: false }, actor);
    expect(await setWaitingGoods(store, { planId: 3, value: true }, actor)).toEqual({ kind: "blocked" });
  });
});

describe("planSummary (home dashboard)", () => {
  it("counts live plans, QC totals and the 90-day deadline buckets; cancelled plans are left out", async () => {
    const store = setup();
    // Invoice 2026-07-15 + 90 → 2026-10-13 (overdue on 20 Oct); 2026-07-25 → 2026-10-23 (soon); 2026-10-01 → 2026-12-30 (far).
    await openPlan(store, invoice({ docNo: "INV-OLD", invoiceDate: "2026-07-15" }), actor);
    await openPlan(store, invoice({ docNo: "INV-SOON", invoiceDate: "2026-07-25", lotQty: 80 }), actor);
    await openPlan(store, invoice({ docNo: "INV-FAR" }), actor);
    await openPlan(store, { docType: "PO", docNo: "PO-1", vendorId: 3, modelId: 3, lotQty: 5, department: "408" }, actor);
    await setWaitingGoods(store, { planId: 4, value: true }, actor);
    await cancelPlan(store, { planId: 3, reason: "เปิดผิด", isHead: false }, actor);
    expect(await store.planSummary("2026-10-20")).toEqual({
      live: 3, notStarted: 3, completed: 0, waitingGoods: 1, qcDone: 0, qcRequired: 35 + 8 + 3, deadlineSoon: 1, overdue: 1,
    });
  });
});

describe("submitPlanToQa (BR-07, FR-RPT-06)", () => {
  const dummyInspectionStore = (summary: { passCount: number; reworkCount: number; rejectCount: number; inProgressCount: number }) =>
    ({
      getPlanInspectionSummary: async () => summary,
    }) as unknown as InspectionStore;

  const inspectors = [
    { id: "7", code: "QC07", name: "สมชาย", isActive: true },
    { id: "8", code: "QC08", name: "ปรีชา", isActive: true },
  ];
  const setupWithInspectors = () => setup({ ...DEMO_MASTER, inspectors });

  it("refuses when plan is not found", async () => {
    const store = setupWithInspectors();
    const result = await submitPlanToQa(store, dummyInspectionStore({ passCount: 0, reworkCount: 0, rejectCount: 0, inProgressCount: 0 }), { planId: 999 }, actor);
    expect(result).toEqual({ kind: "not_found" });
  });

  it("refuses when plan is cancelled or completed", async () => {
    const store = setupWithInspectors();
    await openPlan(store, invoice(), actor);
    await cancelPlan(store, { planId: 1, reason: "ยกเลิก", isHead: false }, actor);
    const result = await submitPlanToQa(store, dummyInspectionStore({ passCount: 35, reworkCount: 0, rejectCount: 0, inProgressCount: 0 }), { planId: 1 }, actor);
    expect(result).toEqual({ kind: "invalid_status", status: "CANCELLED" });
  });

  it("refuses when qcDoneTotal is less than qcRequired", async () => {
    const store = setupWithInspectors();
    await openPlan(store, invoice(), actor);
    await store.openWorkOrder({ planId: 1, calledDate: "2026-10-21", calledQty: 350, remarks: null, assigneeIds: ["7", "8"], by: "7" });
    // Plan opened with lotQty 350 -> qcRequired = 35. Currently qcDoneTotal is 0.
    const result = await submitPlanToQa(store, dummyInspectionStore({ passCount: 0, reworkCount: 0, rejectCount: 0, inProgressCount: 0 }), { planId: 1 }, actor);
    expect(result).toEqual({ kind: "quota_not_met", qcDone: 0, qcRequired: 35 });
  });

  it("refuses when rework is still pending", async () => {
    const store = setupWithInspectors();
    await openPlan(store, invoice(), actor);
    // Fake the work order & record enough units
    const wo = await store.openWorkOrder({ planId: 1, calledDate: "2026-10-21", calledQty: 350, remarks: null, assigneeIds: ["7", "8"], by: "7" });
    if (wo.kind !== "opened") throw new Error("work order not opened");
    const serials = Array.from({ length: 35 }, (_, i) => `SN-${i + 1}`);
    store.recordQcDone(wo.id, serials);

    const result = await submitPlanToQa(
      store,
      dummyInspectionStore({ passCount: 33, reworkCount: 2, rejectCount: 0, inProgressCount: 0 }),
      { planId: 1 },
      actor,
    );
    expect(result).toEqual({ kind: "rework_pending", reworkCount: 2 });
  });

  it("refuses when plan has no work orders", async () => {
    const store = setupWithInspectors();
    await openPlan(store, invoice(), actor);
    // Wrap store so plan is in QC_REVIEW with quota satisfied but has 0 work orders
    const storeWithoutWo = {
      ...store,
      getPlan: async (id: number) => {
        const plan = await store.getPlan(id);
        return plan ? { ...plan, status: "QC_REVIEW" as const, qcDoneTotal: 35 } : null;
      },
      workOrdersOf: async () => [],
    };
    const result = await submitPlanToQa(
      storeWithoutWo,
      dummyInspectionStore({ passCount: 35, reworkCount: 0, rejectCount: 0, inProgressCount: 0 }),
      { planId: 1 },
      actor,
    );
    expect(result).toEqual({ kind: "no_work_orders" });
  });

  it("refuses when additional work orders opened are not completed according to Need", async () => {
    const store = setupWithInspectors();
    // Plan with lotQty 100 -> qcRequired = 10
    await openPlan(store, invoice({ lotQty: 100 }), actor);

    // Work order 1: calledQty 10 -> Need 10. Inspect 6 units first.
    const wo1 = await store.openWorkOrder({ planId: 1, calledDate: "2026-10-21", calledQty: 10, remarks: null, assigneeIds: ["7", "8"], by: "7" });
    if (wo1.kind !== "opened") throw new Error("work order 1 not opened");
    store.recordQcDone(wo1.id, Array.from({ length: 6 }, (_, i) => `SN1-${i + 1}`));

    // Additional Work order 2 (เปิดเพิ่ม): calledQty 10 -> Need is remaining (10 - 6 = 4)
    const wo2 = await store.openWorkOrder({ planId: 1, calledDate: "2026-10-22", calledQty: 10, remarks: "เปิดเพิ่ม", assigneeIds: ["7"], by: "7" });
    if (wo2.kind !== "opened") throw new Error("work order 2 not opened");
    // Only inspect 1 unit on WO 2
    store.recordQcDone(wo2.id, ["SN2-1"]);

    // Complete WO 1 with remaining 4 units -> WO 1 has 10/10 done
    store.recordQcDone(wo1.id, Array.from({ length: 4 }, (_, i) => `SN1-${i + 7}`));

    // Total inspected across plan is 10 (WO 1) + 1 (WO 2) = 11 >= qcRequired (10).
    // Plan quota is met, but WO 2 has only 1/4 done.
    const result = await submitPlanToQa(
      store,
      dummyInspectionStore({ passCount: 11, reworkCount: 0, rejectCount: 0, inProgressCount: 0 }),
      { planId: 1 },
      actor,
    );

    expect(result).toEqual({
      kind: "work_orders_incomplete",
      incompleteWorkOrders: [
        {
          woNo: wo2.woNo,
          qtyNeed: 4,
          qtyDone: 1,
          reworkCount: 0,
          status: "IN_PROGRESS",
        },
      ],
    });

    // Complete WO 2 remaining 3 units (total 4/4)
    store.recordQcDone(wo2.id, Array.from({ length: 3 }, (_, i) => `SN2-${i + 2}`));
    const finishedResult = await submitPlanToQa(
      store,
      dummyInspectionStore({ passCount: 14, reworkCount: 0, rejectCount: 0, inProgressCount: 0 }),
      { planId: 1 },
      actor,
    );
    expect(finishedResult).toMatchObject({ kind: "submitted", planNo: "QP-2610-0001" });
  });

  it("succeeds when quota is satisfied and no reworks pending, updating status to QA_PENDING", async () => {
    const store = setupWithInspectors();
    await openPlan(store, invoice(), actor);
    const wo = await store.openWorkOrder({ planId: 1, calledDate: "2026-10-21", calledQty: 350, remarks: null, assigneeIds: ["7", "8"], by: "7" });
    if (wo.kind !== "opened") throw new Error("work order not opened");
    const serials = Array.from({ length: 35 }, (_, i) => `SN-${i + 1}`);
    store.recordQcDone(wo.id, serials);

    const result = await submitPlanToQa(
      store,
      dummyInspectionStore({ passCount: 35, reworkCount: 0, rejectCount: 0, inProgressCount: 0 }),
      { planId: 1, remarks: "ตรวจครบถ้วน ส่งต่อ QA สุ่มตรวจ" },
      actor,
    );

    expect(result).toEqual({ kind: "submitted", planNo: "QP-2610-0001", from: "ASSIGNED" });
    const plan = await store.getPlan(1);
    expect(plan?.status).toBe("QA_PENDING");

    const history = await store.planHistory(1);
    expect(history).toContainEqual(
      expect.objectContaining({
        from: "ASSIGNED",
        to: "QA_PENDING",
        reason: "ตรวจครบถ้วน ส่งต่อ QA สุ่มตรวจ",
      }),
    );
  });
});

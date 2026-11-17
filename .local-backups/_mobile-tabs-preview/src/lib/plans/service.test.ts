import { describe, expect, it } from "vitest";
import { cancelPlan, openPlan, setWaitingGoods, type OpenPlanInput } from "./service";
import { createMemoryPlanStore, DEMO_MASTER } from "./store";

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
    expect(result).toEqual({ kind: "opened", planId: 1, planNo: "QP-2610-0001", headerReused: false, qcRequired: 35 });
    const plan = await store.getPlan(1);
    expect(plan).toMatchObject({
      status: "OPEN",
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

  it("treats the same Invoice number from another Vendor as another document", async () => {
    const store = setup();
    await openPlan(store, invoice(), actor);
    const other = await openPlan(store, invoice({ vendorId: 2 }), actor);
    expect(other).toMatchObject({ kind: "opened", headerReused: false });
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
    expect(result).toMatchObject({ kind: "opened", qcRequired: 1 });
    expect((await store.getPlan(1))?.doc).toMatchObject({ origin: "DOMESTIC", docNoNormalized: "PO 408/1234", department: "408", qcDeadline: null, invoiceDate: null });
  });

  it("reports every field problem at once", async () => {
    const store = setup();
    const result = await openPlan(store, { docType: "", docNo: " ", vendorId: null, modelId: 99, lotQty: 0, receiptDate: "2026-02-30" }, actor);
    expect(result).toEqual({
      kind: "invalid",
      errors: { docType: "required", docNo: "required", lotQty: "invalid", receiptDate: "invalid", vendorId: "required", modelId: "not_found" },
    });
  });

  it("requires the Invoice header on the first plan and a known department on a PO", async () => {
    const store = setup();
    expect(await openPlan(store, invoice({ invoiceDate: "", expectedSkuCount: null }), actor)).toEqual({
      kind: "invalid",
      errors: { invoiceDate: "required", expectedSkuCount: "required" },
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
  it("says new, found (with its plans) or incomplete", async () => {
    const { lookupReceiptDoc } = await import("./service");
    const store = setup();
    expect(await lookupReceiptDoc(store, { docType: "INVOICE", docNo: "", vendorId: 1 })).toEqual({ kind: "incomplete" });
    expect(await lookupReceiptDoc(store, { docType: "INVOICE", docNo: " inv-a", vendorId: 1 })).toEqual({ kind: "new", docNoNormalized: "INV-A" });
    await openPlan(store, invoice(), actor);
    expect(await lookupReceiptDoc(store, { docType: "INVOICE", docNo: "INV-A ", vendorId: 1 })).toEqual({
      kind: "found",
      docNoNormalized: "INV-A",
      header: { invoiceDate: "2026-10-01", docDate: null, expectedSkuCount: 3, department: null, qcDeadline: "2026-12-30", remarks: null },
      plans: [{ id: 1, planNo: "QP-2610-0001", modelId: 1, modelCode: "XM2525" }],
    });
    expect(await lookupReceiptDoc(store, { docType: "INVOICE", docNo: "INV-A", vendorId: 2 })).toMatchObject({ kind: "new" });
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
    expect(rows[0]).toMatchObject({ docType: "PO", qcDeadline: null, qcRequired: 1 });
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
      live: 3, notStarted: 3, completed: 0, waitingGoods: 1, qcDone: 0, qcRequired: 35 + 8 + 1, deadlineSoon: 1, overdue: 1,
    });
  });
});

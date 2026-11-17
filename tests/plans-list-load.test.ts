import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPlanStore: vi.fn() }));
vi.mock("@/lib/plans/runtime", () => ({ getPlanStore: mocks.getPlanStore }));

import { loadPlanList } from "@/lib/plans/list";
import { PLAN_PAGE_SIZE } from "@/lib/plans/list-query";
import { cancelPlan, openPlan, type OpenPlanInput } from "@/lib/plans/service";
import { createMemoryPlanStore, DEMO_MASTER, type PlanListRow } from "@/lib/plans/store";

const NOW = new Date("2026-10-21T03:00:00Z");
/** The in-memory store stamps `openedAt` with the clock, so move the (frozen) clock to the day the plan was opened. */
const open = (store: ReturnType<typeof createMemoryPlanStore>, input: OpenPlanInput, openedAt: string) => {
  const at = new Date(`${openedAt}T03:00:00Z`);
  vi.setSystemTime(at);
  return openPlan(store, input, { actorId: "7", now: at });
};

/**
 * Four plans: A (Invoice, vendor 1, Rotary, 1 Oct), B (Invoice, vendor 2, Oil-free, 10 Oct), C (PO, no vendor yet,
 * Piston, 15 Oct) and D (Invoice, vendor 1, Oil-free, 20 Oct — cancelled).
 */
async function plans() {
  const store = createMemoryPlanStore({ ...DEMO_MASTER, inspectors: [] });
  const invoice = (docNo: string, vendorId: number, modelId: number, invoiceDate: string): OpenPlanInput => ({ docType: "INVOICE", docNo, vendorId, modelId, lotQty: 500, invoiceDate, expectedSkuCount: 1 });
  const a = await open(store, invoice("INV-A", 1, 1, "2026-09-01"), "2026-10-01");
  const b = await open(store, invoice("INV-B", 2, 2, "2026-10-05"), "2026-10-10");
  const c = await open(store, { docType: "PO", docNo: "PO-7", vendorId: 3, modelId: 3, lotQty: 100, docDate: "2026-10-12", department: "408" }, "2026-10-15");
  // Opening needs a vendor now; this one is the plan whose vendor was cleared afterwards (db/013 data).
  if ("planId" in c) await store.setDocVendor(c.planId, { vendorId: null, by: "7" });
  const d = await open(store, invoice("INV-D", 1, 2, "2026-10-15"), "2026-10-20");
  for (const outcome of [a, b, c, d]) if (!("planId" in outcome)) throw new Error("plan not opened");
  vi.setSystemTime(NOW);
  await cancelPlan(store, { planId: (d as { planId: number }).planId, reason: "เปิดผิด", isHead: true }, { actorId: "7" });
  return store;
}

const docNos = (payload: { rows: { docNo: string }[] }) => payload.rows.map((row) => row.docNo);

beforeEach(() => {
  vi.resetAllMocks();
  // `today` reads the clock; freeze it so the Thai date in the answer is known.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("loadPlanList — with the in-memory store", () => {
  beforeEach(async () => {
    mocks.getPlanStore.mockReturnValue(await plans());
  });

  it("gives the live plans newest first, with the filter options and today's Thai date", async () => {
    const payload = await loadPlanList({});
    expect(docNos(payload)).toEqual(["PO-7", "INV-B", "INV-A"]);
    expect(payload).toMatchObject({ total: 3, page: 1, today: "2026-10-21" });
    expect(payload.options.vendors.map((vendor) => vendor.name)).toEqual(["PUMA (โรงงาน)", "Taizhou Aipu", "Zhejiang Hongyou"]);
    expect(payload.options.pumpTypes.map((type) => type.value)).toEqual(["Oil-free", "Piston", "Rotary"]);
  });

  it("sends openedAt as an ISO instant, because JSON has no Date", async () => {
    const [first] = (await loadPlanList({})).rows;
    expect(first.docNo).toBe("PO-7");
    expect(first.openedAt).toBe("2026-10-15T03:00:00.000Z");
  });

  it("searches the plan number, document number, model code and vendor name, ignoring case", async () => {
    const { rows } = await loadPlanList({});
    expect(docNos(await loadPlanList({ q: "inv-a" }))).toEqual(["INV-A"]);
    expect(docNos(await loadPlanList({ q: "pp-32" }))).toEqual(["PO-7"]);
    expect(docNos(await loadPlanList({ q: "taizhou" }))).toEqual(["INV-B"]);
    expect(docNos(await loadPlanList({ q: rows.find((row) => row.docNo === "INV-A")!.planNo }))).toEqual(["INV-A"]);
  });

  it("filters by checklist status — the cancelled plans only when asked for", async () => {
    expect(docNos(await loadPlanList({ status: "CANCELLED" }))).toEqual(["INV-D"]);
    expect(docNos(await loadPlanList({ status: "NOT_INSPECTED" }))).toEqual(["PO-7", "INV-B", "INV-A"]);
    expect(docNos(await loadPlanList({ status: "DONE" }))).toEqual([]);
  });

  it("filters by vendor: one vendor, or the plans whose document has none yet", async () => {
    expect(docNos(await loadPlanList({ vendor: "1" }))).toEqual(["INV-A"]);
    expect(docNos(await loadPlanList({ vendor: "none" }))).toEqual(["PO-7"]);
  });

  it("filters by pump type", async () => {
    expect(docNos(await loadPlanList({ ptype: "Oil-free" }))).toEqual(["INV-B"]);
    expect(docNos(await loadPlanList({ ptype: "Rotary" }))).toEqual(["INV-A"]);
  });

  it("filters by the Thai day a plan was opened, both ends included, and accepts the dates reversed", async () => {
    expect(docNos(await loadPlanList({ from: "2026-10-10", to: "2026-10-15" }))).toEqual(["PO-7", "INV-B"]);
    expect(docNos(await loadPlanList({ from: "2026-10-15", to: "2026-10-10" }))).toEqual(["PO-7", "INV-B"]);
    expect(docNos(await loadPlanList({ from: "2026-10-11" }))).toEqual(["PO-7"]);
  });

  it("sorts by plan number, or by the nearest 90-day deadline with the PO (which has none) last", async () => {
    expect(docNos(await loadPlanList({ sort: "plan_no" }))).toEqual(["INV-A", "INV-B", "PO-7"]);
    expect(docNos(await loadPlanList({ sort: "deadline" }))).toEqual(["INV-A", "INV-B", "PO-7"]);
    expect(docNos(await loadPlanList({}))).toEqual(["PO-7", "INV-B", "INV-A"]);
  });
});

describe("loadPlanList — with a stand-in store", () => {
  const listPlans = vi.fn();
  const planFilterOptions = vi.fn();
  beforeEach(() => {
    listPlans.mockReset().mockResolvedValue({ rows: [], total: 120 });
    planFilterOptions.mockReset().mockResolvedValue({ vendors: [], pumpTypes: [] });
    mocks.getPlanStore.mockReturnValue({ listPlans, planFilterOptions });
  });

  it("passes the page and page size to the store and reports the page it asked for", async () => {
    const payload = await loadPlanList({ page: "3" });
    expect(listPlans).toHaveBeenCalledWith(expect.objectContaining({ page: 3, pageSize: PLAN_PAGE_SIZE }));
    expect(payload).toMatchObject({ page: 3, total: 120 });
  });

  it("falls back to no filter for values it does not know", async () => {
    await loadPlanList({ status: "toString", vendor: "1; DROP", from: "2026-02-30", sort: "evil", page: "-3" });
    expect(listPlans).toHaveBeenCalledWith({ q: "", statuses: null, vendorId: null, pumpType: null, from: null, to: null, sort: "opened", page: 1, pageSize: PLAN_PAGE_SIZE });
  });

  it("sends only what the list draws", async () => {
    const row = {
      id: 5,
      planNo: "QP-2610-0005",
      status: "OPEN",
      docType: "INVOICE",
      docNo: "INV-5",
      vendorName: "ACME",
      modelCode: "XM2525",
      pumpType: "Rotary",
      lotQty: 300,
      qcDoneTotal: 0,
      qcRequired: 30,
      qcDeadline: "2026-12-01",
      waitingGoods: false,
      openedAt: new Date("2026-10-20T03:00:00Z"),
      secret: "ไม่ควรออกไป",
    } as PlanListRow;
    listPlans.mockResolvedValue({ rows: [row], total: 1 });
    const payload = await loadPlanList({});
    expect(Object.keys(payload.rows[0]).sort()).toEqual(
      ["docNo", "docType", "id", "lotQty", "modelCode", "openedAt", "planNo", "pumpType", "qcDeadline", "qcDoneTotal", "qcRequired", "status", "vendorName", "waitingGoods"],
    );
    expect(JSON.stringify(payload)).not.toContain("ไม่ควรออกไป");
  });

  it("lets the database's errors through for the route to answer", async () => {
    const outage = new Error("down");
    listPlans.mockRejectedValue(outage);
    await expect(loadPlanList({})).rejects.toBe(outage);
    listPlans.mockResolvedValue({ rows: [], total: 0 });
    planFilterOptions.mockRejectedValue(outage);
    await expect(loadPlanList({})).rejects.toBe(outage);
  });
});

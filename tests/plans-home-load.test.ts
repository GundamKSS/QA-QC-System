import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPlanStore: vi.fn() }));
vi.mock("@/lib/plans/runtime", () => ({ getPlanStore: mocks.getPlanStore }));

import type { Role, SessionUser } from "@/lib/auth/types";
import { homeAccess, loadHomeDashboard } from "@/lib/plans/home";
import { HOME_DEADLINE_LIMIT, HOME_RECENT_LIMIT } from "@/lib/plans/home-query";
import { PLAN_STATUSES } from "@/lib/plans/rules";
import { cancelPlan, openPlan, setWaitingGoods, type OpenPlanInput } from "@/lib/plans/service";
import { createMemoryPlanStore, DEMO_MASTER, type PlanListRow } from "@/lib/plans/store";

const NOW = new Date("2026-10-21T03:00:00Z");
const user = (roles: Role[]): SessionUser => ({ id: "21", employeeCode: "TRW0021", fullName: "คน ก", roles, mustChangePassword: false });
const head = user(["QC_HEAD"]);

/** The in-memory store stamps `openedAt` with the clock, so move the (frozen) clock to the day the plan was opened. */
const open = (store: ReturnType<typeof createMemoryPlanStore>, input: OpenPlanInput, openedAt: string) => {
  const at = new Date(`${openedAt}T03:00:00Z`);
  vi.setSystemTime(at);
  return openPlan(store, input, { actorId: "7", now: at });
};

/**
 * Today is 21 Oct. A: Invoice, deadline 30 Aug (overdue). B: Invoice, deadline 28 Oct (soon). C: Invoice, deadline
 * 13 Jan, "รอของ". D: PO, no deadline. E: Invoice, cancelled. Lots 500 / 300 / 400 / 100 → QC 50 / 30 / 40 / 10.
 */
async function plans() {
  const store = createMemoryPlanStore({ ...DEMO_MASTER, inspectors: [] });
  const invoice = (docNo: string, vendorId: number, modelId: number, lotQty: number, invoiceDate: string): OpenPlanInput => ({ docType: "INVOICE", docNo, vendorId, modelId, lotQty, invoiceDate, expectedSkuCount: 1 });
  const opened = [
    await open(store, invoice("INV-A", 1, 1, 500, "2026-06-01"), "2026-10-01"),
    await open(store, invoice("INV-B", 2, 2, 300, "2026-07-30"), "2026-10-10"),
    await open(store, invoice("INV-C", 1, 3, 400, "2026-10-15"), "2026-10-15"),
    await open(store, { docType: "PO", docNo: "PO-D", vendorId: 3, modelId: 3, lotQty: 100, department: "408" }, "2026-10-18"),
    await open(store, invoice("INV-E", 3, 1, 250, "2026-10-01"), "2026-10-19"),
  ];
  const ids = opened.map((outcome) => {
    if (!("planId" in outcome)) throw new Error("plan not opened");
    return outcome.planId;
  });
  vi.setSystemTime(NOW);
  await setWaitingGoods(store, { planId: ids[2], value: true }, { actorId: "7" });
  await cancelPlan(store, { planId: ids[4], reason: "เปิดผิด", isHead: true }, { actorId: "7" });
  return store;
}

const docNos = (rows: { docNo: string }[] | null) => rows?.map((row) => row.docNo) ?? null;
const loaded = async (who: SessionUser, query: Record<string, string | string[] | undefined> = {}) => {
  const result = await loadHomeDashboard(who, query);
  if (result.kind !== "loaded") throw new Error("expected the dashboard");
  return result.payload;
};

beforeEach(() => {
  vi.resetAllMocks();
  // `today` reads the clock; freeze it so the totals and countdowns are known.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("homeAccess", () => {
  it("gives plan viewers the totals and the plan rows", () => {
    for (const role of ["QC_HEAD", "QA_HEAD", "ADMIN"] as const) expect(homeAccess([role])).toEqual({ seesPlans: true, seesSummary: true });
  });

  it("gives the dashboard roles the totals only", () => {
    for (const role of ["PURCHASING", "PM", "MANAGEMENT"] as const) expect(homeAccess([role])).toEqual({ seesPlans: false, seesSummary: true });
  });

  it("gives anyone else neither", () => {
    for (const role of ["QC_INSPECTOR", "QA_INSPECTOR", "MASTERDATA_ADMIN"] as const) expect(homeAccess([role])).toEqual({ seesPlans: false, seesSummary: false });
  });

  it("follows the best of several roles", () => {
    expect(homeAccess(["QC_INSPECTOR", "PM"])).toEqual({ seesPlans: false, seesSummary: true });
    expect(homeAccess(["MASTERDATA_ADMIN", "QC_HEAD"])).toEqual({ seesPlans: true, seesSummary: true });
  });
});

describe("loadHomeDashboard — with the in-memory store", () => {
  beforeEach(async () => {
    mocks.getPlanStore.mockReturnValue(await plans());
  });

  it("gives a QC Head the totals, the newest plans and the nearest deadlines", async () => {
    const payload = await loaded(head);
    expect(payload.today).toBe("2026-10-21");
    expect(payload.summary).toEqual({ live: 4, notStarted: 4, completed: 0, waitingGoods: 1, qcDone: 0, qcRequired: 130, deadlineSoon: 1, overdue: 1 });
    expect(payload.recent?.total).toBe(4);
    expect(docNos(payload.recent?.rows ?? null)).toEqual(["PO-D", "INV-C", "INV-B", "INV-A"]);
    expect(docNos(payload.deadlines)).toEqual(["INV-A", "INV-B", "INV-C"]);
  });

  it("leaves the cancelled plan out of the totals and both lists", async () => {
    const payload = await loaded(head);
    const everything = [...(payload.recent?.rows ?? []), ...(payload.deadlines ?? [])].map((row) => row.docNo);
    expect(everything).not.toContain("INV-E");
  });

  it("searches only the recent plans", async () => {
    const payload = await loaded(head, { q: "inv-b" });
    expect(docNos(payload.recent?.rows ?? null)).toEqual(["INV-B"]);
    expect(payload.recent?.total).toBe(1);
    expect(payload.summary.live).toBe(4);
    expect(docNos(payload.deadlines)).toEqual(["INV-A", "INV-B", "INV-C"]);
  });

  it("treats a repeated or blank q as no search", async () => {
    expect(docNos((await loaded(head, { q: ["inv-b", "x"] })).recent?.rows ?? null)).toHaveLength(4);
    expect(docNos((await loaded(head, { q: "   " })).recent?.rows ?? null)).toHaveLength(4);
  });

  it("gives the dashboard roles the totals only, without reading a single plan row", async () => {
    const store = await plans();
    const listPlans = vi.spyOn(store, "listPlans");
    mocks.getPlanStore.mockReturnValue(store);
    const payload = await loaded(user(["PM"]), { q: "inv" });
    expect(payload).toMatchObject({ recent: null, deadlines: null, today: "2026-10-21" });
    expect(payload.summary.live).toBe(4);
    expect(listPlans).not.toHaveBeenCalled();
  });

  it("refuses roles that see neither, without reading anything", async () => {
    const store = await plans();
    const planSummary = vi.spyOn(store, "planSummary");
    const listPlans = vi.spyOn(store, "listPlans");
    mocks.getPlanStore.mockReturnValue(store);
    for (const role of ["QC_INSPECTOR", "QA_INSPECTOR", "MASTERDATA_ADMIN"] as const) expect(await loadHomeDashboard(user([role]), {})).toEqual({ kind: "forbidden" });
    expect(planSummary).not.toHaveBeenCalled();
    expect(listPlans).not.toHaveBeenCalled();
  });
});

describe("loadHomeDashboard — with a stand-in store", () => {
  const planSummary = vi.fn();
  const listPlans = vi.fn();
  const summary = { live: 1, notStarted: 1, completed: 0, waitingGoods: 0, qcDone: 0, qcRequired: 10, deadlineSoon: 0, overdue: 0 };
  const row = (docNo: string, qcDeadline: string | null): PlanListRow => ({
    id: 5,
    planNo: "QP-2610-0005",
    status: "OPEN",
    docType: qcDeadline ? "INVOICE" : "PO",
    docNo,
    vendorName: "ACME",
    modelCode: "XM2525",
    pumpType: "Rotary",
    lotQty: 100,
    qcDoneTotal: 0,
    qcRequired: 10,
    qcDeadline,
    waitingGoods: false,
    openedAt: new Date("2026-10-20T03:00:00Z"),
  });

  beforeEach(() => {
    planSummary.mockReset().mockResolvedValue(summary);
    listPlans.mockReset().mockResolvedValue({ rows: [], total: 0 });
    mocks.getPlanStore.mockReturnValue({ planSummary, listPlans });
  });

  it("asks for the 8 newest plans and the 5 nearest deadlines among the live ones, counting from today", async () => {
    await loaded(head);
    expect(planSummary).toHaveBeenCalledWith("2026-10-21");
    expect(listPlans).toHaveBeenCalledWith({ q: undefined, sort: "opened", page: 1, pageSize: HOME_RECENT_LIMIT });
    expect(listPlans).toHaveBeenCalledWith({ statuses: PLAN_STATUSES.filter((status) => status !== "CANCELLED" && status !== "COMPLETED"), sort: "deadline", page: 1, pageSize: HOME_DEADLINE_LIMIT });
    const statuses = listPlans.mock.calls.map(([filter]) => filter.statuses).find(Boolean) as string[];
    expect(statuses).not.toContain("CANCELLED");
    expect(statuses).not.toContain("COMPLETED");
    expect(statuses).toContain("QC_IN_PROGRESS");
  });

  it("passes the search words trimmed", async () => {
    await loaded(head, { q: "  xm2525  " });
    expect(listPlans).toHaveBeenCalledWith(expect.objectContaining({ q: "xm2525", sort: "opened" }));
  });

  it("drops the plans without a deadline from the deadlines panel, keeping the order", async () => {
    listPlans.mockImplementation(async (filter: { sort: string }) => (filter.sort === "deadline" ? { rows: [row("INV-1", "2026-11-01"), row("PO-2", null), row("INV-3", "2026-12-01")], total: 3 } : { rows: [], total: 0 }));
    expect(docNos((await loaded(head)).deadlines)).toEqual(["INV-1", "INV-3"]);
  });

  it("sends only what the lists draw, with openedAt as an ISO instant", async () => {
    listPlans.mockResolvedValue({ rows: [{ ...row("INV-9", "2026-11-01"), secret: "ไม่ควรออกไป" }], total: 1 });
    const payload = await loaded(head);
    const [first] = payload.recent?.rows ?? [];
    expect(Object.keys(first).sort()).toEqual(
      ["docNo", "docType", "id", "lotQty", "modelCode", "openedAt", "planNo", "pumpType", "qcDeadline", "qcDoneTotal", "qcRequired", "status", "vendorName", "waitingGoods"],
    );
    expect(first.openedAt).toBe("2026-10-20T03:00:00.000Z");
    expect(JSON.stringify(payload)).not.toContain("ไม่ควรออกไป");
  });

  it("lets the database's errors through for the route to answer", async () => {
    const outage = new Error("down");
    planSummary.mockRejectedValue(outage);
    await expect(loadHomeDashboard(head, {})).rejects.toBe(outage);
    planSummary.mockResolvedValue(summary);
    listPlans.mockRejectedValue(outage);
    await expect(loadHomeDashboard(head, {})).rejects.toBe(outage);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resolveActorId: vi.fn(), dbConfigured: vi.fn(), jobs: vi.fn() }));
vi.mock("@/lib/db/actor", () => ({ resolveActorId: mocks.resolveActorId }));
vi.mock("@/lib/db/config", () => ({ dbConfigured: mocks.dbConfigured }));
vi.mock("@/lib/plans/runtime", () => ({ getPlanStore: () => ({ jobs: mocks.jobs }) }));

import type { SessionUser } from "@/lib/auth/types";
import { jobsView, loadJobs } from "@/lib/plans/jobs";
import type { JobCard } from "@/lib/plans/store";

const user = (roles: SessionUser["roles"]): SessionUser => ({ id: "11", employeeCode: "TRW0011", fullName: "คุณ ก", roles, mustChangePassword: false });
const head = user(["QC_HEAD"]);
const inspector = user(["QC_INSPECTOR"]);

const card = (id: string, status: JobCard["status"], extra: Partial<JobCard> = {}): JobCard => ({
  id,
  planId: 7,
  seq: 1,
  woNo: `QP-0007-${id}`,
  type: "QC",
  calledQty: 10,
  calledDate: "2026-10-20",
  qtyNeed: 4,
  qtyDone: 1,
  status,
  remarks: "ความลับในหมายเหตุ",
  cancelReason: null,
  assignees: [{ slot: 1, userId: "77", name: "สมศักดิ์", code: "F0001" }],
  createdAt: new Date("2026-10-20T01:00:00Z"),
  planNo: "QP-0007",
  modelCode: "MC-1",
  description: "ปั๊มลม",
  docType: "INVOICE",
  docNo: "INV-1",
  vendorName: "ACME",
  ...extra,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.dbConfigured.mockReturnValue(true);
  mocks.resolveActorId.mockResolvedValue("77");
  mocks.jobs.mockResolvedValue([]);
});

describe("jobsView", () => {
  it("gives a QC Head everyone's work orders unless they ask for their own", () => {
    expect(jobsView(["QC_HEAD"], undefined)).toBe("all");
    expect(jobsView(["QC_HEAD"], null)).toBe("all");
    expect(jobsView(["QC_HEAD"], "all")).toBe("all");
    expect(jobsView(["QC_HEAD"], "anything")).toBe("all");
    expect(jobsView(["QC_HEAD"], "mine")).toBe("mine");
  });

  it("only the exact value `mine` narrows: a repeated query value does not", () => {
    expect(jobsView(["QC_HEAD"], ["mine", "all"])).toBe("all");
  });

  it("gives everyone else their own, whatever they ask for", () => {
    for (const roles of [["QC_INSPECTOR"], ["ADMIN"], ["QA_HEAD"], ["QC_INSPECTOR", "QA_INSPECTOR"]] as const) {
      expect(jobsView(roles, "all")).toBe("mine");
      expect(jobsView(roles, undefined)).toBe("mine");
    }
  });

  it("follows the QC Head role when it comes with others", () => {
    expect(jobsView(["QC_HEAD", "QC_INSPECTOR"], undefined)).toBe("all");
  });
});

describe("loadJobs", () => {
  it("gives a QC Head everyone's work orders by default, and still says who they are", async () => {
    const payload = await loadJobs(head, null);
    expect(payload).toEqual({ view: "all", me: "77", jobs: [] });
    expect(mocks.jobs).toHaveBeenCalledWith(null, { activeOnly: true });
    expect(mocks.jobs).toHaveBeenCalledWith(null);
  });

  it("narrows a QC Head to their own work orders on request", async () => {
    const payload = await loadJobs(head, "mine");
    expect(payload.view).toBe("mine");
    expect(mocks.jobs).toHaveBeenCalledWith("77", { activeOnly: true });
    expect(mocks.jobs).toHaveBeenCalledWith("77");
  });

  it("gives a QC Inspector only their own work orders, even when they ask for all", async () => {
    const payload = await loadJobs(inspector, "all");
    expect(payload.view).toBe("mine");
    expect(mocks.jobs).toHaveBeenCalledTimes(2);
    for (const [actor] of mocks.jobs.mock.calls) expect(actor).toBe("77");
  });

  it("lists the work orders still in hand first, then the recent finished ones, without repeating", async () => {
    const active = [card("1", "IN_PROGRESS"), card("2", "RETURNED")];
    const recent = [card("1", "IN_PROGRESS"), card("3", "SUBMITTED"), card("4", "CANCELLED"), card("2", "RETURNED"), card("5", "CLOSED")];
    mocks.jobs.mockImplementation(async (_actor: string | null, options?: { activeOnly?: boolean }) => (options?.activeOnly ? active : recent));
    const payload = await loadJobs(inspector, null);
    expect(payload.jobs.map((job) => job.id)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("sends only what the screen draws — no remarks, plan number, creation time or employee codes", async () => {
    mocks.jobs.mockResolvedValue([card("1", "IN_PROGRESS")]);
    const payload = await loadJobs(inspector, null);
    expect(payload.jobs[0]).toEqual({
      id: "1",
      planId: 7,
      woNo: "QP-0007-1",
      type: "QC",
      calledQty: 10,
      calledDate: "2026-10-20",
      qtyNeed: 4,
      qtyDone: 1,
      status: "IN_PROGRESS",
      modelCode: "MC-1",
      description: "ปั๊มลม",
      docType: "INVOICE",
      docNo: "INV-1",
      vendorName: "ACME",
      assignees: [{ userId: "77", name: "สมศักดิ์" }],
    });
    const text = JSON.stringify(payload);
    for (const hidden of ["ความลับ", "F0001", "QP-0007\"", "createdAt", "remarks"]) expect(text).not.toContain(hidden);
  });

  it("gives an inspector with no users row an empty list, without asking the store", async () => {
    mocks.resolveActorId.mockResolvedValue(null);
    expect(await loadJobs(inspector, null)).toEqual({ view: "mine", me: null, jobs: [] });
    expect(mocks.jobs).not.toHaveBeenCalled();
  });

  it("still gives a QC Head with no users row everyone's work orders", async () => {
    mocks.resolveActorId.mockResolvedValue(null);
    mocks.jobs.mockResolvedValue([card("1", "IN_PROGRESS")]);
    const payload = await loadJobs(head, null);
    expect(payload).toMatchObject({ view: "all", me: null });
    expect(payload.jobs).toHaveLength(1);
    expect(mocks.jobs).toHaveBeenCalledWith(null, { activeOnly: true });
  });

  it("uses the session id as the user when no database is configured", async () => {
    mocks.dbConfigured.mockReturnValue(false);
    const payload = await loadJobs(inspector, null);
    expect(payload.me).toBe("11");
    expect(mocks.resolveActorId).not.toHaveBeenCalled();
    expect(mocks.jobs).toHaveBeenCalledWith("11", { activeOnly: true });
  });

  it("lets the database's errors through for the route to answer", async () => {
    const outage = new Error("down");
    mocks.jobs.mockRejectedValue(outage);
    await expect(loadJobs(head, null)).rejects.toBe(outage);
    mocks.resolveActorId.mockRejectedValue(outage);
    await expect(loadJobs(inspector, null)).rejects.toBe(outage);
  });
});

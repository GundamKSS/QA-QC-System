import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), resolveActorId: vi.fn(), jobs: vi.fn() }));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/actor", () => ({ resolveActorId: mocks.resolveActorId }));
vi.mock("@/lib/db/config", () => ({ dbConfigured: () => true }));
vi.mock("@/lib/plans/runtime", () => ({ getPlanStore: () => ({ jobs: mocks.jobs }) }));

import { GET } from "@/app/api/jobs/route";
import { authPolicy } from "@/lib/config/auth";

const qcHead = { id: "11", employeeCode: "TRW0011", fullName: "หัวหน้า QC", roles: ["QC_HEAD"], mustChangePassword: false };
const outage = Object.assign(new Error("raw"), { name: "ConnectionError", code: "ECONNREFUSED" });
const get = (query = "") => GET(new Request(`http://localhost:3000/api/jobs${query}`, { headers: { "sec-fetch-site": "same-origin" } }));
const touchedStore = () => mocks.resolveActorId.mock.calls.length + mocks.jobs.mock.calls.length;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue(qcHead);
  mocks.resolveActorId.mockResolvedValue("77");
  mocks.jobs.mockResolvedValue([]);
});

describe("GET /api/jobs — access", () => {
  it("answers 401 with the sign-in address for a signed-out browser, touching nothing", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await get();
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ status: "error", redirectTo: "/login?next=%2Fjobs" });
    expect(touchedStore()).toBe(0);
  });

  it("sends someone who still owes a PIN change to the change-PIN page", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...qcHead, mustChangePassword: true });
    const response = await get();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ status: "error", redirectTo: authPolicy.changePasswordPath });
    expect(touchedStore()).toBe(0);
  });

  it.each(["QA_HEAD", "QA_INSPECTOR", "ADMIN", "PM", "MASTER_ADMIN", "PURCHASING", "MANAGEMENT"])("refuses %s: only QC Head and QC Inspector have work orders", async (role) => {
    mocks.getCurrentUser.mockResolvedValue({ ...qcHead, roles: [role] });
    expect((await get()).status).toBe(403);
    expect(touchedStore()).toBe(0);
  });

  it.each(["QC_HEAD", "QC_INSPECTOR"])("lets %s read", async (role) => {
    mocks.getCurrentUser.mockResolvedValue({ ...qcHead, roles: [role] });
    expect((await get()).status).toBe(200);
  });
});

describe("GET /api/jobs — answer", () => {
  it("is the data itself (no status wrapper) and is never cached or shared", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Cookie");
    expect(await response.json()).toEqual({ view: "all", me: "77", jobs: [], reworks: [] });
  });

  it("gives a QC Head everyone's work orders unless `view=mine`", async () => {
    await get();
    expect(mocks.jobs).toHaveBeenCalledWith(null, { activeOnly: true });
    mocks.jobs.mockClear();
    const response = await get("?view=mine");
    expect((await response.json()).view).toBe("mine");
    expect(mocks.jobs).toHaveBeenCalledWith("77", { activeOnly: true });
  });

  it("gives a QC Inspector their own, even when the query asks for all", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...qcHead, roles: ["QC_INSPECTOR"] });
    const response = await get("?view=all");
    expect((await response.json()).view).toBe("mine");
    for (const [actor] of mocks.jobs.mock.calls) expect(actor).toBe("77");
  });

  it("ignores other query values, like the page's `notification` marker", async () => {
    const response = await get("?view=mine&notification=501%3AIN_PROGRESS");
    expect(response.status).toBe(200);
    expect((await response.json()).view).toBe("mine");
  });

  it("answers a database outage as a 503 sentence, and a real bug as a thrown error", async () => {
    mocks.jobs.mockRejectedValue(outage);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await get();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toMatchObject({ status: "error" });
    expect(body.message).toContain("เชื่อมต่อฐานข้อมูลไม่ได้");
    expect(JSON.stringify(body)).not.toContain("ECONNREFUSED");
    log.mockRestore();

    mocks.jobs.mockRejectedValue(new TypeError("bug"));
    await expect(get()).rejects.toThrow("bug");
  });
});
